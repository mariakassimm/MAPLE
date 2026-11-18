import { createDecipheriv } from 'crypto';
import { describe, expect, it } from 'vitest';
import { newPaymentRef, pktStamp } from '../../src/common/time';
import { EasypaisaProvider, easypaisaAmount, encryptHashedRequest, type EasypaisaConfig } from '../../src/modules/payments/providers/easypaisa';
import { JazzCashProvider, jazzCashHash, type JazzCashConfig } from '../../src/modules/payments/providers/jazzcash';
import { InvalidProviderResponse, type HttpClient } from '../../src/modules/payments/types';

const NOW = new Date('2026-11-07T10:00:00Z');
const EXPIRES = new Date('2026-11-07T10:30:00Z');

describe('time helpers', () => {
  it('formats Pakistan time (UTC+5) for providers', () => {
    expect(pktStamp(NOW)).toBe('20261107150000');
    expect(pktStamp(NOW, true)).toBe('20261107 150000');
    expect(pktStamp(new Date('2026-12-31T20:00:00Z'))).toBe('20270101010000');
  });
  it('generates 20-character alphanumeric payment references', () => {
    const refs = new Set(Array.from({ length: 300 }, () => newPaymentRef(NOW)));
    expect(refs.size).toBe(300);
    for (const r of refs) expect(r).toMatch(/^T20261107150000[A-Z2-9]{5}$/);
  });
});

describe('JazzCash secure hash', () => {
  it("reproduces JazzCash's own published worked example", () => {
    // From the JazzCash sandbox documentation ("Secure Hash"): salt 0F5DD14AE2 and the three fields below.
    const fields = { pp_Amount: '2995', pp_MerchantID: 'MER123', pp_Password: 'A48cvE28' };
    expect(jazzCashHash(fields, '0F5DD14AE2')).toBe('c7689cda7474eb1adcd343fd0c0b676bad0ba66361cc46db589bdb0da4c1c867');
  });
  it('ignores field order, empty values, pp_SecureHash and non-pp fields', () => {
    const base = { pp_Amount: '2995', pp_MerchantID: 'MER123', pp_Password: 'A48cvE28' };
    const expected = jazzCashHash(base, '0F5DD14AE2');
    const noisy = { pp_Password: 'A48cvE28', other: 'x', pp_BankID: '', ppmpf_1: '', pp_MerchantID: 'MER123', pp_SecureHash: 'abc', pp_Amount: '2995' };
    expect(jazzCashHash(noisy, '0F5DD14AE2')).toBe(expected);
  });
  it('changes when any value or the salt changes', () => {
    const base = { pp_Amount: '2995', pp_MerchantID: 'MER123' };
    expect(jazzCashHash({ ...base, pp_Amount: '2996' }, 's')).not.toBe(jazzCashHash(base, 's'));
    expect(jazzCashHash(base, 's2')).not.toBe(jazzCashHash(base, 's'));
  });
});

const jazzCfg = (over: Partial<JazzCashConfig> = {}): JazzCashConfig => ({
  merchantId: 'MC000001', password: 'pw123', integritySalt: 'SALTSALT', ppVersion: '2.0',
  paymentUrl: 'https://sandbox.jazzcash.test/form/', returnUrl: 'https://api.test/api/v1/payments/jazzcash/return', ...over,
});
const signed = (fields: Record<string, string>, salt = 'SALTSALT') => ({ ...fields, pp_SecureHash: jazzCashHash(fields, salt) });
const input = { paymentRef: 'T20261107150000ABCDE', orderNumber: 'MPL-AB12CD34', amount: 2_030_000, expiresAt: EXPIRES, now: NOW };

