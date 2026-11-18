import { env } from '../../config/env';
import { easypaisaConfigFromEnv, jazzCashConfigFromEnv } from './config';
import { DemoPaymentProvider } from './providers/demo';
import { EasypaisaProvider } from './providers/easypaisa';
import { JazzCashProvider } from './providers/jazzcash';
import type { PaymentProvider, ProviderId } from './types';

export interface Providers {
  jazzcash?: JazzCashProvider;
  easypaisa?: EasypaisaProvider;
}

let current: Providers | undefined;

// Built lazily from the environment; a provider simply does not exist until its credentials are configured,
// which is what keeps unconfigured methods out of checkout.
export function getProviders(): Providers {
  if (!current) {
    const jazz = jazzCashConfigFromEnv();
    const easy = easypaisaConfigFromEnv();
    current = {
      ...(jazz && { jazzcash: new JazzCashProvider(jazz) }),
      ...(easy && { easypaisa: new EasypaisaProvider(easy) }),
    };
  }
  return current;
}

/** Test seam: inject providers built with test credentials and fake HTTP. */
export const setProviders = (providers: Providers): void => {
  current = providers;
};
export const resetProviders = (): void => {
  current = undefined;
};

// A real provider always wins. A simulation stands in only when DEMO_MODE is on and that provider has no credentials.
const demos = new Map<ProviderId, DemoPaymentProvider>();
const demoFor = (id: ProviderId): PaymentProvider | undefined => {
  if (!env.DEMO_MODE) return undefined;
  if (!demos.has(id)) demos.set(id, new DemoPaymentProvider(id));
  return demos.get(id);
};
export const getProvider = (id: ProviderId): PaymentProvider | undefined => getProviders()[id] ?? demoFor(id);
export const isDemoProvider = (id: ProviderId): boolean => !getProviders()[id] && !!demoFor(id);

export const providerAvailability = () => ({
  jazzcash: !!getProvider('jazzcash'),
  easypaisa: !!getProvider('easypaisa'),
});
export type ProviderAvailability = ReturnType<typeof providerAvailability>;
