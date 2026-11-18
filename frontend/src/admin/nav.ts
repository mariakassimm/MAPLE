import {
  BarChart3,
  BookOpen,
  Boxes,
  Mail,
  MapPin,
  MessageSquare,
  Package,
  RotateCcw,
  Settings,
  ShoppingBag,
  Tag,
  Truck,
  UserCog,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { can, type Permission } from '@/admin/permissions';

export type Item = { to: string; label: string; icon: LucideIcon; need: Permission };
export const GROUPS: { title: string; items: Item[] }[] = [
  { title: 'Overview', items: [{ to: '/admin', label: 'Dashboard', icon: BarChart3, need: 'reports:read' }] },
  {
    title: 'Sales',
    items: [
      { to: '/admin/orders', label: 'Orders', icon: ShoppingBag, need: 'orders:read' },
      { to: '/admin/shipments', label: 'Shipments', icon: Truck, need: 'orders:read' },
      { to: '/admin/payments', label: 'Payments', icon: Wallet, need: 'payments:read' },
      { to: '/admin/cod', label: 'COD ledger', icon: Wallet, need: 'payments:read' },
      { to: '/admin/returns', label: 'Returns', icon: RotateCcw, need: 'returns:read' },
    ],
  },
  {
    title: 'Catalogue',
    items: [
      { to: '/admin/products', label: 'Products', icon: Package, need: 'catalog:read' },
      { to: '/admin/categories', label: 'Categories', icon: Tag, need: 'catalog:read' },
      { to: '/admin/inventory', label: 'Inventory', icon: Boxes, need: 'inventory:read' },
      { to: '/admin/reviews', label: 'Reviews', icon: MessageSquare, need: 'reviews:moderate' },
    ],
  },
  {
    title: 'Customers',
    items: [
      { to: '/admin/customers', label: 'Customers', icon: Users, need: 'customers:read' },
      { to: '/admin/coupons', label: 'Coupons', icon: Tag, need: 'coupons:write' },
      { to: '/admin/newsletter', label: 'Newsletter', icon: Mail, need: 'content:write' },
    ],
  },
  {
    title: 'Store',
    items: [
      { to: '/admin/content', label: 'Content', icon: BookOpen, need: 'content:write' },
      { to: '/admin/service-areas', label: 'Delivery areas', icon: MapPin, need: 'settings:write' },
      { to: '/admin/settings', label: 'Settings', icon: Settings, need: 'settings:write' },
      { to: '/admin/staff', label: 'Staff', icon: UserCog, need: 'staff:manage' },
      { to: '/admin/audit', label: 'Audit log', icon: BookOpen, need: 'audit:read' },
    ],
  },
];

const ITEMS = GROUPS.flatMap((g) => g.items);

/** The permission a given admin URL needs: the longest matching sidebar entry. Pages outside the sidebar (profile) need none. */
export function permissionForPath(pathname: string): Permission | null {
  const path = pathname.replace(/\/+$/, '') || '/';
  const hit = ITEMS.filter((i) =>
    i.to === '/admin' ? path === '/admin' : path === i.to || path.startsWith(i.to + '/'),
  ).sort((a, b) => b.to.length - a.to.length)[0];
  return hit ? hit.need : null;
}

/** Where a signed-in staff member should land: the dashboard if their role has it, otherwise their first allowed section. */
export function adminHomeFor(role: string): string {
  return ITEMS.find((i) => can(role, i.need))?.to ?? '/admin/profile';
}
