import { env } from '../../config/env';

// The storefront routes the emails link to. Keep in sync with the frontend router.
export const clientUrl = (path: string, params: Record<string, string> = {}): string => {
  const url = new URL(path, env.CLIENT_ORIGINS[0]);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url.toString();
};

export const orderTrackingUrl = (orderNumber: string) => clientUrl('/order-tracking', { order: orderNumber });
