import { Schema, model, type Types } from 'mongoose';

export interface ICart {
  userId: Types.ObjectId;
  items: { variantId: Types.ObjectId; quantity: number }[];
  updatedAt?: Date;
}

// Only signed-in customers get a server-side cart. Guests keep lines in the browser and have them
// re-priced by POST /cart/price, so there is no guest-cart cookie to forge or steal.
const schema = new Schema<ICart>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    items: {
      type: [
        new Schema(
          {
            variantId: { type: Schema.Types.ObjectId, required: true },
            quantity: { type: Number, required: true, min: 1, max: 99 },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
  },
  { timestamps: true },
);

export const Cart = model<ICart>('Cart', schema);
