import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Spinner } from '@/components/ui/States';
import { RequireAuth } from '@/pages/RequireAuth';

const HomePage = lazy(() => import('@/pages/HomePage'));
const ShopPage = lazy(() => import('@/pages/ShopPage'));
const CollectionPage = lazy(() => import('@/pages/CollectionPage'));
const NewArrivalsPage = lazy(() => import('@/pages/NewArrivalsPage'));
const ProductPage = lazy(() => import('@/pages/ProductPage'));
const BagPage = lazy(() => import('@/pages/BagPage'));
const LoginPage = lazy(() => import('@/pages/auth/LoginPage'));
const RegisterPage = lazy(() => import('@/pages/auth/RegisterPage'));
const ForgotPasswordPage = lazy(() => import('@/pages/auth/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('@/pages/auth/ResetPasswordPage'));
const VerifyEmailPage = lazy(() => import('@/pages/auth/VerifyEmailPage'));
const AboutPage = lazy(() => import('@/pages/AboutPage'));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));
const CheckoutPage = lazy(() => import('@/pages/CheckoutPage'));
const CheckoutResultPage = lazy(() => import('@/pages/CheckoutResultPage'));
const OrderTrackingPage = lazy(() => import('@/pages/OrderTrackingPage'));
const ReturnsPage = lazy(() => import('@/pages/ReturnsPage'));
const UnsubscribePage = lazy(() => import('@/pages/UnsubscribePage'));
const ConfirmNewsletterPage = lazy(() => import('@/pages/ConfirmNewsletterPage'));
const AccountLayout = lazy(() => import('@/pages/account/AccountLayout'));
const ProfilePage = lazy(() => import('@/pages/account/ProfilePage'));
const OrdersPage = lazy(() => import('@/pages/account/OrdersPage'));
const OrderDetailPage = lazy(() => import('@/pages/account/OrderDetailPage'));
const AddressesPage = lazy(() => import('@/pages/account/AddressesPage'));
const AccountReturnsPage = lazy(() => import('@/pages/account/AccountReturnsPage'));
const ContactPage = lazy(() => import('@/pages/ContactPage'));
const AdminLayout = lazy(() => import('@/admin/AdminLayout'));
const AdminHome = lazy(() => import('@/admin/AdminHome'));
const AdminLogin = lazy(() => import('@/admin/AdminLoginPage'));
const AdminProfile = lazy(() => import('@/admin/pages/AdminProfilePage'));
const AdminOrders = lazy(() => import('@/admin/pages/OrdersListPage'));
const AdminOrderDetail = lazy(() => import('@/admin/pages/OrderDetailPage'));
const AdminShipments = lazy(() => import('@/admin/pages/ListPages').then((m) => ({ default: m.ShipmentsPage })));
const AdminPayments = lazy(() => import('@/admin/pages/ListPages').then((m) => ({ default: m.PaymentsPage })));
const AdminCod = lazy(() => import('@/admin/pages/ListPages').then((m) => ({ default: m.CodPage })));
const AdminProducts = lazy(() => import('@/admin/pages/ProductsPage'));
const AdminProductEdit = lazy(() => import('@/admin/pages/ProductEditPage'));
const AdminCategories = lazy(() => import('@/admin/pages/CatalogPages').then((m) => ({ default: m.CategoriesPage })));
const AdminInventory = lazy(() => import('@/admin/pages/CatalogPages').then((m) => ({ default: m.InventoryPage })));
const AdminReturns = lazy(() =>
  import('@/admin/pages/ReturnsReviewsPages').then((m) => ({ default: m.AdminReturnsPage })),
);
const AdminReviews = lazy(() =>
  import('@/admin/pages/ReturnsReviewsPages').then((m) => ({ default: m.AdminReviewsPage })),
);
const AdminCustomers = lazy(() =>
  import('@/admin/pages/CustomersCouponsPages').then((m) => ({ default: m.CustomersPage })),
);
const AdminCustomerDetail = lazy(() =>
  import('@/admin/pages/CustomersCouponsPages').then((m) => ({ default: m.CustomerDetailPage })),
);
const AdminCoupons = lazy(() =>
  import('@/admin/pages/CustomersCouponsPages').then((m) => ({ default: m.CouponsPage })),
);
const AdminContent = lazy(() => import('@/admin/pages/ContentPages').then((m) => ({ default: m.ContentPage })));
const AdminNewsletter = lazy(() =>
  import('@/admin/pages/ContentPages').then((m) => ({ default: m.NewsletterAdminPage })),
);
const AdminSettings = lazy(() => import('@/admin/pages/SettingsPages').then((m) => ({ default: m.SettingsPage })));
const AdminAreas = lazy(() => import('@/admin/pages/SettingsPages').then((m) => ({ default: m.ServiceAreasPage })));
const AdminStaff = lazy(() => import('@/admin/pages/SettingsPages').then((m) => ({ default: m.StaffPage })));
const AdminAudit = lazy(() => import('@/admin/pages/AuditPage'));
import { SessionWatcher } from '@/components/SessionWatcher';
const PageBySlug = lazy(() => import('@/pages/PageBySlug'));

