-- Снимок принятого запроса и общий журнал расходов переживают рестарт воркера.
ALTER TABLE attempts ADD COLUMN request_hash TEXT;
ALTER TABLE attempts ADD COLUMN task_snapshot JSONB;
ALTER TABLE attempts ADD COLUMN review_plan JSONB;
ALTER TABLE attempts ADD COLUMN charged_tokens INTEGER NOT NULL DEFAULT 0;
ALTER TABLE attempts ADD COLUMN call_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE review_jobs ADD COLUMN lease_token UUID;
ALTER TABLE review_jobs ADD COLUMN lease_until TIMESTAMPTZ;
ALTER TABLE review_jobs ADD COLUMN next_run_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE INDEX ix_review_jobs_due ON review_jobs (next_run_at, created_at) WHERE status = 'queued';

-- Для старой незавершённой работы точный контекст неизвестен: не подменяем его сегодняшним.
UPDATE attempts SET status = 'failed' WHERE status IN ('queued', 'in_review') AND review_plan IS NULL;
UPDATE review_jobs SET status = 'failed', stage = 'failed', progress = 100,
  error = 'legacy_review_requires_resubmit'
WHERE status NOT IN ('done', 'failed') AND attempt_id IN
  (SELECT id FROM attempts WHERE review_plan IS NULL);

CREATE TABLE review_calls (
  id UUID PRIMARY KEY,
  attempt_id UUID NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  lease_token UUID NOT NULL,
  agent_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  requested_model TEXT NOT NULL,
  actual_model TEXT,
  prompt_key TEXT NOT NULL,
  prompt_version INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('started','accepted','invalid','failed','unknown')),
  request JSONB NOT NULL,
  response TEXT,
  parsed_answer JSONB,
  reserved_tokens INTEGER NOT NULL CHECK (reserved_tokens > 0),
  charged_tokens INTEGER NOT NULL CHECK (charged_tokens >= 0),
  input_tokens INTEGER,
  output_tokens INTEGER,
  error TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);
CREATE INDEX ix_review_calls_attempt ON review_calls (attempt_id, started_at);
CREATE INDEX ix_attempts_quota ON attempts(user_id, task_id) WHERE status IN ('queued','in_review','reviewed');
