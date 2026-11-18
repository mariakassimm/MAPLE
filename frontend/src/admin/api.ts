import { api } from '@/lib/api';
import type { AdminOrder, AdminOrderListItem, Dashboard, Paged, PaymentRow, ShipmentRow } from '@/admin/types';

export const adminDashboard = (from?: string, to?: string) => api.get<Dashboard>('/admin/dashboard', { from, to });
export const adminOrders = (q: Record<string, string | number | undefined>) =>
  api.get<Paged<AdminOrderListItem>>('/admin/orders', q);
export const adminOrder = (id: string) => api.get<{ order: AdminOrder }>(`/admin/orders/${id}`).then((r) => r.order);
export const setOrderStatus = (id: string, status: string, reason?: string) =>
  api.patch<{ order: AdminOrder }>(`/admin/orders/${id}/status`, { status, ...(reason ? { reason } : {}) });
export const recordCodCollection = (id: string, amount: number) =>
  api.post<unknown>(`/admin/orders/${id}/cod/collection`, { amount });
export const recordCodRemittance = (id: string, b: { amount: number; courierCharges: number; reference: string }) =>
  api.post<unknown>(`/admin/orders/${id}/cod/remittance`, b);
export const codSummary = () =>
  api.get<{
    currency: 'PKR';
    awaitingCollection: { count: number; amount: number };
    awaitingRemittance: {
      count: number;
      amount: number;
      orders: { orderNumber: string; collectedAt: string; collected: number; outstanding: number }[];
    };
    settled: { count: number; collected: number; received: number; courierCharges: number };
  }>('/admin/cod/summary');

export const couriers = () =>
  api.get<{ configured: Record<string, boolean> }>('/admin/couriers').then((r) => r.configured);
export const bookShipment = (
  orderId: string,
  b: { courier?: string; weightKg?: number; pieces?: number; remarks?: string; trackingNumber?: string },
) => api.post<{ shipment: ShipmentRow }>(`/admin/orders/${orderId}/shipments`, b);
export const syncShipment = (id: string) =>
  api.post<{ shipment: ShipmentRow; newEvents: number }>(`/admin/shipments/${id}/sync`);
export const cancelShipment = (id: string) => api.post<{ shipment: ShipmentRow }>(`/admin/shipments/${id}/cancel`);
export const setShipmentStatus = (id: string, status: string, note?: string) =>
  api.post<{ shipment: ShipmentRow }>(`/admin/shipments/${id}/status`, { status, ...(note ? { note } : {}) });
export const attachTracking = (id: string, trackingNumber: string) =>
  api.patch<{ shipment: ShipmentRow }>(`/admin/shipments/${id}`, { trackingNumber });
export const adminShipments = (q: Record<string, string | number | undefined>) =>
  api.get<Paged<ShipmentRow>>('/admin/shipments', q);
export const adminPayments = (q: Record<string, string | number | undefined>) =>
  api.get<Paged<PaymentRow>>('/admin/payments', q);

import type { Image } from '@/types/api';
import type { InventoryRow } from '@/admin/types';

export interface AdminCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image: Image | null;
  status: 'active' | 'archived';
  displayOrder: number;
  productCount?: number;
}
export const adminCategories = () =>
  api.get<{ categories: AdminCategory[] }>('/admin/categories').then((r) => r.categories);
export const createCategory = (b: { name: string; description?: string; image?: Image; displayOrder?: number }) =>
  api.post<{ category: AdminCategory }>('/admin/categories', b);
export const updateCategory = (
  id: string,
  b: Partial<{
    name: string;
    slug: string;
    description: string;
    image: Image | null;
    displayOrder: number;
    status: 'active' | 'archived';
  }>,
) => api.patch<{ category: AdminCategory }>(`/admin/categories/${id}`, b);

