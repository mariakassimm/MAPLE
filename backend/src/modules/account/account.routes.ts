import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../../common/errors';
import { asyncHandler } from '../../common/asyncHandler';
import { PROVINCES } from '../../common/geo';
import { sendOk } from '../../common/response';
import { idParamSchema, nameSchema, passwordSchema, pkMobileSchema } from '../../common/validators';
import { requireAuth, requireCustomer } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { Session } from '../auth/session.model';
import { Address, toAddressDto, type AddressLean } from './address.model';
import { User, toPublicUser } from '../users/user.model';
import { hashPassword } from '../users/user.service';

const MAX_ADDRESSES = 10;

const profileSchema = z
  .object({ name: nameSchema.optional(), phone: pkMobileSchema.nullable().optional() })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one field');
const changePasswordSchema = z
  .object({ currentPassword: z.string().min(1).max(200), newPassword: passwordSchema })
  .strict();

const addressFields = {
  label: z.string().trim().min(1).max(30),
  recipientName: nameSchema,
  phone: pkMobileSchema,
  province: z.enum(PROVINCES),
  city: z.string().trim().min(2).max(60),
  area: z.string().trim().min(2).max(100),
  line1: z.string().trim().min(5, 'Enter the full delivery address').max(200),
  postalCode: z
    .string()
    .trim()
    .regex(/^\d{5}$/, 'Postal code must be 5 digits'),
  notes: z.string().trim().max(200),
  isDefault: z.boolean(),
};
const createAddressSchema = z
  .object({
    ...addressFields,
    label: addressFields.label.optional(),
    postalCode: addressFields.postalCode.optional(),
    notes: addressFields.notes.optional(),
    isDefault: addressFields.isDefault.optional(),
  })
  .strict();
const updateAddressSchema = z
  .object(addressFields)
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one field');

export const accountRouter = Router();
accountRouter.use(requireAuth);

accountRouter.get(
  '/profile',
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.auth!.userId);
    if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Please sign in to continue.');
    sendOk(res, { user: toPublicUser(user) });
  }),
);

accountRouter.patch(
  '/profile',
  validate({ body: profileSchema }),
  asyncHandler(async (req, res) => {
    const { name, phone } = req.body as { name?: string; phone?: string | null };
    const user = await User.findById(req.auth!.userId);
    if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Please sign in to continue.');
    if (name !== undefined) user.name = name;
    if (phone !== undefined) user.phone = phone ?? undefined;
    await user.save();
    sendOk(res, { user: toPublicUser(user) });
  }),
);

accountRouter.post(
  '/change-password',
  validate({ body: changePasswordSchema }),
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.auth!.userId).select('+passwordHash');
    if (!user || !(await bcrypt.compare(req.body.currentPassword, user.passwordHash))) {
      throw new AppError(400, 'BAD_REQUEST', 'Your current password is not correct.');
    }
    user.passwordHash = await hashPassword(req.body.newPassword);
    await user.save();
    // Every other device is signed out; this one stays.
    await Session.deleteMany({ userId: user._id, _id: { $ne: req.auth!.sessionId } });
    sendOk(res, { changed: true });
  }),
);

// ---------------------------------------------------------------- addresses (shoppers only)
accountRouter.use('/addresses', requireCustomer);
const mine = (req: { auth?: { userId: string } }) => ({ userId: req.auth!.userId });

accountRouter.get(
  '/addresses',
  asyncHandler(async (req, res) => {
    const items = await Address.find(mine(req)).sort({ isDefault: -1, createdAt: -1 }).lean<AddressLean[]>();
    sendOk(res, { addresses: items.map(toAddressDto) });
  }),
);

accountRouter.post(
  '/addresses',
  validate({ body: createAddressSchema }),
  asyncHandler(async (req, res) => {
    const count = await Address.countDocuments(mine(req));
    if (count >= MAX_ADDRESSES) throw new AppError(409, 'CONFLICT', `You can save up to ${MAX_ADDRESSES} addresses.`);
    // The first address is the default; asking for a new default demotes the old one.
    const makeDefault = count === 0 || req.body.isDefault === true;
    if (makeDefault) await Address.updateMany(mine(req), { $set: { isDefault: false } });
    const address = await Address.create({ ...req.body, userId: req.auth!.userId, isDefault: makeDefault });
    sendOk(res, { address: toAddressDto(address.toObject()) }, 201);
  }),
);

accountRouter.patch(
  '/addresses/:id',
  validate({ params: idParamSchema, body: updateAddressSchema }),
  asyncHandler(async (req, res) => {
    const address = await Address.findOne({ _id: req.params.id, ...mine(req) });
    if (!address) throw new AppError(404, 'NOT_FOUND', 'Address not found.');
    if (req.body.isDefault === true)
      await Address.updateMany({ ...mine(req), _id: { $ne: address._id } }, { $set: { isDefault: false } });
    if (req.body.isDefault === false && address.isDefault)
      throw new AppError(400, 'BAD_REQUEST', 'Choose another address as the default instead.');
    address.set(req.body);
    await address.save();
    sendOk(res, { address: toAddressDto(address.toObject()) });
  }),
);

accountRouter.delete(
  '/addresses/:id',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const address = await Address.findOneAndDelete({ _id: req.params.id, ...mine(req) });
    if (!address) throw new AppError(404, 'NOT_FOUND', 'Address not found.');
    if (address.isDefault) {
      const next = await Address.findOne(mine(req)).sort({ createdAt: -1 });
      if (next) await Address.updateOne({ _id: next._id }, { $set: { isDefault: true } });
    }
    sendOk(res, { deleted: true });
  }),
);
