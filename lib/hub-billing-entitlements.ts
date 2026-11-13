/**
 * Keep public rendering and authenticated requests honest if a renewal webhook
 * is late. Only Stripe-managed accounts are affected; no content is removed.
 * The billing availability switch controls new purchases, not paid expiries.
 */
export async function expireBillingEntitlement(database: D1Database, accountId: string, now = Date.now()): Promise<boolean> {
  const result = await database.prepare(`UPDATE hub_accounts SET plan='starter',updated_at=?
    WHERE id=? AND plan='pro'
      AND EXISTS (SELECT 1 FROM hub_billing_accounts b WHERE b.account_id=hub_accounts.id AND b.managed=1)
      AND NOT EXISTS (SELECT 1 FROM hub_billing_subscriptions s WHERE s.account_id=hub_accounts.id
        AND s.livemode=1 AND s.status IN ('active','past_due') AND s.paid_until>?)`)
    .bind(now, accountId, now).run();
  return !!result.meta.changes;
}

/** Analytics are a paid entitlement; a manually changed plan or a Checkout URL is not proof of payment. */
export async function hasAnalyticsEntitlement(database: D1Database, accountId: string, now = Date.now()): Promise<boolean> {
  const row = await database.prepare(`SELECT 1 AS allowed FROM hub_accounts a
    WHERE a.id=? AND a.plan='pro'
      AND EXISTS (SELECT 1 FROM hub_billing_accounts b WHERE b.account_id=a.id AND b.managed=1)
      AND EXISTS (SELECT 1 FROM hub_billing_subscriptions s WHERE s.account_id=a.id
        AND s.livemode=1 AND s.status IN ('active','past_due') AND s.paid_until>?)`)
    .bind(accountId, now).first<{allowed: number}>();
  return !!row;
}