export interface AdminVariant {
  id: string;
  sku: string;
  options: { name: string; value: string }[];
  price: number;
  salePrice: number | null;
  available: number;
  reserved: number;
  lowStockThreshold: number;
  isActive: boolean;
}
export interface AdminProduct {
  id: string;
  name: string;
  slug: string;
  status: 'draft' | 'published' | 'archived';
  categoryId: string;
  shortDescription: string | null;
  description: string;
  featured: boolean;
  bestseller: boolean;
  allowBackorder: boolean;
  images: Image[];
  attributes: { label: string; value: string }[];
  seo: { title: string | null; description: string | null };
  priceMin: number;
  priceMax: number;
  variants: AdminVariant[];
}
export interface AdminProductItem {
  id: string;
  name: string;
  slug: string;
  status: string;
  categoryId: string;
  image: Image | null;
  featured: boolean;
  bestseller: boolean;
  variantCount: number;
  totalAvailable: number;
  priceMin: number;
  priceMax: number;
  updatedAt: string;
}
export const adminProducts = (q: Record<string, string | number | undefined>) =>
  api.get<Paged<AdminProductItem>>('/admin/products', q);
export const adminProduct = (id: string) =>
  api.get<{ product: AdminProduct }>(`/admin/products/${id}`).then((r) => r.product);
export const createProduct = (b: unknown) =>
  api.post<{ product: AdminProduct }>('/admin/products', b).then((r) => r.product);
export const updateProduct = (id: string, b: unknown) =>
  api.patch<{ product: AdminProduct }>(`/admin/products/${id}`, b).then((r) => r.product);
export const productAction = (id: string, action: 'publish' | 'unpublish' | 'archive') =>
  api.post<{ product: AdminProduct }>(`/admin/products/${id}/${action}`);
export const addVariant = (id: string, b: unknown) => api.post<unknown>(`/admin/products/${id}/variants`, b);
export const updateVariant = (id: string, variantId: string, b: unknown) =>
  api.patch<unknown>(`/admin/products/${id}/variants/${variantId}`, b);

export const adminInventory = (q: Record<string, string | number | undefined>) =>
  api.get<Paged<InventoryRow & { isActive: boolean; onHand: number; isLow: boolean; productStatus: string }>>(
    '/admin/inventory',
    q,
  );
export const adjustStock = (b: { productId: string; variantId: string; delta: number; reason: string }) =>
  api.post<unknown>('/admin/inventory/adjustments', b);
export const inventoryMovements = (q: Record<string, string | number | undefined>) =>
  api.get<
    Paged<{
      id: string;
      sku: string;
      type: string;
      stockDelta: number;
      reservedDelta: number;
      stockAfter: number;
      reason: string | null;
      createdAt: string;
    }>
  >('/admin/inventory/movements', q);

export interface UploadSignature {
  uploadUrl: string;
  cloudName: string;
  apiKey: string;
  params: Record<string, string | number>;
  signature: string;
}
export const uploadSignature = (folder: 'products' | 'categories' | 'content', kind?: 'image' | 'video') =>
  api.post<UploadSignature>('/admin/media/signature', kind ? { folder, kind } : { folder });

export interface AdminReturn {
  id: string;
  reference: string;
  orderNumber: string;
  type: 'refund' | 'exchange';
  reason: string;
  details: string | null;
  status: string;
  items: { variantId: string; productId: string; name: string; sku: string; quantity: number }[];
  refundAmount: number | null;
  resolutionNote: string | null;
  customer: { name: string; phone: string; email?: string };
  createdAt: string;
}
export const adminReturns = (q: Record<string, string | number | undefined>) =>
  api.get<Paged<AdminReturn>>('/admin/returns', q);
export const updateReturn = (
  id: string,
  b: { status: string; note?: string; refundAmount?: number; restock?: { variantId: string; quantity: number }[] },
) => api.patch<{ return: AdminReturn }>(`/admin/returns/${id}`, b);
export interface AdminReview {
  id: string;
  productName: string | null;
  productSlug: string | null;
  rating: number;
  title: string | null;
  body: string;
  displayName: string;
  status: string;
  featured: boolean;
  createdAt: string;
}
export const adminReviews = (q: Record<string, string | number | undefined>) =>
  api.get<Paged<AdminReview>>('/admin/reviews', q);
export const moderateReview = (id: string, b: { status?: string; featured?: boolean }) =>
  api.patch<unknown>(`/admin/reviews/${id}`, b);

export interface CustomerRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  emailVerified: boolean;
  status: string;
  joinedAt: string;
  orders: number;
  totalSpent: number;
}
export const adminCustomers = (q: Record<string, string | number | undefined>) =>
  api.get<Paged<CustomerRow>>('/admin/customers', q);
