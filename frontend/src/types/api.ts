export interface Image {
  url: string;
  alt: string;
  publicId?: string;
}
export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
export interface CategoryRef {
  id: string;
  name: string;
  slug: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image: Image | null;
  status: string;
  displayOrder: number;
  productCount?: number;
}

export interface ProductCard {
  id: string;
  slug: string;
  name: string;
  shortDescription: string | null;
  category: CategoryRef | null;
  images: Image[];
  currency: 'PKR';
  price: number | null;
  compareAtPrice: number | null;
  hasPriceRange: boolean;
  colors: string[];
  inStock: boolean;
  quickAddVariantId: string | null;
  rating: { average: number; count: number } | null;
  featured: boolean;
  bestseller: boolean;
  isNew?: boolean;
}

export interface Variant {
  id: string;
  sku: string;
  options: { name: string; value: string }[];
  price: number;
  compareAtPrice: number | null;
  inStock: boolean;
  lowStock: boolean;
}

export interface ProductDetail extends ProductCard {
  description: string;
  attributes: { label: string; value: string }[];
  seo: { title: string | null; description: string | null };
  publishedAt: string | null;
  variants: Variant[];
}

export interface ProductList {
  items: ProductCard[];
  pagination: Pagination;
}
export interface Facets {
  currency: 'PKR';
  priceRange: { min: number; max: number } | null;
  colors: { value: string; count: number }[];
  newArrivalDays: number;
}

export interface ProductQuery {
  page?: number;
  limit?: number;
  sort?: 'featured' | 'newest' | 'price_asc' | 'price_desc' | 'name_asc';
  new?: boolean;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  availability?: 'in_stock';
  color?: string;
  q?: string;
}

export interface Review {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  displayName: string;
  verifiedPurchase: boolean;
  createdAt: string;
}
export interface ReviewList {
  summary: { average: number | null; count: number } | null;
  items: Review[];
  pagination: Pagination;
}

export interface HomeContent {
  hero: {
    label: string;
    headline: string;
    subheadline: string;
    ctaLabel: string;
    ctaUrl: string;
    image: Image | null;
    imageMobile: Image | null;
    videoUrl: string | null;
    videoPoster: Image | null;
  };
  collections: { title: string; description: string; url: string; image: Image | null }[];
  newArrivals: ProductCard[];
  bestsellers: ProductCard[];
  brandStory: { headline: string; body: string; image: Image | null };
  editorial: { headline: string; body: string; linkLabel: string; linkUrl: string; image: Image | null };
  testimonials: {
    displayName: string;
    rating: number;
    title: string | null;
    body: string;
    product: { name: string; slug: string } | null;
  }[];
  newsletter: { headline: string; subheadline: string };
}

export interface SiteContent {
  announcement: string | null;
  contact: { email?: string; phone?: string; whatsapp?: string; address?: string };
  social: { instagram?: string; facebook?: string; tiktok?: string; youtube?: string; pinterest?: string };
  footerStatement: string;
  /** True when the API runs with DEMO_MODE (simulated payments and couriers). */
  demoMode?: boolean;
}

export interface PricedLine {
  variantId: string;
  productId: string | null;
  productSlug: string | null;
  sku: string | null;
  name: string | null;
  options: { name: string; value: string }[];
  image: Image | null;
  unitPrice: number;
  compareAtPrice: number | null;
  quantity: number;
  lineTotal: number;
  status: 'ok' | 'unavailable' | 'insufficient_stock';
  availableQuantity: number | null;
}
export interface PricedCart {
  currency: 'PKR';
  lines: PricedLine[];
  subtotal: number;
  discount: number;
  coupon: { code: string; valid: boolean; message: string | null } | null;
  shippingFee: number;
  total: number;
  freeShippingRemaining: number | null;
  canCheckout: boolean;
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  status: string;
  emailVerified: boolean;
  createdAt: string;
}
export interface Session {
  user: User;
  csrfToken: string;
}
export interface PageContent {
  slug: string;
  title: string;
  body: string;
  seoTitle: string | null;
  seoDescription: string | null;
  updatedAt?: string;
}

export const PROVINCES = [
  'Punjab',
  'Sindh',
  'Khyber Pakhtunkhwa',
  'Balochistan',
  'Islamabad Capital Territory',
  'Gilgit-Baltistan',
  'Azad Jammu and Kashmir',
] as const;
export type Province = (typeof PROVINCES)[number];
export type PaymentMethodId = 'cod' | 'jazzcash' | 'easypaisa';
export interface PaymentOption {
  id: PaymentMethodId;
  available: boolean;
  reason?: string;
  demo?: boolean;
}
export interface Quote {
  cart: PricedCart;
  serviceability: { serviceable: boolean; codAvailable: boolean } | null;
  paymentMethods: PaymentOption[];
}
export interface CityOption {
  city: string;
  province: Province;
  codAvailable: boolean;
}
export interface RedirectForm {
  method: 'POST';
  action: string;
  fields: Record<string, string>;
}

export interface OrderItem {
  productId: string;
  variantId: string;
  sku: string;
  name: string;
  options: { name: string; value: string }[];
  image: Image | null;
  unitPrice: number;
  compareAtPrice: number | null;
  quantity: number;
  lineTotal: number;
  productSlug?: string | null;
}
export interface ShipmentView {
  courier: string;
  trackingNumber: string;
  status: string;
  events: { at: string; description: string; location: string | null }[];
}
export interface Order {
  orderNumber: string;
  placedAt: string;
  status: string;
  paymentMethod: PaymentMethodId;
  paymentStatus: string;
  shipmentStatus: string;
  currency: 'PKR';
  customer: { name: string; phone: string; email?: string };
  shippingAddress: {
    recipientName?: string;
    phone?: string;
    province: string;
    city: string;
    area: string;
    line1: string;
    postalCode?: string;
  };
  items: OrderItem[];
  subtotal: number;
  discountTotal: number;
  couponCode: string | null;
  shippingFee: number;
  total: number;
  notes: string | null;
  timeline: { status: string; at: string }[];
  cancellation: { reason: string; at: string } | null;
  shipment?: ShipmentView | null;
}
export interface OrderSummary {
  orderNumber: string;
  placedAt: string;
  status: string;
  paymentMethod: PaymentMethodId;
  paymentStatus: string;
  total: number;
  currency: 'PKR';
  itemCount: number;
  thumbnail: Image | null;
}
export interface Address {
  id: string;
  label: string;
  recipientName: string;
  phone: string;
  province: Province;
  city: string;
  area: string;
  line1: string;
  postalCode: string | null;
  notes: string | null;
  isDefault: boolean;
}
export interface ReturnRequest {
  reference: string;
  orderNumber: string;
  type: 'refund' | 'exchange';
  reason: string;
  details: string | null;
  status: string;
  items: { name: string; sku: string; quantity: number }[];
  refundAmount: number | null;
  resolutionNote: string | null;
  timeline: { status: string; at: string }[];
  createdAt: string;
}
