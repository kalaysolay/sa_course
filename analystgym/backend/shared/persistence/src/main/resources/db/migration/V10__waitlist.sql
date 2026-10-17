-- Предзапись на Pro (замена paywall на этапе изучения спроса):
-- email + телефон с маской +7. Дубли по email не копим (unique по lower),
-- повторная заявка — 409 already_registered. Деньги сюда не пишем.
CREATE TABLE IF NOT EXISTS waitlist (
  id          UUID PRIMARY KEY,
  email       TEXT NOT NULL,
  phone       TEXT NOT NULL,
  source      TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_waitlist_email ON waitlist (lower(email));
CREATE INDEX IF NOT EXISTS ix_waitlist_created ON waitlist (created_at DESC);
