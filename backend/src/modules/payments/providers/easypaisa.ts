import { createCipheriv } from 'crypto';
import { pktStamp } from '../../../common/time';
import { defaultHttp } from '../http';
import {
  InvalidProviderResponse,
  type HttpClient,
  type InitiateInput,
  type InquiryTarget,
  type Outcome,
  type PaymentProvider,
  type RedirectForm,
} from '../types';

export interface EasypaisaConfig {
  storeId: string;
  /** 16, 24 or 32 characters. Same key as configured in the Easypay merchant portal; enables merchantHashedReq. */
  hashKey?: string;
  /** https://easypaystg.easypaisa.com.pk (sandbox) or https://easypay.easypaisa.com.pk (production). */
  baseUrl: string;
  postBackUrl: string;
  /** Optional server-side inquiry; stays off unless all four are set. Taken from the Easypay merchant API pack. */
  inquiryUrl?: string;
  accountNum?: string;
  username?: string;
  password?: string;
}

export const EASYPAY_BASE = {
  sandbox: 'https://easypaystg.easypaisa.com.pk',
  production: 'https://easypay.easypaisa.com.pk',
} as const;

/** Easypay amounts are decimals in rupees with at least one decimal place: 1000.0, 1000.5, 1000.55. */
export function easypaisaAmount(paisa: number): string {
  const rupees = Math.floor(paisa / 100);
  const rest = paisa % 100;
  if (rest === 0) return `${rupees}.0`;
  return `${rupees}.${String(rest).padStart(2, '0').replace(/0$/, '')}`;
}

// Easypay wants mobile numbers as 03XXXXXXXXX; we store +923XXXXXXXXX.
const localMobile = (e164?: string) => (e164 && /^\+92\d{10}$/.test(e164) ? `0${e164.slice(3)}` : undefined);

/**
 * merchantHashedReq: the request fields sorted by name, written as key=value joined with "&" (no URL-encoding),
 * encrypted with AES in ECB mode using the store hash key (PKCS5/PKCS7 padding), then base64-encoded.
 * Mirrors Telenor's reference integration. Key length picks AES-128/192/256.
 */
export function encryptHashedRequest(fields: Record<string, string>, hashKey: string): string {
  const plain = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join('&');
  const algorithm = ({ 16: 'aes-128-ecb', 24: 'aes-192-ecb', 32: 'aes-256-ecb' } as Record<number, string>)[
    hashKey.length
  ];
  if (!algorithm) throw new Error('Easypaisa hash key must be 16, 24 or 32 characters');
  const cipher = createCipheriv(algorithm, Buffer.from(hashKey, 'utf8'), null);
  return Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]).toString('base64');
}

export class EasypaisaProvider implements PaymentProvider {
  readonly id = 'easypaisa' as const;
  private readonly host: string;

  constructor(
    private readonly cfg: EasypaisaConfig,
    private readonly http: HttpClient = defaultHttp,
  ) {
    this.host = new URL(cfg.baseUrl).hostname.toLowerCase();
  }

  get canInquire(): boolean {
    return !!(this.cfg.inquiryUrl && this.cfg.accountNum && this.cfg.username && this.cfg.password);
  }

  /** Step 1: send the customer to Easypay's checkout page. */
  buildRedirect(input: InitiateInput): RedirectForm {
    const fields: Record<string, string> = {
      amount: easypaisaAmount(input.amount),
      autoRedirect: '1',
      expiryDate: pktStamp(input.expiresAt, true),
      orderRefNum: input.paymentRef,
      postBackURL: this.cfg.postBackUrl,
      storeId: this.cfg.storeId,
    };
    if (input.customerEmail) fields.emailAddr = input.customerEmail;
    const mobile = localMobile(input.customerPhone);
    if (mobile) fields.mobileNum = mobile;
    if (this.cfg.hashKey) fields.merchantHashedReq = encryptHashedRequest(fields, this.cfg.hashKey);
    return { method: 'POST', action: `${this.cfg.baseUrl}/easypay/Index.jsf`, fields };
  }

