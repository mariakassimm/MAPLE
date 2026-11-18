import { api } from '@/lib/api';
import type {
  Address,
  CityOption,
  Order,
  OrderSummary,
  Pagination,
  PaymentMethodId,
  Province,
  Quote,
  RedirectForm,
  ReturnRequest,
  User,
} from '@/types/api';

export const fetchQuote = (body: {
  items: { variantId: string; quantity: number }[];
  couponCode?: string | null;
  province?: string;
  city?: string;
}) => api.post<Quote>('/checkout/quote', { ...body, couponCode: body.couponCode || undefined });
export const fetchCities = () => api.get<{ cities: CityOption[] }>('/checkout/cities').then((r) => r.cities);

export interface PlaceOrderBody {
  items: { variantId: string; quantity: number }[];
  couponCode?: string;
  paymentMethod: PaymentMethodId;
  customer: { name: string; phone: string; email?: string };
  shippingAddress: {
    province: Province;
    city: string;
    area: string;
    line1: string;
    postalCode?: string;
    notes?: string;
  };
  notes?: string;
  expectedTotal: number;
}
export const placeOrder = (body: PlaceOrderBody, idempotencyKey: string) =>
  api.post<{ order: Order }>('/orders', body, { 'Idempotency-Key': idempotencyKey }).then((r) => r.order);
export const initiatePayment = (provider: 'jazzcash' | 'easypaisa', orderNumber: string, phone: string) =>
  api.post<{ paymentRef: string; redirect: RedirectForm }>(`/payments/${provider}/initiate`, { orderNumber, phone });

export const trackOrder = (orderNumber: string, phone: string) =>
  api.post<{ order: Order }>('/orders/track', { orderNumber, phone }).then((r) => r.order);
export const cancelGuestOrder = (orderNumber: string, phone: string, reason?: string) =>
  api.post<{ order: Order }>('/orders/cancel', { orderNumber, phone, reason }).then((r) => r.order);

export const fetchAccountOrders = (page: number) =>
  api.get<{ items: OrderSummary[]; pagination: Pagination }>('/account/orders', { page, limit: 10 });
export const fetchAccountOrder = (n: string) => api.get<{ order: Order }>(`/account/orders/${n}`).then((r) => r.order);
export const cancelAccountOrder = (n: string, reason?: string) =>
  api.post<{ order: Order }>(`/account/orders/${n}/cancel`, { reason }).then((r) => r.order);

export const fetchAddresses = () => api.get<{ addresses: Address[] }>('/account/addresses').then((r) => r.addresses);
export type AddressInput = Omit<Address, 'id' | 'postalCode' | 'notes' | 'isDefault'> & {
  postalCode?: string;
  notes?: string;
  isDefault?: boolean;
};
export const createAddress = (b: AddressInput) => api.post<{ address: Address }>('/account/addresses', b);
export const updateAddress = (id: string, b: Partial<AddressInput>) =>
  api.patch<{ address: Address }>(`/account/addresses/${id}`, b);
export const deleteAddress = (id: string) => api.del<unknown>(`/account/addresses/${id}`);
export const updateProfile = (b: { name?: string; phone?: string | null }) =>
  api.patch<{ user: User }>('/account/profile', b).then((r) => r.user);
export const changePassword = (b: { currentPassword: string; newPassword: string }) =>
  api.post<unknown>('/account/change-password', b);

export const fetchAccountReturns = () =>
  api.get<{ returns: ReturnRequest[] }>('/account/returns').then((r) => r.returns);
export const createReturn = (b: {
  orderNumber: string;
  phone: string;
  type: 'refund' | 'exchange';
  reason: string;
  details?: string;
  items: { variantId: string; quantity: number }[];
}) => api.post<{ return: ReturnRequest }>('/returns', b).then((r) => r.return);
export const lookupReturns = (orderNumber: string, phone: string) =>
  api.post<{ returns: ReturnRequest[] }>('/returns/lookup', { orderNumber, phone }).then((r) => r.returns);
export const submitReview = (b: { productSlug: string; rating: number; title?: string; body: string }) =>
  api.post<{ review: { message: string } }>('/account/reviews', b).then((r) => r.review);
export const confirmNewsletter = (email: string, token: string) =>
  api.post<unknown>('/newsletter/confirm', { email, token });
export const unsubscribeNewsletter = (email: string, token: string) =>
  api.post<unknown>('/newsletter/unsubscribe', { email, token });
