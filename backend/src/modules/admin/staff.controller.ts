import { asyncHandler } from '../../common/asyncHandler';
import { sendOk } from '../../common/response';
import { auditContext, recordAudit } from '../audit/audit.service';
import { toPublicUser } from '../users/user.model';
import * as staffService from './staff.service';

export const list = asyncHandler(async (_req, res) => {
  const staff = await staffService.listStaff();
  sendOk(res, { staff: staff.map(toPublicUser) });
});

export const create = asyncHandler(async (req, res) => {
  const user = await staffService.createStaff(req.body);
  await recordAudit({
    ...auditContext(req),
    action: 'staff.create',
    resourceType: 'user',
    resourceId: String(user._id),
    metadata: { email: user.email, role: user.role },
  });
  sendOk(res, { user: toPublicUser(user) }, 201);
});

export const update = asyncHandler(async (req, res) => {
  const { user, before } = await staffService.updateStaff(req.params.id as string, req.body, req.auth!.userId);
  await recordAudit({
    ...auditContext(req),
    action: 'staff.update',
    resourceType: 'user',
    resourceId: String(user._id),
    metadata: { before, after: { role: user.role, status: user.status } },
  });
  sendOk(res, { user: toPublicUser(user) });
});
