// Mirrors the backend matrix so the UI hides what a role cannot use. The server enforces every permission regardless.
export type Role = 'customer' | 'super_admin' | 'product_manager' | 'order_manager' | 'support_staff';
export type Permission =
  | 'catalog:read'
  | 'products:write'
  | 'categories:write'
  | 'inventory:read'
  | 'inventory:write'
  | 'orders:read'
  | 'orders:write'
  | 'orders:cancel'
  | 'shipments:write'
  | 'payments:read'
  | 'payments:write'
  | 'customers:read'
  | 'customers:notes'
  | 'coupons:write'
  | 'reviews:moderate'
  | 'returns:read'
  | 'returns:manage'
  | 'content:write'
  | 'settings:write'
  | 'staff:manage'
  | 'reports:read'
  | 'audit:read';

const ALL: Permission[] = [
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
];

const MATRIX: Record<Role, readonly Permission[]> = {
  customer: [],
  super_admin: ALL,
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
  support_staff: [
    'catalog:read',
    'orders:read',
    'customers:read',
    'customers:notes',
    'returns:read',
    'reviews:moderate',
  ],
};

export const can = (role: string | undefined, p: Permission): boolean =>
  !!role && role in MATRIX && MATRIX[role as Role].includes(p);
export const isStaff = (role: string | undefined) => !!role && role !== 'customer' && role in MATRIX;

export const ORDER_TRANSITIONS: Record<string, string[]> = {
  awaiting_payment: ['confirmed', 'cancelled'],
  pending_confirmation: ['confirmed', 'cancelled'],
  confirmed: ['processing', 'cancelled'],
  processing: ['packed', 'cancelled'],
  packed: ['ready_for_dispatch', 'cancelled'],
  ready_for_dispatch: ['shipped', 'cancelled'],
  shipped: ['out_for_delivery', 'delivered', 'delivery_failed'],
  out_for_delivery: ['delivered', 'delivery_failed'],
  delivery_failed: ['out_for_delivery', 'delivered', 'returned_to_origin'],
  delivered: [],
  returned_to_origin: [],
  cancelled: [],
};
