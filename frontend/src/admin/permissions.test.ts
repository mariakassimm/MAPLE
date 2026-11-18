import { describe, expect, it } from 'vitest';
import { can, isStaff, ORDER_TRANSITIONS } from '@/admin/permissions';

describe('admin permissions', () => {
  it('lets super_admin do everything', () => expect(can('super_admin', 'staff:manage')).toBe(true));
  it('keeps support staff away from money and settings', () => {
    expect(can('support_staff', 'payments:read')).toBe(false);
    expect(can('support_staff', 'settings:write')).toBe(false);
    expect(can('support_staff', 'orders:write')).toBe(false);
  });
  it('lets order managers cancel but not edit products', () => {
    expect(can('order_manager', 'orders:cancel')).toBe(true);
    expect(can('order_manager', 'products:write')).toBe(false);
  });
  it('treats customers and unknown roles as non-staff', () => {
    expect(isStaff('customer')).toBe(false);
    expect(isStaff('hacker')).toBe(false);
    expect(isStaff(undefined)).toBe(false);
  });
  it('has no way out of terminal order states', () => {
    for (const s of ['delivered', 'cancelled', 'returned_to_origin']) expect(ORDER_TRANSITIONS[s]).toEqual([]);
  });
});

import { adminHomeFor, permissionForPath } from '@/admin/nav';

describe('admin route permissions', () => {
  it('maps URLs to the permission the sidebar entry needs', () => {
    expect(permissionForPath('/admin')).toBe('reports:read');
    expect(permissionForPath('/admin/orders/abc123')).toBe('orders:read');
    expect(permissionForPath('/admin/staff')).toBe('staff:manage');
    expect(permissionForPath('/admin/profile')).toBeNull();
  });
  it('lands roles without a dashboard on their first allowed section', () => {
    expect(adminHomeFor('super_admin')).toBe('/admin');
    expect(adminHomeFor('support_staff')).toBe('/admin/orders');
  });
});
