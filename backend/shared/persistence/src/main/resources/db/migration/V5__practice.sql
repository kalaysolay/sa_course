-- Practice loop (Phase 2): drafts, attempts, reviews, review jobs.
-- Attempt statuses: queued | in_review | reviewed | failed.
-- Job statuses: queued | sa_running | arch_running | grading | done | failed.

CREATE TABLE IF NOT EXISTS drafts (
  user_id    UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  task_id    TEXT NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
  tabs       JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, task_id)
);

CREATE TABLE IF NOT EXISTS attempts (
  id               UUID PRIMARY KEY,
  user_id          UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  task_id          TEXT NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
  tabs             JSONB NOT NULL DEFAULT '[]',
  rubric_snapshot  JSONB NOT NULL DEFAULT '[]',
  idempotency_key  TEXT,
  status           TEXT NOT NULL DEFAULT 'queued',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Идемпотентный submit: один ключ — одна попытка пользователя.
CREATE UNIQUE INDEX IF NOT EXISTS uq_attempts_user_idem
  ON attempts (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_attempts_user_task
  ON attempts (user_id, task_id, created_at DESC);

CREATE TABLE IF NOT EXISTS reviews (
  attempt_id UUID PRIMARY KEY REFERENCES attempts (id) ON DELETE CASCADE,
  engine     TEXT NOT NULL DEFAULT 'mock-agents/v1',
  grade_code INTEGER NOT NULL,
  score      INTEGER NOT NULL,
  result     JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS review_jobs (
  id         UUID PRIMARY KEY,
  attempt_id UUID NOT NULL UNIQUE REFERENCES attempts (id) ON DELETE CASCADE,
  status     TEXT NOT NULL DEFAULT 'queued',
  progress   INTEGER NOT NULL DEFAULT 0,
  stage      TEXT,
  tries      INTEGER NOT NULL DEFAULT 0,
  error      TEXT,
  locked_at  TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_jobs_status ON review_jobs (status, created_at);
