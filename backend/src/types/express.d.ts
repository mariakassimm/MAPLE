import type { Role } from '../common/permissions';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      auth?: { userId: string; role: Role; sessionId: string; csrfToken: string };
    }
  }
}

export {};
