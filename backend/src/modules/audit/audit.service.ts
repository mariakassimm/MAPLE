import type { Request } from 'express';
import { logger } from '../../config/logger';
import { AuditLog } from './auditLog.model';

export interface AuditEntry {
  actorId?: string;
  actorRole?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
  requestId?: string;
}

const SENSITIVE_KEY = /pass|token|secret|cookie|authorization/i;

// Callers pass free-form metadata, so secrets are stripped here rather than trusting every call site.
const scrub = (meta?: Record<string, unknown>) =>
  meta ? Object.fromEntries(Object.entries(meta).filter(([key]) => !SENSITIVE_KEY.test(key))) : undefined;

// A failed audit write is logged but does not roll back the action; revisit once financial actions are audited.
export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    await AuditLog.create({ ...entry, metadata: scrub(entry.metadata) });
  } catch (err) {
    logger.error({ err, action: entry.action }, 'failed to write audit log');
  }
}

export const auditContext = (
  req: Request,
): Pick<AuditEntry, 'actorId' | 'actorRole' | 'ip' | 'userAgent' | 'requestId'> => ({
  actorId: req.auth?.userId,
  actorRole: req.auth?.role,
  ip: req.ip,
  userAgent: req.get('user-agent')?.slice(0, 300),
  requestId: req.requestId,
});