export default function App() {
  return (
    <Suspense
      fallback={
        <div className="py-40">
          <Spinner />
        </div>
      }
    >
      <SessionWatcher />
      <Routes>
        <Route path="admin/login" element={<AdminLogin />} />
        <Route path="admin" element={<AdminLayout />}>
          <Route index element={<AdminHome />} />
          <Route path="profile" element={<AdminProfile />} />
          <Route path="orders" element={<AdminOrders />} />
          <Route path="orders/:id" element={<AdminOrderDetail />} />
          <Route path="shipments" element={<AdminShipments />} />
          <Route path="payments" element={<AdminPayments />} />
          <Route path="cod" element={<AdminCod />} />
          <Route path="products" element={<AdminProducts />} />
          <Route path="products/new" element={<AdminProductEdit />} />
          <Route path="products/:id" element={<AdminProductEdit />} />
          <Route path="categories" element={<AdminCategories />} />
          <Route path="inventory" element={<AdminInventory />} />
          <Route path="returns" element={<AdminReturns />} />
          <Route path="reviews" element={<AdminReviews />} />
          <Route path="customers" element={<AdminCustomers />} />
          <Route path="customers/:id" element={<AdminCustomerDetail />} />
          <Route path="coupons" element={<AdminCoupons />} />
          <Route path="content" element={<AdminContent />} />
          <Route path="newsletter" element={<AdminNewsletter />} />
          <Route path="settings" element={<AdminSettings />} />
          <Route path="service-areas" element={<AdminAreas />} />
          <Route path="staff" element={<AdminStaff />} />
          <Route path="audit" element={<AdminAudit />} />
          <Route path="*" element={<div className="py-20 text-center text-stone">Page not found.</div>} />
        </Route>
        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="shop" element={<ShopPage />} />
          <Route path="collections/:slug" element={<CollectionPage />} />
          <Route path="products/:slug" element={<ProductPage />} />
          <Route path="bag" element={<BagPage />} />
          <Route path="login" element={<LoginPage />} />
          <Route path="register" element={<RegisterPage />} />
          <Route path="forgot-password" element={<ForgotPasswordPage />} />
          <Route path="reset-password" element={<ResetPasswordPage />} />
          <Route path="verify-email" element={<VerifyEmailPage />} />
          <Route path="checkout" element={<CheckoutPage />} />
          <Route path="checkout/result" element={<CheckoutResultPage />} />
          <Route path="order-tracking" element={<OrderTrackingPage />} />
          <Route path="returns" element={<ReturnsPage />} />
          <Route path="newsletter/unsubscribe" element={<UnsubscribePage />} />
          <Route path="newsletter/confirm" element={<ConfirmNewsletterPage />} />
          <Route path="account" element={<RequireAuth />}>
            <Route element={<AccountLayout />}>
              <Route index element={<ProfilePage />} />
              <Route path="orders" element={<OrdersPage />} />
              <Route path="orders/:orderNumber" element={<OrderDetailPage />} />
              <Route path="addresses" element={<AddressesPage />} />
              <Route path="returns" element={<AccountReturnsPage />} />
            </Route>
          </Route>
          <Route path="about" element={<AboutPage />} />
          <Route path="contact" element={<ContactPage />} />
          <Route path="new-arrivals" element={<NewArrivalsPage />} />
          <Route path="pages/:slug" element={<PageBySlug />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
