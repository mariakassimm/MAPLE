import { describe, expect, it } from 'vitest';
import { safeNext } from '@/pages/auth/AuthShell';

describe('safeNext', () => {
  it('allows same-site paths', () => expect(safeNext('/checkout')).toBe('/checkout'));
  it('rejects protocol-relative and absolute URLs', () => {
    expect(safeNext('//evil.com')).toBe('/account');
    expect(safeNext('https://evil.com')).toBe('/account');
    expect(safeNext('javascript:alert(1)')).toBe('/account');
  });
  it('falls back when empty', () => expect(safeNext(null)).toBe('/account'));
});

import { landingAfterLogin } from '@/pages/auth/AuthShell';

describe('landingAfterLogin', () => {
  it('sends staff to the admin area, ignoring shopper pages', () => {
    expect(landingAfterLogin('order_manager', null)).toBe('/admin');
    expect(landingAfterLogin('super_admin', '/checkout')).toBe('/admin');
    expect(landingAfterLogin('support_staff', '/admin/orders')).toBe('/admin/orders');
    expect(landingAfterLogin('super_admin', '//evil.com')).toBe('/admin');
  });
  it('keeps customers out of the admin area', () => {
    expect(landingAfterLogin('customer', null)).toBe('/account');
    expect(landingAfterLogin('customer', '/admin/orders')).toBe('/account');
    expect(landingAfterLogin('customer', '/admin')).toBe('/account');
    expect(landingAfterLogin('customer', '/checkout')).toBe('/checkout');
    expect(landingAfterLogin('customer', 'https://evil.com')).toBe('/account');
  });
});
