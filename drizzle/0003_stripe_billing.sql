CREATE TABLE IF NOT EXISTS hub_billing_accounts (
  account_id TEXT PRIMARY KEY NOT NULL REFERENCES hub_accounts(id),
  stripe_customer_id TEXT,
  managed INTEGER NOT NULL DEFAULT 0 CHECK (managed IN (0,1)),
  lock_token TEXT,
  lock_until INTEGER,
  checkout_request_key TEXT,
  checkout_payload_json TEXT,
  checkout_session_id TEXT,
  checkout_interval TEXT CHECK (checkout_interval IN ('month','year')),
  checkout_expires_at INTEGER,
  last_synced_at INTEGER,
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS hub_billing_accounts_stripe_customer_id_unique ON hub_billing_accounts(stripe_customer_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS hub_billing_subscriptions (
  stripe_subscription_id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL REFERENCES hub_accounts(id),
  stripe_customer_id TEXT NOT NULL,
  stripe_price_id TEXT NOT NULL,
  billing_interval TEXT NOT NULL CHECK (billing_interval IN ('month','year')),
  status TEXT NOT NULL,
  current_period_end INTEGER NOT NULL,
  paid_until INTEGER NOT NULL DEFAULT 0,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0 CHECK (cancel_at_period_end IN (0,1)),
  livemode INTEGER NOT NULL CHECK (livemode IN (0,1)),
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS hub_billing_subscriptions_account_idx ON hub_billing_subscriptions(account_id,paid_until);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS hub_billing_webhook_events (
  stripe_event_id TEXT PRIMARY KEY NOT NULL,
  event_type TEXT NOT NULL,
  account_id TEXT REFERENCES hub_accounts(id),
  created_at INTEGER NOT NULL,
  received_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS hub_billing_webhook_received_idx ON hub_billing_webhook_events(received_at);
