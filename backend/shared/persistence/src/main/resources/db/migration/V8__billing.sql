-- Billing (Phase 4): orders, payments (idempotent webhooks), Pro
-- subscriptions, manual promo codes. Money and grades are append-only:
-- статусы двигаются только вперёд, возвраты — новыми строками.

CREATE TABLE IF NOT EXISTS orders (
  id          UUID PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  plan        TEXT NOT NULL,
  amount      INTEGER NOT NULL DEFAULT 0,
  currency    TEXT NOT NULL DEFAULT 'RUB',
  status      TEXT NOT NULL DEFAULT 'pending',
  payment_id  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_orders_user ON orders (user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_payment ON orders (payment_id) WHERE payment_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS payments (
  id                   UUID PRIMARY KEY,
  order_id             UUID NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  provider_payment_id  TEXT NOT NULL UNIQUE,
  status               TEXT NOT NULL DEFAULT 'pending',
  amount               INTEGER NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id          UUID PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  plan        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'active',
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at     TIMESTAMPTZ NOT NULL,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  source      TEXT NOT NULL DEFAULT 'order',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_subs_user ON subscriptions (user_id, ends_at DESC);

-- Ручные промокоды методиста/поддержки: код = N дней Pro.
CREATE TABLE IF NOT EXISTS promo_codes (
  code        TEXT PRIMARY KEY,
  pro_days    INTEGER NOT NULL DEFAULT 30,
  max_uses    INTEGER NOT NULL DEFAULT 1,
  used_count  INTEGER NOT NULL DEFAULT 0,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_by  UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
