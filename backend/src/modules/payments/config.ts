import { env } from '../../config/env';
import { EASYPAY_BASE, type EasypaisaConfig } from './providers/easypaisa';
import { JAZZCASH_URLS, type JazzCashConfig } from './providers/jazzcash';

const api = () => (env.API_PUBLIC_URL ?? '').replace(/\/+$/, '');

export function jazzCashConfigFromEnv(): JazzCashConfig | null {
  if (!env.JAZZCASH_MERCHANT_ID || !env.JAZZCASH_PASSWORD || !env.JAZZCASH_INTEGRITY_SALT) return null;
  return {
    merchantId: env.JAZZCASH_MERCHANT_ID,
    password: env.JAZZCASH_PASSWORD,
    integritySalt: env.JAZZCASH_INTEGRITY_SALT,
    ppVersion: env.JAZZCASH_PP_VERSION,
    txnType: env.JAZZCASH_TXN_TYPE,
    paymentUrl: env.JAZZCASH_PAYMENT_URL ?? JAZZCASH_URLS[env.JAZZCASH_ENV],
    inquiryUrl: env.JAZZCASH_INQUIRY_URL,
    returnUrl: `${api()}/api/v1/payments/jazzcash/return`,
  };
}

export function easypaisaConfigFromEnv(): EasypaisaConfig | null {
  if (!env.EASYPAISA_STORE_ID) return null;
  return {
    storeId: env.EASYPAISA_STORE_ID,
    hashKey: env.EASYPAISA_HASH_KEY,
    baseUrl: EASYPAY_BASE[env.EASYPAISA_ENV],
    postBackUrl: `${api()}/api/v1/payments/easypaisa/postback`,
    inquiryUrl: env.EASYPAISA_INQUIRY_URL,
    accountNum: env.EASYPAISA_ACCOUNT_NUM,
    username: env.EASYPAISA_USERNAME,
    password: env.EASYPAISA_PASSWORD,
  };
}
