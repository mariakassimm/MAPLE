import { AppError } from '../../common/errors';
import { ASSIGNABLE_STAFF_ROLES, STAFF_ROLES } from '../../common/permissions';
import { revokeUserSessions } from '../auth/auth.service';
import { User } from '../users/user.model';
import { insertUser } from '../users/user.service';

type AssignableRole = (typeof ASSIGNABLE_STAFF_ROLES)[number];

export const listStaff = () => User.find({ role: { $in: [...STAFF_ROLES] } }).sort({ createdAt: -1 });

export const createStaff = (input: {
  name: string;
  email: string;
  phone?: string;
  password: string;
  role: AssignableRole;
}) => insertUser(input);

export async function updateStaff(
  targetId: string,
  patch: { role?: AssignableRole; status?: 'active' | 'suspended' },
  actorId: string,
) {
  // Blocking self-edits stops a lone admin from demoting or locking themselves out by mistake.
  if (targetId === actorId) throw new AppError(400, 'BAD_REQUEST', 'You cannot change your own role or status.');

  const target = await User.findById(targetId);
  if (!target || target.role === 'customer') throw new AppError(404, 'NOT_FOUND', 'Staff member not found.');
  if (target.role === 'super_admin')
    throw new AppError(403, 'FORBIDDEN', 'Super admin accounts cannot be modified through the API.');

  const before = { role: target.role, status: target.status };
  if (patch.role) target.role = patch.role;
  if (patch.status) target.status = patch.status;
  await target.save();

  // Existing sessions would otherwise keep working until they expire.
  if (target.role !== before.role || target.status === 'suspended') await revokeUserSessions(targetId);
  return { user: target, before };
}
