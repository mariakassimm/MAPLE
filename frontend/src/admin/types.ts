import type { Image, Order, Pagination, PaymentMethodId } from '@/types/api';

export interface Money {
  value: number;
  orders: number;
}
export interface AdminOrderListItem {
  id: string;
  orderNumber: string;
  placedAt: string;
  customerName: string;
  phone: string;
  city: string;
  total: number;
  status: string;
  paymentMethod: PaymentMethodId;
  paymentStatus: string;
  itemCount: number;
  demoPayment?: boolean;
}
export interface Dashboard {
  currency: 'PKR';
  range: { from: string; to: string };
  orders: { placed: number; byStatus: Record<string, number>; pending: number; delivered: number; cancelled: number };
  sales: {
    grossOrderValue: number;
    ordersCounted: number;
    averageOrderValue: number;
    refunded: number;
    onlinePaid: Money;
    cod: {
      deliveredValue: number;
      collected: number;
      remittedToUs: number;
      courierCharges: number;
      awaitingRemittance: number;
    };
  };
  paymentMethods: Record<string, number>;
  topProducts: { productId: string; name: string; units: number; revenue: number }[];
  series: { date: string; orders: number; gross: number }[];
  lowStock: { count: number; items: InventoryRow[] };
  recentOrders: AdminOrderListItem[];
  customers: { total: number; newInRange: number };
  attention: { openReturns: number; pendingReviews: number; shipmentsNeedingReview: number };
}
export interface InventoryRow {
  productId: string;
  productName: string;
  variantId: string;
  sku: string;
  options: { name: string; value: string }[];
  available: number;
  reserved: number;
  lowStockThreshold: number;
  image?: Image | null;
}
export interface PaymentRow {
  paymentRef: string;
  orderNumber: string;
  provider: string;
  status: string;
  amount: number;
  attempt: number;
  providerRef: string | null;
  responseMessage: string | null;
  reviewReason: string | null;
  paidAt: string | null;
  createdAt: string;
}
export interface ShipmentRow {
  id: string;
  orderNumber: string;
  courier: string;
  mode: string;
  trackingNumber: string | null;
  status: string;
  active: boolean;
  codAmount: number;
  weightKg: number;
  pieces: number;
  needsReview: boolean;
  bookingError: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
  events: { at: string; description: string; status?: string; source?: string }[];
}
export interface AdminOrder extends Order {
  id: string;
  userId: string | null;
  inventoryState: string;
  demoPayment?: boolean;
  cod: { amountDue: number; collectedAmount: number; remittedAmount: number; courierCharges: number } | null;
  statusHistory: { status: string; at: string; actorRole: string | null; reason: string | null }[];
  payments: PaymentRow[];
  shipments: ShipmentRow[];
}
export type Paged<T> = { items: T[]; pagination: Pagination };
