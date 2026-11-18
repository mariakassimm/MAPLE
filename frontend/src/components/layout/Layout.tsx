import { motion, useReducedMotion } from 'motion/react';
import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { CartDrawer } from '@/components/cart/CartDrawer';
import { Footer } from '@/components/layout/Footer';
import { Header } from '@/components/layout/Header';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { useCartSync } from '@/hooks/cartSync';
import { useScrollRestoration } from '@/hooks/scrollRestoration';
import { useSession } from '@/hooks/queries';
import { useUi } from '@/store/ui';

export function Layout() {
  const { pathname } = useLocation();
  const closeMenu = useUi((s) => s.closeMenu);
  const reduce = useReducedMotion();
  useCartSync();
  useSession(); // establishes the CSRF token as early as possible when a session cookie exists
  useScrollRestoration();
  useEffect(() => {
    closeMenu();
  }, [pathname, closeMenu]);
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:bg-charcoal focus:px-4 focus:py-3 focus:text-paper"
      >
        Skip to content
      </a>
      <Header />
      <motion.main
        id="main"
        key={pathname}
        tabIndex={-1}
        className="min-h-[60vh] outline-none"
        {...(reduce
          ? {}
          : {
              initial: { opacity: 0, y: 10 },
              animate: { opacity: 1, y: 0 },
              transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] },
            })}
      >
        <ErrorBoundary resetKey={pathname}>
          <Outlet />
        </ErrorBoundary>
      </motion.main>
      <Footer />
      <CartDrawer />
    </>
  );
}
