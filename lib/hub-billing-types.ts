export type BillingInterval = 'month' | 'year';

export type BillingStatus = {
  configured: boolean;
  mode: 'live' | 'test' | 'unconfigured';
  message: string | null;
  plan: 'starter' | 'pro';
  canManage: boolean;
  subscription: null | {
    status: string;
    interval: BillingInterval;
    /** Unix timestamp in milliseconds; the period actually paid for. */
    currentPeriodEnd: number;
    cancelAtPeriodEnd: boolean;
  };
  prices: {monthly: 149; yearly: 1490; currency: 'THB'};
  terms: {autoRenew: true; cancelAtPeriodEnd: true};
};

export const HUB_BILLING_PRICES = {monthly: 149, yearly: 1490, currency: 'THB'} as const;
export const HUB_BILLING_TERMS_VERSION = '2026-11-13';
