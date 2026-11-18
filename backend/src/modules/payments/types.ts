export type ProviderId = 'jazzcash' | 'easypaisa';

export interface RedirectForm {
  method: 'POST';
  action: string;
  fields: Record<string, string>;
}

export interface InitiateInput {
  paymentRef: string;
  orderNumber: string;
  /** Integer paisa. */
  amount: number;
  customerPhone?: string;
  customerEmail?: string;
  expiresAt: Date;
  now: Date;
}

export type OutcomeKind = 'paid' | 'failed' | 'pending';

/** A provider's verdict on one transaction, after the provider adapter has authenticated it. */
export interface Outcome {
  kind: OutcomeKind;
  /** Paisa, when the provider reports it; compared with what we asked it to charge. */
  amount?: number;
  providerRef?: string;
  responseCode?: string;
  message?: string;
}

export interface InquiryTarget {
  paymentRef: string;
  amount: number;
  createdAt: Date;
}

export interface PaymentProvider {
  readonly id: ProviderId;
  readonly canInquire: boolean;
  buildRedirect(input: InitiateInput): RedirectForm;
  inquire(target: InquiryTarget): Promise<Outcome | null>;
}

/** Thrown when data claiming to come from a provider fails authentication or sanity checks. */
export class InvalidProviderResponse extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidProviderResponse';
  }
}

export interface HttpRequest {
  method: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}
export type HttpClient = (url: string, request: HttpRequest) => Promise<{ status: number; body: string }>;
