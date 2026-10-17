-- Начатое прохождение хранит собственный банк, не зависит от последующих правок вопросов.
CREATE TABLE assessment_runs (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  guest_hash TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  bank_version TEXT NOT NULL,
  questions JSONB NOT NULL,
  answers JSONB NOT NULL DEFAULT '{}',
  flags JSONB NOT NULL DEFAULT '{}',
  position INTEGER NOT NULL DEFAULT 0,
  version BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed')),
  result JSONB,
  submission_id UUID UNIQUE REFERENCES assessment_submissions(id),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  CHECK (user_id IS NOT NULL OR guest_hash IS NOT NULL)
);
CREATE INDEX ix_assessment_runs_user ON assessment_runs(user_id, started_at DESC);

-- Текущее ревью может исправляться, каждый предыдущий результат остаётся в истории.
ALTER TABLE reviews ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
CREATE TABLE review_revisions (
  attempt_id UUID NOT NULL REFERENCES attempts(id),
  revision INTEGER NOT NULL,
  result JSONB NOT NULL,
  metadata JSONB NOT NULL,
  actor_id UUID REFERENCES users(id),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (attempt_id, revision)
);
INSERT INTO review_revisions(attempt_id,revision,result,metadata)
SELECT attempt_id,1,result,jsonb_build_object('engine',engine,'provider',provider,'model',model,
  'promptVersions',prompt_versions,'inputTokens',input_tokens,'outputTokens',output_tokens) FROM reviews;
ALTER TABLE complaints ADD COLUMN review_revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE complaints ADD COLUMN review_snapshot JSONB;
ALTER TABLE complaints ADD COLUMN outcome TEXT;
ALTER TABLE complaints ADD COLUMN recheck_attempt_id UUID REFERENCES attempts(id);
UPDATE complaints c SET review_snapshot=r.result FROM reviews r WHERE r.attempt_id=c.attempt_id;
CREATE TABLE complaint_decisions (
  complaint_id UUID NOT NULL REFERENCES complaints(id), version BIGINT NOT NULL,
  action TEXT NOT NULL, actor_id UUID REFERENCES users(id), resolution TEXT,
  recheck_attempt_id UUID REFERENCES attempts(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(complaint_id,version)
);

-- Запись одновременно служит уведомлением в кабинете и долговечной очередью доставки письма.
CREATE TABLE user_notifications (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  email TEXT NOT NULL,
  dedupe_key TEXT NOT NULL UNIQUE,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  link TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','failed')),
  tries INTEGER NOT NULL DEFAULT 0,
  lease_token UUID,
  lease_until TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_notifications_user ON user_notifications(user_id, created_at DESC);
CREATE INDEX ix_notifications_due ON user_notifications(next_run_at) WHERE status IN ('pending','sending');
