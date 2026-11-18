import { describe, expect, it } from 'vitest';
import { PERMISSIONS, ROLES, hasPermission, isStaff } from '../../src/common/permissions';

describe('permissions', () => {
  it('gives super_admin every permission', () => {
    for (const p of PERMISSIONS) expect(hasPermission('super_admin', p)).toBe(true);
  });

  it('gives customers no admin permissions and no staff status', () => {
    for (const p of PERMISSIONS) expect(hasPermission('customer', p)).toBe(false);
    expect(isStaff('customer')).toBe(false);
  });

  it('keeps staff management, settings and payment writes exclusive to super_admin', () => {
    for (const role of ROLES.filter((r) => r !== 'super_admin')) {
      expect(hasPermission(role, 'staff:manage')).toBe(false);
      expect(hasPermission(role, 'settings:write')).toBe(false);
      expect(hasPermission(role, 'payments:write')).toBe(false);
    }
  });

  it('limits support staff to read and note-taking style permissions', () => {
    expect(hasPermission('support_staff', 'orders:read')).toBe(true);
    expect(hasPermission('support_staff', 'orders:write')).toBe(false);
    expect(hasPermission('support_staff', 'payments:read')).toBe(false);
  });

  it('lets read-only catalogue access reach order and support staff but not writes', () => {
    for (const role of ['order_manager', 'support_staff', 'product_manager'] as const) expect(hasPermission(role, 'catalog:read')).toBe(true);
    expect(hasPermission('order_manager', 'products:write')).toBe(false);
    expect(hasPermission('support_staff', 'inventory:read')).toBe(false);
    expect(hasPermission('order_manager', 'inventory:write')).toBe(false);
  });
});