export interface CustomerDetail {
  customer: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    emailVerified: boolean;
    status: string;
    createdAt: string;
    lastLoginAt: string | null;
  };
  stats: { orders: number; totalSpent: number; cancelled: number; addresses: number; returns: number };
  recentOrders: AdminOrderListItem[];
  notes: { id: string; body: string; author: string; createdAt: string }[];
}
export const adminCustomer = (id: string) => api.get<CustomerDetail>(`/admin/customers/${id}`);
export const addCustomerNote = (id: string, body: string) =>
  api.post<unknown>(`/admin/customers/${id}/notes`, { body });

export interface AdminCoupon {
  id: string;
  code: string;
  description: string | null;
  type: 'percent' | 'fixed';
  value: number;
  minOrderValue: number;
  maxDiscount: number | null;
  startsAt: string | null;
  expiresAt: string | null;
  usageLimit: number | null;
  usedCount: number;
  isActive: boolean;
}
export const adminCoupons = () => api.get<{ coupons: AdminCoupon[] }>('/admin/coupons').then((r) => r.coupons);
export const createCoupon = (b: unknown) => api.post<unknown>('/admin/coupons', b);
export const updateCoupon = (id: string, b: unknown) => api.patch<unknown>(`/admin/coupons/${id}`, b);

export interface ServiceArea {
  id: string;
  city: string;
  province: string;
  isActive: boolean;
  codAvailable: boolean;
  couriers: { tcs: boolean; leopards: boolean };
  note: string | null;
}
export const serviceAreas = () => api.get<{ areas: ServiceArea[] }>('/admin/service-areas').then((r) => r.areas);
export const createArea = (b: unknown) => api.post<unknown>('/admin/service-areas', b);
export const updateArea = (id: string, b: unknown) => api.patch<unknown>(`/admin/service-areas/${id}`, b);
export interface StoreSettings {
  shipping: { flatRate: number; freeShippingThreshold: number | null };
  cod: { enabled: boolean; maxOrderValue: number | null };
  maxQuantityPerLine: number;
  returns?: { windowDays: number };
}
export const getSettingsAdmin = () => api.get<{ settings: StoreSettings }>('/admin/settings').then((r) => r.settings);
export const patchSettings = (b: unknown) => api.patch<{ settings: StoreSettings }>('/admin/settings', b);
export interface StaffUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  status: string;
}
export const staffList = () => api.get<{ staff: StaffUser[] }>('/admin/staff').then((r) => r.staff);
export const createStaff = (b: unknown) => api.post<unknown>('/admin/staff', b);
export const updateStaff = (id: string, b: { role?: string; status?: string }) =>
  api.patch<unknown>(`/admin/staff/${id}`, b);

export const getContentAdmin = <T>(key: 'site' | 'home') =>
  api.get<{ content: T }>(`/admin/content/${key}`).then((r) => r.content);
export const patchContent = (key: 'site' | 'home', b: unknown) => api.patch<unknown>(`/admin/content/${key}`, b);
export interface AdminPage {
  id: string;
  slug: string;
  title: string;
  body: string;
  published: boolean;
  seoTitle: string | null;
  seoDescription: string | null;
}
export const adminPages = () => api.get<{ pages: AdminPage[] }>('/admin/pages').then((r) => r.pages);
export const createPage = (b: unknown) => api.post<unknown>('/admin/pages', b);
export const updatePage = (id: string, b: unknown) => api.patch<unknown>(`/admin/pages/${id}`, b);
export const adminSubscribers = (q: Record<string, string | number | undefined>) =>
  api.get<
    Paged<{ email: string; status: string; consentAt: string | null; unsubscribedAt: string | null }> & {
      subscribedTotal: number;
      pendingTotal?: number;
    }
  >('/admin/newsletter', q);

export interface AuditItem {
  id: string;
  at: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  actorId: string | null;
  actorRole: string | null;
  requestId: string | null;
  metadata: Record<string, unknown> | null;
}
export const adminAudit = (q: Record<string, string | number | undefined>) =>
  api.get<Paged<AuditItem>>('/admin/audit', q);
