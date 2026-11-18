import { api } from '@/lib/api';
import type {
  Category,
  Facets,
  HomeContent,
  PageContent,
  PricedCart,
  ProductDetail,
  ProductList,
  ProductQuery,
  ReviewList,
  Session,
  SiteContent,
  User,
} from '@/types/api';

export const fetchHome = () => api.get<HomeContent>('/content/home');
export const fetchSite = () => api.get<{ site: SiteContent }>('/content/site').then((r) => r.site);
export const fetchPage = (slug: string) =>
  api.get<{ page: PageContent } | PageContent>(`/content/pages/${slug}`).then((r) => ('page' in r ? r.page : r));
export const fetchCategories = () => api.get<{ categories: Category[] }>('/categories').then((r) => r.categories);
export const fetchProducts = (q: ProductQuery) => api.get<ProductList>('/products', q);
export const fetchFacets = (scope: { category?: string; new?: boolean } = {}) =>
  api.get<Facets>('/products/facets', scope);
// The API wraps the product with its related items: { product, related }.
export const fetchProduct = (slug: string) =>
  api.get<{ product: ProductDetail }>(`/products/${slug}`).then((r) => r.product);
export const fetchReviews = (slug: string, page = 1) =>
  api.get<ReviewList>(`/products/${slug}/reviews`, { page, limit: 6 });
export const priceCart = (items: { variantId: string; quantity: number }[], couponCode?: string | null) =>
  api.post<{ cart: PricedCart }>('/cart/price', { items, ...(couponCode ? { couponCode } : {}) }).then((r) => r.cart);
export const subscribeNewsletter = (email: string) => api.post<unknown>('/newsletter/subscribe', { email });

export const login = (body: { email: string; password: string; portal?: 'store' | 'admin' }) =>
  api.post<Session>('/auth/login', body);
export const register = (body: { name: string; email: string; password: string; phone?: string }) =>
  api.post<Session>('/auth/register', body);
export const logout = () => api.post<unknown>('/auth/logout');
export const fetchMe = () => api.get<Session>('/auth/me');
export const forgotPassword = (email: string) => api.post<unknown>('/auth/forgot-password', { email });
export const resetPassword = (body: { token: string; password: string }) =>
  api.post<unknown>('/auth/reset-password', body);
export const verifyEmail = (token: string) => api.post<unknown>('/auth/verify-email', { token });
export type { User };