  /** Step 2: Easypay sends the browser back with auth_token; it must be posted to Confirm.jsf together with postBackURL. */
  confirmForm(authToken: string): RedirectForm {
    return {
      method: 'POST',
      action: `${this.cfg.baseUrl}/easypay/Confirm.jsf`,
      fields: { auth_token: authToken, postBackURL: this.cfg.postBackUrl },
    };
  }

  /** The origin the confirm page may post to (used to relax CSP for that one response). */
  get origin(): string {
    return new URL(this.cfg.baseUrl).origin;
  }

  /**
   * Easypay's instant payment notification carries NO signature. It gives us a `url` on Easypay's own domain; we fetch
   * that URL server-to-server and trust only what Easypay's domain answers over TLS. Because the URL comes from an
   * unauthenticated request it is treated as hostile input: https only, exact configured host, no credentials or port,
   * no redirects. The order reference is read from the URL itself (not from separate query parameters), so a caller
   * cannot pair someone else's PAID record with a different order.
   */
  async fetchNotification(rawUrl: string): Promise<{ paymentRef: string; outcome: Outcome }> {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      throw new InvalidProviderResponse('Easypay notification url is not a URL');
    }
    if (
      url.protocol !== 'https:' ||
      url.hostname.toLowerCase() !== this.host ||
      url.username ||
      url.password ||
      url.port
    ) {
      throw new InvalidProviderResponse('Easypay notification url is not on the Easypay host');
    }
    const paymentRef = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() ?? '');
    if (!/^[A-Za-z0-9]{6,32}$/.test(paymentRef))
      throw new InvalidProviderResponse('Easypay notification has no usable order reference');

    const res = await this.http(url.toString(), { method: 'GET' });
    if (res.status !== 200) throw new InvalidProviderResponse(`Easypay notification lookup returned ${res.status}`);
    let json: Record<string, unknown>;
    try {
      json = JSON.parse(res.body) as Record<string, unknown>;
    } catch {
      throw new InvalidProviderResponse('Easypay notification is not JSON');
    }
    if (String(json.store_id ?? '') !== this.cfg.storeId)
      throw new InvalidProviderResponse('Easypay notification is for a different store');
    const named = json.order_id ?? json.orderRefNumber ?? json.order_ref_number;
    if (named !== undefined && String(named) !== paymentRef)
      throw new InvalidProviderResponse('Easypay notification order reference mismatch');

    const status = String(json.transaction_status ?? '').toUpperCase();
    const rupees =
      json.transaction_amount !== undefined ? Number.parseFloat(String(json.transaction_amount)) : Number.NaN;
    return {
      paymentRef,
      outcome: {
        kind: status === 'PAID' ? 'paid' : status === 'FAILED' ? 'failed' : 'pending',
        amount: Number.isFinite(rupees) ? Math.round(rupees * 100) : undefined,
        providerRef: json.transaction_id !== undefined ? String(json.transaction_id) : undefined,
        responseCode: status,
        message: typeof json.description === 'string' ? json.description : undefined,
      },
    };
  }

  /** Optional server-side status check. Off unless fully configured; only an explicit PAID counts, everything else is "unknown". */
  async inquire(target: InquiryTarget): Promise<Outcome | null> {
    if (!this.canInquire) return null;
    const credentials = Buffer.from(`${this.cfg.username}:${this.cfg.password}`).toString('base64');
    const res = await this.http(this.cfg.inquiryUrl as string, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Credentials: credentials },
      body: JSON.stringify({ orderId: target.paymentRef, storeId: this.cfg.storeId, accountNum: this.cfg.accountNum }),
    });
    if (res.status !== 200) return null;
    let json: Record<string, unknown>;
    try {
      json = JSON.parse(res.body) as Record<string, unknown>;
    } catch {
      return null;
    }
    if (String(json.transactionStatus ?? '').toUpperCase() !== 'PAID') return null;
    if (json.orderId !== undefined && String(json.orderId) !== target.paymentRef) return null;
    const rupees =
      json.transactionAmount !== undefined ? Number.parseFloat(String(json.transactionAmount)) : Number.NaN;
    return {
      kind: 'paid',
      amount: Number.isFinite(rupees) ? Math.round(rupees * 100) : undefined,
      providerRef: json.transactionId !== undefined ? String(json.transactionId) : undefined,
      responseCode: 'PAID',
    };
  }
}
