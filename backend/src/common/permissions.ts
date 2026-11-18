export const ROLES = ['customer', 'super_admin', 'product_manager', 'order_manager', 'support_staff'] as const;
export type Role = (typeof ROLES)[number];

export const STAFF_ROLES = ['super_admin', 'product_manager', 'order_manager', 'support_staff'] as const;

// Roles that may be granted through the API. super_admin is only created via the CLI bootstrap script.
export const ASSIGNABLE_STAFF_ROLES = ['product_manager', 'order_manager', 'support_staff'] as const;

export const PERMISSIONS = [
  'catalog:read',
  'products:write',
  'categories:write',
  'inventory:read',
  'inventory:write',
  'orders:read',
  'orders:write',
  'orders:cancel',
  'shipments:write',
  'payments:read',
  'payments:write',
  'customers:read',
  'customers:notes',
  'coupons:write',
  'reviews:moderate',
  'returns:read',
  'returns:manage',
  'content:write',
  'settings:write',
  'staff:manage',
  'reports:read',
  'audit:read',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const MATRIX: Record<Role, readonly Permission[]> = {
  customer: [],
  super_admin: PERMISSIONS,
  product_manager: [
    'catalog:read',
    'products:write',
    'categories:write',
    'inventory:read',
    'inventory:write',
    'reviews:moderate',
    'content:write',
    'reports:read',
  ],
  order_manager: [
    'catalog:read',
    'orders:read',
    'orders:write',
    'orders:cancel',
    'shipments:write',
    'payments:read',
    'customers:read',
    'returns:read',
    'returns:manage',
    'inventory:read',
    'reports:read',
  ],
  // No payment or settings access: support must not hold unrestricted financial controls (SRS section 3).
  support_staff: [
    'catalog:read',
    'orders:read',
    'customers:read',
    'customers:notes',
    'returns:read',
    'reviews:moderate',
  ],
};

export const hasPermission = (role: Role, permission: Permission): boolean => MATRIX[role].includes(permission);
export const isStaff = (role: Role): boolean => role !== 'customer';
