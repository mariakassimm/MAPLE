import { describe, expect, it } from 'vitest';
import { ResendMailer } from '../../src/services/mailer';
import { unsubscribeToken } from '../../src/modules/newsletter/newsletter';
import * as t from '../../src/modules/notifications/templates';
import type { HttpClient } from '../../src/modules/payments/types';

const order: t.OrderEmail = {
  orderNumber: 'MPL-AB12CD34', customerName: 'Ayesha Bibi Khan',
  items: [{ name: 'Maple Tote', options: 'Black', quantity: 2, lineTotal: 4_000_000 }],
  subtotal: 4_000_000, discountTotal: 100_000, shippingFee: 30_000, total: 3_930_000, paymentMethod: 'cod',
  address: 'House 12, Gulshan-e-Iqbal, Karachi', trackUrl: 'https://maple.pk/order-tracking?order=MPL-AB12CD34&x=1',
};

describe('money formatting', () => {
  it('shows whole rupees plainly and paisa with two decimals', () => {
    expect(t.formatPkr(2_030_000)).toBe('Rs 20,300');
    expect(t.formatPkr(100_050)).toBe('Rs 1,000.50');
    expect(t.formatPkr(5)).toBe('Rs 0.05');
  });
});

describe('email templates', () => {
  it('renders a branded, responsive order confirmation with plain-text twin', () => {
    const m = t.orderConfirmation(order, false);
    expect(m.subject).toBe('Order MPL-AB12CD34 received');
    expect(m.html).toContain('MAPLE');
    expect(m.html).toContain('#EAE4D9');
    expect(m.html).toContain('name="viewport"');
    for (const needle of ['Maple Tote (Black) x 2', 'Rs 40,000', '- Rs 1,000', 'Rs 300', 'Rs 39,300', 'Cash on delivery', 'House 12, Gulshan-e-Iqbal, Karachi', 'TRACK YOUR ORDER']) expect(m.html).toContain(needle);
    expect(m.text).toContain('Total: Rs 39,300');
    expect(m.text).toContain('https://maple.pk/order-tracking?order=MPL-AB12CD34&x=1');
    expect(m.text).not.toMatch(/<[a-z]/i);
  });
  it('escapes every dynamic value', () => {
    const evil = { ...order, customerName: '<script>alert(1)</script>', address: '"><img src=x onerror=alert(1)>', items: [{ name: '<b>Bag</b>', quantity: 1, lineTotal: 100 }] };
    const m = t.orderConfirmation(evil, true);
    expect(m.html).not.toContain('<script>');
    expect(m.html).not.toContain('<img');
    expect(m.html).not.toContain('<b>Bag');
    expect(m.html).toContain('&lt;b&gt;Bag&lt;/b&gt;');
    expect(m.html).toContain('x=1'.replace('x=1', 'MPL-AB12CD34'));
    expect(t.esc(`a&b<c>"d'`)).toBe('a&amp;b&lt;c&gt;&quot;d&#39;');
  });
  it('escapes ampersands in links', () => {
    expect(t.orderConfirmation(order, false).html).toContain('order=MPL-AB12CD34&amp;x=1');
  });
  it('tells the awaiting-payment story differently and hides empty discount rows', () => {
    const online = t.orderConfirmation({ ...order, paymentMethod: 'jazzcash', discountTotal: 0, shippingFee: 0 }, true);
    expect(online.html).toContain('waiting for payment');
    expect(online.html).not.toContain('Discount');
    expect(online.html).toContain('Free');
    expect(online.html).toContain('JazzCash');
  });
  it('covers the account, payment, shipping and cancellation messages', () => {
    expect(t.welcome('Ayesha Khan', 'https://maple.pk/shop').html).toContain('Welcome, Ayesha');
    expect(t.verifyEmail('Ayesha', 'https://maple.pk/verify-email?token=abc').html).toContain('48 hours');
    expect(t.passwordReset('Ayesha', 'https://maple.pk/reset-password?token=abc').html).toContain('60 minutes');
    expect(t.paymentConfirmed(order).subject).toContain('Payment received');
    expect(t.paymentFailed(order).html).toContain('not been charged');
    expect(t.orderDispatched(order, 'tcs', '779412300001').html).toContain('779412300001');
    expect(t.orderDispatched(order, 'tcs', '779412300001').html).toContain('TCS');
    expect(t.trackingUpdate(order, 'Out for delivery', '779').subject).toContain('Out for delivery');
    expect(t.delivered(order).html).toContain('Delivered');
    expect(t.cancelled(order, 'Out of stock').html).toContain('Reason: Out of stock');
    expect(t.cancelled(order).html).not.toContain('Reason:');
  });
  it('writes return updates for every status, with the refund when there is one', () => {
    for (const status of ['requested', 'approved', 'rejected', 'received', 'refunded', 'exchanged', 'closed'] as const) {
      const m = t.returnUpdate({ reference: 'RTN-AAAA1111', orderNumber: 'MPL-AB12CD34', customerName: 'Ayesha', status, trackUrl: 'https://maple.pk/x' });
      expect(m.subject).toContain('RTN-AAAA1111');
    }
    const refund = t.returnUpdate({ reference: 'RTN-AAAA1111', orderNumber: 'MPL-AB12CD34', customerName: 'Ayesha', status: 'refunded', refundAmount: 1_030_000, trackUrl: 'https://maple.pk/x' });
    expect(refund.html).toContain('Rs 10,300');
  });
});

describe('Resend mailer', () => {
  const message = { to: 'a@example.com', subject: 'Hi', html: '<p>Hi</p>', text: 'Hi', template: 'welcome' };

  it('posts the documented JSON with a bearer key', async () => {
    let seen: { url: string; headers?: Record<string, string>; body?: string } | undefined;
    const http: HttpClient = async (url, req) => ((seen = { url, headers: req.headers, body: req.body }), { status: 200, body: '{"id":"x"}' });
    await new ResendMailer({ apiKey: 're_test', from: 'MAPLE <orders@maple.pk>', replyTo: 'help@maple.pk' }, http).send(message);
    expect(seen!.url).toBe('https://api.resend.com/emails');
    expect(seen!.headers).toMatchObject({ Authorization: 'Bearer re_test', 'Content-Type': 'application/json' });
    expect(JSON.parse(seen!.body!)).toEqual({ from: 'MAPLE <orders@maple.pk>', to: ['a@example.com'], subject: 'Hi', html: '<p>Hi</p>', text: 'Hi', reply_to: 'help@maple.pk' });
  });
  it('omits reply_to when not configured and fails loudly on errors', async () => {
    let body = '';
    const ok: HttpClient = async (_u, r) => ((body = r.body!), { status: 200, body: '' });
    await new ResendMailer({ apiKey: 'k', from: 'f' }, ok).send(message);
    expect(JSON.parse(body)).not.toHaveProperty('reply_to');
    const bad: HttpClient = async () => ({ status: 422, body: '{}' });
    await expect(new ResendMailer({ apiKey: 'k', from: 'f' }, bad).send(message)).rejects.toThrow(/HTTP 422/);
  });
});

describe('newsletter unsubscribe token', () => {
  it('is stable per address, case-insensitive, and differs between addresses', () => {
    expect(unsubscribeToken('A@Example.com')).toBe(unsubscribeToken('a@example.com'));
    expect(unsubscribeToken('a@example.com')).not.toBe(unsubscribeToken('b@example.com'));
    expect(unsubscribeToken('a@example.com').length).toBeGreaterThan(20);
  });
});
