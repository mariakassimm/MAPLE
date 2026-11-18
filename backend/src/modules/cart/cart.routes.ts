import { Router } from 'express';
import { requireCustomer } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as ctrl from './cart.controller';
import { getCartQuerySchema, priceCartSchema, saveCartSchema } from './cart.schemas';

export const cartRouter = Router();

cartRouter.post('/price', validate({ body: priceCartSchema }), ctrl.price);
cartRouter.get('/', requireCustomer, validate({ query: getCartQuerySchema }), ctrl.get);
cartRouter.put('/', requireCustomer, validate({ body: saveCartSchema }), ctrl.save);
cartRouter.delete('/', requireCustomer, ctrl.clear);
