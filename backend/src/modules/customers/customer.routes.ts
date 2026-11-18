import { Router } from 'express';
import { Schema, model, type Types } from 'mongoose';
import { z } from 'zod';
import { asyncHandler } from '../../common/asyncHandler';
import { AppError } from '../../common/errors';
import { pageMeta } from '../../common/pagination';
import { sendOk } from '../../common/response';
import { escapeRegex } from '../../common/text';
import { idParamSchema, normalizePkMobile } from '../../common/validators';
import { requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { Address } from '../account/address.model';
import { auditContext, recordAudit } from '../audit/audit.service';
import { Order, type OrderLean } from '../orders/order.model';
import { toAdminOrderListItem } from '../orders/order.serializer';
import { Return } from '../returns/return.model';
import { User, toPublicUser } from '../users/user.model';

interface INote {
  customerId: Types.ObjectId;
  authorId: Types.ObjectId;
  authorName: string;
  body: string;
  createdAt?: Date;
}
// Append-only: support notes are never edited or deleted, so the history of who said what stays trustworthy.
const noteSchema = new Schema<INote>(
  {
    customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    authorName: { type: String, required: true },
    body: { type: String, required: true, maxlength: 1000 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
export const CustomerNote = model<INote>('CustomerNote', noteSchema);

const paging = {
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
};

export const customersAdminRouter = Router();
customersAdminRouter.use(requirePermission('customers:read'));

customersAdminRouter.get(
  '/',
  validate({ query: z.object({ ...paging, q: z.string().trim().min(1).max(100).optional() }) }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as { page: number; limit: number; q?: string };
    const match: Record<string, unknown> = { role: 'customer' };
    if (q.q) {
      const rx = new RegExp(escapeRegex(q.q), 'i');
      const phone = normalizePkMobile(q.q);
      match.$or = [{ name: rx }, { email: rx }, { phone: rx }, ...(phone ? [{ phone }] : [])];
    }
    const [rows, total] = await Promise.all([
      User.aggregate<{
        _id: Types.ObjectId;
        name: string;
        email: string;
        phone?: string;
        emailVerified: boolean;
        status: string;
        createdAt: Date;
        stats: { orders: number; spent: number; last: Date }[];
      }>([
        { $match: match },
        { $sort: { createdAt: -1, _id: -1 } },
        { $skip: (q.page - 1) * q.limit },
        { $limit: q.limit },
        {
          $lookup: {
            from: 'orders',
            let: { uid: '$_id' },
            pipeline: [
              { $match: { $expr: { $eq: ['$userId', '$$uid'] }, status: { $ne: 'cancelled' } } },
              { $group: { _id: null, orders: { $sum: 1 }, spent: { $sum: '$total' }, last: { $max: '$createdAt' } } },
            ],
            as: 'stats',
          },
        },
        { $project: { name: 1, email: 1, phone: 1, emailVerified: 1, status: 1, createdAt: 1, stats: 1 } },
      ]),
      User.countDocuments(match),
    ]);
    sendOk(res, {
      items: rows.map((r) => ({
        id: String(r._id),
        name: r.name,
        email: r.email,
        phone: r.phone ?? null,
        emailVerified: r.emailVerified,
        status: r.status,
        joinedAt: r.createdAt,
        orders: r.stats[0]?.orders ?? 0,
        totalSpent: r.stats[0]?.spent ?? 0,
        lastOrderAt: r.stats[0]?.last ?? null,
      })),
      pagination: pageMeta(q.page, q.limit, total),
    });
  }),
);

customersAdminRouter.get(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const user = await User.findOne({ _id: req.params.id, role: 'customer' });
    if (!user) throw new AppError(404, 'NOT_FOUND', 'Customer not found.');
    const [orders, addresses, returns, notes] = await Promise.all([
      Order.find({ userId: user._id }).sort({ createdAt: -1 }).lean<OrderLean[]>(),
      Address.countDocuments({ userId: user._id }),
      Return.countDocuments({ userId: user._id }),
      CustomerNote.find({ customerId: user._id }).sort({ createdAt: -1 }).lean(),
    ]);
    const counted = orders.filter((o) => o.status !== 'cancelled');
    sendOk(res, {
      customer: { ...toPublicUser(user), lastLoginAt: user.lastLoginAt ?? null },
      stats: {
        orders: counted.length,
        totalSpent: counted.reduce((n, o) => n + o.total, 0),
        cancelled: orders.length - counted.length,
        addresses,
        returns,
      },
      recentOrders: orders.slice(0, 10).map(toAdminOrderListItem),
      notes: notes.map((n) => ({ id: String(n._id), body: n.body, author: n.authorName, createdAt: n.createdAt })),
    });
  }),
);

customersAdminRouter.post(
  '/:id/notes',
  requirePermission('customers:notes'),
  validate({ params: idParamSchema, body: z.object({ body: z.string().trim().min(2).max(1000) }).strict() }),
  asyncHandler(async (req, res) => {
    const customer = await User.findOne({ _id: req.params.id, role: 'customer' }).select('_id');
    if (!customer) throw new AppError(404, 'NOT_FOUND', 'Customer not found.');
    const author = await User.findById(req.auth!.userId).select('name');
    const note = await CustomerNote.create({
      customerId: customer._id,
      authorId: req.auth!.userId,
      authorName: author?.name ?? 'Staff',
      body: req.body.body,
    });
    await recordAudit({
      ...auditContext(req),
      action: 'customer.note',
      resourceType: 'user',
      resourceId: String(customer._id),
    });
    sendOk(
      res,
      { note: { id: String(note._id), body: note.body, author: note.authorName, createdAt: note.createdAt } },
      201,
    );
  }),
);