describe('JazzCash redirect', () => {
  const form = new JazzCashProvider(jazzCfg()).buildRedirect(input);

  it('builds a POST to the configured page with the documented fields', () => {
    expect(form).toMatchObject({ method: 'POST', action: 'https://sandbox.jazzcash.test/form/' });
    expect(form.fields).toMatchObject({
      pp_Version: '2.0', pp_Language: 'EN', pp_MerchantID: 'MC000001', pp_TxnRefNo: 'T20261107150000ABCDE', pp_Amount: '2030000', pp_TxnCurrency: 'PKR',
      pp_TxnDateTime: '20261107150000', pp_TxnExpiryDateTime: '20261107153000', pp_BillReference: 'MPLAB12CD34', pp_IsRegisteredCustomer: 'No',
      pp_ReturnURL: 'https://api.test/api/v1/payments/jazzcash/return',
    });
    expect(form.fields.pp_BillReference).toMatch(/^[A-Za-z0-9.]{1,20}$/);
    expect(form.fields.pp_Description).not.toMatch(/[<>\\*=%/:'"{}|]/);
  });
  it('signs exactly what it sends', () => {
    const { pp_SecureHash, ...rest } = form.fields;
    expect(pp_SecureHash).toBe(jazzCashHash(rest, 'SALTSALT'));
  });
  it('omits pp_IsRegisteredCustomer for version 1.1 and honours a transaction type', () => {
    const v11 = new JazzCashProvider(jazzCfg({ ppVersion: '1.1', txnType: 'MWALLET' })).buildRedirect(input);
    expect(v11.fields.pp_IsRegisteredCustomer).toBeUndefined();
    expect(v11.fields.pp_TxnType).toBe('MWALLET');
  });
});

describe('JazzCash return verification', () => {
  const provider = new JazzCashProvider(jazzCfg());
  const base = { pp_Amount: '2030000', pp_MerchantID: 'MC000001', pp_ResponseCode: '000', pp_ResponseMessage: 'Success', pp_RetreivalReferenceNo: '123456789012', pp_TxnRefNo: 'T20261107150000ABCDE', pp_Version: '2.0' };

  it('accepts a correctly signed success', () => {
    expect(provider.parseReturn(signed(base))).toEqual({
      paymentRef: 'T20261107150000ABCDE',
      outcome: { kind: 'paid', amount: 2_030_000, providerRef: '123456789012', responseCode: '000', message: 'Success' },
    });
  });
  it('accepts an upper-case hash', () => {
    const s = signed(base);
    expect(() => provider.parseReturn({ ...s, pp_SecureHash: s.pp_SecureHash.toUpperCase() })).not.toThrow();
  });
  it('rejects tampered, unsigned, wrongly-salted and wrong-merchant data', () => {
    const good = signed(base);
    expect(() => provider.parseReturn({ ...good, pp_Amount: '100' })).toThrow(InvalidProviderResponse);
    expect(() => provider.parseReturn({ ...good, pp_ResponseCode: '000', pp_TxnRefNo: 'T20261107150000ZZZZZ' })).toThrow(InvalidProviderResponse);
    expect(() => provider.parseReturn(base)).toThrow(InvalidProviderResponse);
    expect(() => provider.parseReturn(signed(base, 'OTHERSALT'))).toThrow(InvalidProviderResponse);
    expect(() => provider.parseReturn(signed({ ...base, pp_MerchantID: 'MC999' }))).toThrow(InvalidProviderResponse);
    expect(() => provider.parseReturn(signed({ ...base, pp_Amount: 'abc' }))).toThrow(InvalidProviderResponse);
  });
  it('maps response codes: 124 pending, anything else not 000 failed', () => {
    expect(provider.parseReturn(signed({ ...base, pp_ResponseCode: '124' })).outcome.kind).toBe('pending');
    expect(provider.parseReturn(signed({ ...base, pp_ResponseCode: '110' })).outcome.kind).toBe('failed');
    expect(provider.parseReturn(signed({ ...base, pp_ResponseCode: '' })).outcome.kind).toBe('failed');
  });
});

describe('JazzCash inquiry', () => {
  const target = { paymentRef: 'T20261107150000ABCDE', amount: 2_030_000, createdAt: NOW };
  const reply = (fields: Record<string, string>, salt = 'SALTSALT', status = 200): HttpClient => async () => ({ status, body: JSON.stringify(signed(fields, salt)) });
  const paid = { pp_TxnRefNo: target.paymentRef, pp_PaymentResponseCode: '000', pp_Amount: '2030000', pp_ResponseCode: '000' };
  const cfg = jazzCfg({ inquiryUrl: 'https://sandbox.jazzcash.test/inquire' });

  it('is off without an inquiry url', async () => {
    expect(new JazzCashProvider(jazzCfg()).canInquire).toBe(false);
    expect(await new JazzCashProvider(jazzCfg()).inquire(target)).toBeNull();
  });
  it('sends a signed request and accepts only a verified payment code 000', async () => {
    let sent: Record<string, string> = {};
    const http: HttpClient = async (_u, req) => {
      sent = JSON.parse(req.body as string);
      return { status: 200, body: JSON.stringify(signed(paid)) };
    };
    const outcome = await new JazzCashProvider(cfg, http).inquire(target);
    expect(outcome).toMatchObject({ kind: 'paid', amount: 2_030_000 });
    expect(sent.pp_SecureHash).toBe(jazzCashHash({ pp_TxnRefNo: target.paymentRef, pp_MerchantID: 'MC000001', pp_Password: 'pw123' }, 'SALTSALT'));
  });
  it('answers null (unknown) for anything it cannot verify', async () => {
    const attempt = (http: HttpClient) => new JazzCashProvider(cfg, http).inquire(target);
    expect(await attempt(reply(paid, 'WRONG'))).toBeNull();
    expect(await attempt(reply({ ...paid, pp_PaymentResponseCode: '157' }))).toBeNull();
    expect(await attempt(reply({ ...paid, pp_TxnRefNo: 'T20261107150000OTHER1' }))).toBeNull();
    expect(await attempt(reply(paid, 'SALTSALT', 500))).toBeNull();
    expect(await attempt(async () => ({ status: 200, body: 'not json' }))).toBeNull();
    expect(await attempt(async () => ({ status: 200, body: JSON.stringify(paid) }))).toBeNull(); // unsigned
  });
});

describe('Easypaisa helpers', () => {
  it('formats amounts as rupee decimals', () => {
    expect(easypaisaAmount(2_030_000)).toBe('20300.0');
    expect(easypaisaAmount(2_030_050)).toBe('20300.5');
    expect(easypaisaAmount(2_030_055)).toBe('20300.55');
    expect(easypaisaAmount(5)).toBe('0.05');
    expect(easypaisaAmount(100)).toBe('1.0');
  });
  it('encrypts sorted key=value pairs with AES-ECB and base64', () => {
    const key = '0123456789abcdef';
    const out = encryptHashedRequest({ storeId: '1', amount: '10.0', orderRefNum: 'A1' }, key);
    const d = createDecipheriv('aes-128-ecb', Buffer.from(key), null);
    expect(Buffer.concat([d.update(Buffer.from(out, 'base64')), d.final()]).toString()).toBe('amount=10.0&orderRefNum=A1&storeId=1');
    const key32 = '0123456789abcdef0123456789abcdef';
    const d2 = createDecipheriv('aes-256-ecb', Buffer.from(key32), null);
    const out2 = encryptHashedRequest({ a: 'b' }, key32);
    expect(Buffer.concat([d2.update(Buffer.from(out2, 'base64')), d2.final()]).toString()).toBe('a=b');
    expect(() => encryptHashedRequest({ a: 'b' }, 'short')).toThrow();
  });
});

const epCfg = (over: Partial<EasypaisaConfig> = {}): EasypaisaConfig => ({
  storeId: 'TESTSTORE', hashKey: '0123456789abcdef', baseUrl: 'https://easypaystg.easypaisa.com.pk', postBackUrl: 'https://api.test/api/v1/payments/easypaisa/postback', ...over,
});
const epInput = { ...input, customerPhone: '+923001234567', customerEmail: 'a@example.com' };

describe('Easypaisa redirect', () => {
  it('builds the Index.jsf request with a hashed copy of the fields', () => {
    const form = new EasypaisaProvider(epCfg()).buildRedirect(epInput);
    expect(form.action).toBe('https://easypaystg.easypaisa.com.pk/easypay/Index.jsf');
    expect(form.fields).toMatchObject({
      storeId: 'TESTSTORE', amount: '20300.0', orderRefNum: 'T20261107150000ABCDE', autoRedirect: '1', expiryDate: '20261107 153000',
      postBackURL: 'https://api.test/api/v1/payments/easypaisa/postback', emailAddr: 'a@example.com', mobileNum: '03001234567',
    });
    const { merchantHashedReq, ...signedFields } = form.fields;
    expect(merchantHashedReq).toBe(encryptHashedRequest(signedFields, '0123456789abcdef'));
  });
  it('omits the hash without a key and optional fields without data', () => {
    const form = new EasypaisaProvider(epCfg({ hashKey: undefined })).buildRedirect(input);
    expect(form.fields.merchantHashedReq).toBeUndefined();
    expect(form.fields.emailAddr).toBeUndefined();
    expect(form.fields.mobileNum).toBeUndefined();
  });
  it('builds the second-step confirm form', () => {
    expect(new EasypaisaProvider(epCfg()).confirmForm('tok123456')).toEqual({
      method: 'POST', action: 'https://easypaystg.easypaisa.com.pk/easypay/Confirm.jsf',
      fields: { auth_token: 'tok123456', postBackURL: 'https://api.test/api/v1/payments/easypaisa/postback' },
    });
  });
});

describe('Easypaisa notification handling', () => {
  const REF = 'T20261107150000ABCDE';
  const url = `https://easypaystg.easypaisa.com.pk/easypay/ipn/${REF}`;
  const json = { store_id: 'TESTSTORE', transaction_status: 'PAID', transaction_amount: '20300.0', transaction_id: '555' };
  const serve = (body: unknown, status = 200) => {
    const calls: string[] = [];
    const http: HttpClient = async (u) => (calls.push(u), { status, body: typeof body === 'string' ? body : JSON.stringify(body) });
    return { calls, provider: new EasypaisaProvider(epCfg(), http) };
  };

  it('verifies by fetching from Easypay and takes the reference from the url', async () => {
    const { provider, calls } = serve(json);
    expect(await provider.fetchNotification(url)).toEqual({
      paymentRef: REF, outcome: { kind: 'paid', amount: 2_030_000, providerRef: '555', responseCode: 'PAID', message: undefined },
    });
    expect(calls).toEqual([url]);
  });
  it('maps statuses', async () => {
    expect((await serve({ ...json, transaction_status: 'FAILED' }).provider.fetchNotification(url)).outcome.kind).toBe('failed');
    expect((await serve({ ...json, transaction_status: 'PENDING' }).provider.fetchNotification(url)).outcome.kind).toBe('pending');
  });
  it.each([
    ['http scheme', `http://easypaystg.easypaisa.com.pk/easypay/ipn/${REF}`],
    ['another host', `https://evil.example/easypay/ipn/${REF}`],
    ['the production host while on sandbox', `https://easypay.easypaisa.com.pk/easypay/ipn/${REF}`],
    ['a look-alike host', `https://easypaystg.easypaisa.com.pk.evil.example/ipn/${REF}`],
    ['embedded credentials', `https://easypaystg.easypaisa.com.pk@evil.example/ipn/${REF}`],
    ['an explicit port', `https://easypaystg.easypaisa.com.pk:8443/ipn/${REF}`],
    ['an internal address', `https://127.0.0.1/ipn/${REF}`],
    ['no reference', 'https://easypaystg.easypaisa.com.pk/'],
    ['garbage', 'not a url'],
  ])('refuses %s without making any request', async (_label, bad) => {
    const { provider, calls } = serve(json);
    await expect(provider.fetchNotification(bad)).rejects.toBeInstanceOf(InvalidProviderResponse);
    expect(calls).toEqual([]);
  });
  it('rejects other stores, mismatched order references, errors and non-JSON', async () => {
    await expect(serve({ ...json, store_id: 'OTHER' }).provider.fetchNotification(url)).rejects.toBeInstanceOf(InvalidProviderResponse);
    await expect(serve({ ...json, order_id: 'SOMETHINGELSE1' }).provider.fetchNotification(url)).rejects.toBeInstanceOf(InvalidProviderResponse);
    await expect(serve(json, 500).provider.fetchNotification(url)).rejects.toBeInstanceOf(InvalidProviderResponse);
    await expect(serve('<html>').provider.fetchNotification(url)).rejects.toBeInstanceOf(InvalidProviderResponse);
  });
  it('inquiry is off by default and counts only an explicit PAID', async () => {
    expect(await new EasypaisaProvider(epCfg()).inquire({ paymentRef: REF, amount: 1, createdAt: NOW })).toBeNull();
    const cfg = epCfg({ inquiryUrl: 'https://easypaystg.easypaisa.com.pk/inquire', accountNum: '1234', username: 'u', password: 'p' });
    let headers: Record<string, string> | undefined;
    const paid: HttpClient = async (_u, r) => ((headers = r.headers), { status: 200, body: JSON.stringify({ transactionStatus: 'PAID', transactionAmount: '20300.0', orderId: REF, transactionId: '9' }) });
    expect(await new EasypaisaProvider(cfg, paid).inquire({ paymentRef: REF, amount: 2_030_000, createdAt: NOW })).toMatchObject({ kind: 'paid', amount: 2_030_000 });
    expect(headers?.Credentials).toBe(Buffer.from('u:p').toString('base64'));
    const pending: HttpClient = async () => ({ status: 200, body: JSON.stringify({ transactionStatus: 'PENDING' }) });
    expect(await new EasypaisaProvider(cfg, pending).inquire({ paymentRef: REF, amount: 1, createdAt: NOW })).toBeNull();
  });
});
