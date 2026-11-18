import { env } from '../../config/env';
import type { CourierId, CourierProvider } from './types';
import { DemoCourier } from './providers/demo';
import { LeopardsProvider } from './providers/leopards';
import { TCS_BASE, TcsProvider, type ShipFrom } from './providers/tcs';

const shipFrom = (): ShipFrom => ({
  name: env.SHIP_FROM_NAME ?? '',
  phone: env.SHIP_FROM_PHONE ?? '',
  city: env.SHIP_FROM_CITY ?? '',
  address: env.SHIP_FROM_ADDRESS ?? '',
});

export interface Couriers {
  tcs?: CourierProvider;
  leopards?: CourierProvider;
}

let current: Couriers | undefined;

// A courier exists only once its credentials are configured. Without one, staff use manual booking.
export function getCouriers(): Couriers {
  if (!current) {
    current = {
      ...(env.TCS_USERNAME &&
        env.TCS_PASSWORD &&
        env.TCS_ACCOUNT_NUMBER &&
        env.TCS_COST_CENTER_CODE && {
          tcs: new TcsProvider({
            baseUrl: TCS_BASE[env.TCS_ENV],
            username: env.TCS_USERNAME,
            password: env.TCS_PASSWORD,
            accountNumber: env.TCS_ACCOUNT_NUMBER,
            costCenterCode: env.TCS_COST_CENTER_CODE,
            serviceCode: env.TCS_SERVICE_CODE,
            shipFrom: shipFrom(),
          }),
        }),
      ...(env.LEOPARDS_BASE_URL &&
        env.LEOPARDS_API_KEY &&
        env.LEOPARDS_API_PASSWORD && {
          leopards: new LeopardsProvider({
            baseUrl: env.LEOPARDS_BASE_URL,
            apiKey: env.LEOPARDS_API_KEY,
            apiPassword: env.LEOPARDS_API_PASSWORD,
          }),
        }),
      // A real courier always wins; a simulation fills the gap only in DEMO_MODE.
      ...(env.DEMO_MODE && {
        ...(!(env.TCS_USERNAME && env.TCS_PASSWORD && env.TCS_ACCOUNT_NUMBER && env.TCS_COST_CENTER_CODE) && {
          tcs: new DemoCourier('tcs' satisfies CourierId),
        }),
        ...(!(env.LEOPARDS_BASE_URL && env.LEOPARDS_API_KEY && env.LEOPARDS_API_PASSWORD) && {
          leopards: new DemoCourier('leopards' satisfies CourierId),
        }),
      }),
    };
  }
  return current;
}

/** Test seam. */
export const setCouriers = (couriers: Couriers): void => {
  current = couriers;
};
export const resetCouriers = (): void => {
  current = undefined;
};
