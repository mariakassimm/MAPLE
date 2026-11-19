import pino from 'pino';
import { env } from './env';

export const logger = pino({
  level: env.NODE_ENV === 'test' && !process.env.TEST_LOGS ? 'silent' : env.LOG_LEVEL,
  // Belt and braces: handlers should never log secrets, but if one slips in it is masked.
  redact: {
    paths: [
      '*.password',
      '*.newPassword',
      '*.currentPassword',
      '*.token',
      '*.passwordHash',
      'req.headers.cookie',
      'req.headers.authorization',
    ],
    censor: '[REDACTED]',
  },
  transport:
    env.NODE_ENV === 'development' && !process.env.VERCEL
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
});
