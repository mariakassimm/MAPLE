import { isStaff } from '@/admin/permissions';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useCart } from '@/store/cart';
import * as svc from '@/services/api';
import { setCsrfToken } from '@/lib/api';
import type { ProductQuery } from '@/types/api';

export const useSite = () => useQuery({ queryKey: ['site'], queryFn: svc.fetchSite, staleTime: 5 * 60_000 });
export const useHome = () => useQuery({ queryKey: ['home'], queryFn: svc.fetchHome, staleTime: 60_000 });
export const useCategories = () =>
  useQuery({ queryKey: ['categories'], queryFn: svc.fetchCategories, staleTime: 5 * 60_000 });
export const useFacets = (scope: { category?: string; new?: boolean } = {}) =>
  useQuery({
    queryKey: ['facets', scope],
    queryFn: () => svc.fetchFacets(scope),
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });
export const useProducts = (q: ProductQuery, opts: { enabled?: boolean } = {}) =>
  useQuery({
    queryKey: ['products', q],
    queryFn: () => svc.fetchProducts(q),
    placeholderData: keepPreviousData,
    enabled: opts.enabled ?? true,
  });
export const useProduct = (slug: string) =>
  useQuery({ queryKey: ['product', slug], queryFn: () => svc.fetchProduct(slug), retry: false });
export const useReviews = (slug: string, page: number) =>
  useQuery({ queryKey: ['reviews', slug, page], queryFn: () => svc.fetchReviews(slug, page) });
export const usePage = (slug: string) =>
  useQuery({ queryKey: ['page', slug], queryFn: () => svc.fetchPage(slug), retry: false });

/** True for administrators and other staff: they are never shoppers. */
export function useIsStaff(): boolean {
  const { data } = useSession();
  return !!data && isStaff(data.user.role);
}

/** The signed-in session, or null for a guest. 401 is an expected answer, not an error. */
export function useSession() {
  return useQuery({
    queryKey: ['session'],
    queryFn: async () => {
      try {
        const s = await svc.fetchMe();
        setCsrfToken(s.csrfToken);
        return s;
      } catch (e) {
        if ((e as { status?: number }).status === 401) {
          setCsrfToken(null);
          return null;
        }
        throw e;
      }
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
}

/** The bag as the server prices it. Prices, discounts and the shipping fee are never computed in the browser. */
export function usePricedCart() {
  const lines = useCart((s) => s.lines);
  const couponCode = useCart((s) => s.couponCode);
  return useQuery({
    queryKey: ['cart-price', lines, couponCode],
    queryFn: () => svc.priceCart(lines, couponCode),
    enabled: lines.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
}
