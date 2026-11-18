import { env } from '../config/env';
import { logger } from '../config/logger';
import { defaultHttp } from '../modules/payments/http';
import type { HttpClient } from '../modules/payments/types';

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  template: string;
  /** Links and ids for logs and tests (for example the password-reset URL). Never sent anywhere. */
  meta?: Record<string, string>;
}

// Business code depends on this interface only. Callers go through notifications/notify.ts, which never lets an
// email failure disturb an order or a payment (FR-NOT-003).
export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

export class ResendMailer implements Mailer {
  constructor(
    private readonly cfg: { apiKey: string; from: string; replyTo?: string },
    private readonly http: HttpClient = defaultHttp,
  ) {}

  async send(m: MailMessage): Promise<void> {
    const res = await this.http('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.cfg.apiKey}` },
      body: JSON.stringify({
        from: this.cfg.from,
        to: [m.to],
        subject: m.subject,
        html: m.html,
        text: m.text,
        ...(this.cfg.replyTo ? { reply_to: this.cfg.replyTo } : {}),
      }),
    });
    if (res.status < 200 || res.status >= 300)
      throw new Error(`Resend rejected the email "${m.template}" (HTTP ${res.status})`);
  }
}

class DevMailer implements Mailer {
  async send(m: MailMessage): Promise<void> {
    if (env.NODE_ENV === 'development')
      logger.info(
        { to: m.to, subject: m.subject, template: m.template, ...m.meta },
        '[dev mailer] email not sent (no RESEND_API_KEY)',
      );
    else logger.warn({ template: m.template }, 'No mail provider configured; email was not sent.');
  }
}

let current: Mailer | undefined;
export const getMailer = (): Mailer =>
  (current ??=
    env.RESEND_API_KEY && env.EMAIL_FROM
      ? new ResendMailer({ apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM, replyTo: env.EMAIL_REPLY_TO })
      : new DevMailer());
export const setMailer = (mailer: Mailer): void => {
  current = mailer;
};
