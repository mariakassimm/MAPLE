import { createHmac } from 'crypto';
import { safeEqual } from '../../../common/crypto';
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

export interface JazzCashConfig {
  merchantId: string;
  password: string;
  integritySalt: string;
  ppVersion: string;
  /** Optional pp_TxnType to restrict the hosted page to one method (e.g. MWALLET, MIGS). Empty shows all enabled methods. */
  txnType?: string;
  paymentUrl: string;
  /** Status-inquiry endpoint issued by JazzCash for your merchant. Inquiry stays off until this is set. */
  inquiryUrl?: string;
  returnUrl: string;
}

export const JAZZCASH_URLS = {
  sandbox: 'https://sandbox.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/',
  production: 'https://payments.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/',
} as const;

/**
 * JazzCash secure hash (Integration Guide v4.2, "How the secure hash is created and verified"):
 * take every field whose name starts with "pp" (except pp_SecureHash) that has a value, order the fields by
 * name (ASCII), join their VALUES with "&", prepend the integrity salt plus "&", then HMAC-SHA256 with the salt
 * as key and hex-encode. Verified in tests against JazzCash's own published worked example.
 */
export function jazzCashHash(fields: Record<string, string | undefined>, integritySalt: string): string {
  const values = Object.keys(fields)
    .filter(
      (k) => k.startsWith('pp') && k.toLowerCase() !== 'pp_securehash' && fields[k] !== undefined && fields[k] !== '',
    )
    .sort()
    .map((k) => fields[k] as string);
  return createHmac('sha256', integritySalt)
    .update([integritySalt, ...values].join('&'))
    .digest('hex');
}

const PENDING_CODES = new Set(['124']); // "order placed, waiting for financials" (over-the-counter voucher not yet paid)

export class JazzCashProvider implements PaymentProvider {
  readonly id = 'jazzcash' as const;

  constructor(
    private readonly cfg: JazzCashConfig,
    private readonly http: HttpClient = defaultHttp,
  ) {}

  get canInquire(): boolean {
    return !!this.cfg.inquiryUrl;
  }

  buildRedirect(input: InitiateInput): RedirectForm {
    const fields: Record<string, string> = {
      pp_Version: this.cfg.ppVersion,
      pp_TxnType: this.cfg.txnType ?? '',
      pp_Language: 'EN',
      pp_MerchantID: this.cfg.merchantId,
      pp_SubMerchantID: '',
      pp_Password: this.cfg.password,
      pp_BankID: '',
      pp_ProductID: '',
      pp_TxnRefNo: input.paymentRef,
      // Integer paisa, no decimal point: "100.00 will be passed as 10000".
      pp_Amount: String(input.amount),
      pp_TxnCurrency: 'PKR',
      pp_TxnDateTime: pktStamp(input.now),
      // pp_BillReference allows only letters, digits and ".", so the dash in "MPL-XXXXXXXX" is dropped.
      pp_BillReference: input.orderNumber.replace(/[^A-Za-z0-9.]/g, '').slice(0, 20),
      pp_Description: `MAPLE order ${input.orderNumber}`,
      pp_TxnExpiryDateTime: pktStamp(input.expiresAt),
      pp_ReturnURL: this.cfg.returnUrl,
      ppmpf_1: '',
      ppmpf_2: '',
      ppmpf_3: '',
      ppmpf_4: '',
      ppmpf_5: '',
    };
    if (this.cfg.ppVersion === '2.0') fields.pp_IsRegisteredCustomer = 'No';
    fields.pp_SecureHash = jazzCashHash(fields, this.cfg.integritySalt);
    return { method: 'POST', action: this.cfg.paymentUrl, fields };
  }

  /** Authenticates the form JazzCash POSTs back to pp_ReturnURL. Anything unsigned or altered is rejected. */
  parseReturn(data: Record<string, string>): { paymentRef: string; outcome: Outcome } {
    const given = (data.pp_SecureHash ?? '').toLowerCase();
    if (!given || !safeEqual(jazzCashHash(data, this.cfg.integritySalt), given))
      throw new InvalidProviderResponse('JazzCash signature mismatch');
    if (data.pp_MerchantID !== this.cfg.merchantId) throw new InvalidProviderResponse('JazzCash merchant id mismatch');
    const paymentRef = data.pp_TxnRefNo;
    if (!paymentRef) throw new InvalidProviderResponse('JazzCash response has no transaction reference');
    if (data.pp_Amount !== undefined && data.pp_Amount !== '' && !/^\d+$/.test(data.pp_Amount))
      throw new InvalidProviderResponse('JazzCash amount is not numeric');

    const code = data.pp_ResponseCode ?? '';
    return {
      paymentRef,
      outcome: {
        kind: code === '000' ? 'paid' : PENDING_CODES.has(code) ? 'pending' : 'failed',
        amount: data.pp_Amount ? Number(data.pp_Amount) : undefined,
        providerRef: data.pp_RetreivalReferenceNo || undefined, // sic: JazzCash's own spelling
        responseCode: code,
        message: data.pp_ResponseMessage,
      },
    };
  }

  /**
   * Asks JazzCash for a transaction's status. The endpoint and field names come from your merchant pack; only a
   * response whose own pp_SecureHash verifies AND that reports payment code 000 is ever treated as paid.
   * Anything else returns null ("still unknown"), never a guess.
   */
  async inquire(target: InquiryTarget): Promise<Outcome | null> {
    if (!this.cfg.inquiryUrl) return null;
    const body: Record<string, string> = {
      pp_TxnRefNo: target.paymentRef,
      pp_MerchantID: this.cfg.merchantId,
      pp_Password: this.cfg.password,
    };
    body.pp_SecureHash = jazzCashHash(body, this.cfg.integritySalt);
    const res = await this.http(this.cfg.inquiryUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.status !== 200) return null;

    let json: Record<string, unknown>;
    try {
      json = JSON.parse(res.body) as Record<string, unknown>;
    } catch {
      return null;
    }
    const data = Object.fromEntries(
      Object.entries(json)
        .filter(([, v]) => typeof v === 'string' || typeof v === 'number')
        .map(([k, v]) => [k, String(v)]),
    );
    const given = (data.pp_SecureHash ?? '').toLowerCase();
    if (!given || !safeEqual(jazzCashHash(data, this.cfg.integritySalt), given)) return null;
    if (data.pp_TxnRefNo && data.pp_TxnRefNo !== target.paymentRef) return null;
    if (data.pp_PaymentResponseCode !== '000') return null;
    return {
      kind: 'paid',
      amount: data.pp_Amount && /^\d+$/.test(data.pp_Amount) ? Number(data.pp_Amount) : undefined,
      providerRef: data.pp_RetreivalReferenceNo || undefined,
      responseCode: data.pp_PaymentResponseCode,
      message: data.pp_PaymentResponseMessage,
    };
  }
}
