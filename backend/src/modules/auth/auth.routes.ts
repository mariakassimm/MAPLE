import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { authLimiter } from '../../middleware/rateLimit';
import { validate } from '../../middleware/validate';
import * as ctrl from './auth.controller';
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from './auth.schemas';

export const authRouter = Router();

authRouter.post('/register', authLimiter, validate({ body: registerSchema }), ctrl.register);
authRouter.post('/login', authLimiter, validate({ body: loginSchema }), ctrl.login);
authRouter.post('/logout', ctrl.logout);
authRouter.post('/forgot-password', authLimiter, validate({ body: forgotPasswordSchema }), ctrl.forgotPassword);
authRouter.post('/reset-password', authLimiter, validate({ body: resetPasswordSchema }), ctrl.resetPassword);
authRouter.post('/verify-email', authLimiter, validate({ body: verifyEmailSchema }), ctrl.verifyEmail);
authRouter.post('/resend-verification', authLimiter, requireAuth, ctrl.resendVerification);
authRouter.get('/me', requireAuth, ctrl.me);
