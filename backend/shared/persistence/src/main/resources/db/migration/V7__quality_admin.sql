-- Quality + admin backbone (Phase 3): complaints, task revisions, audit log.
-- Complaint statuses: new | review | resolved | rejected.

CREATE TABLE IF NOT EXISTS complaints (
  id             UUID PRIMARY KEY,
  user_id        UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  attempt_id     UUID NOT NULL REFERENCES attempts (id) ON DELETE CASCADE,
  task_id        TEXT NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
  score          INTEGER NOT NULL DEFAULT 0,
  reason         TEXT NOT NULL DEFAULT '',
  excerpt        TEXT NOT NULL DEFAULT '',
  prompt_version TEXT NOT NULL DEFAULT 'mock-agents/v1',
  status         TEXT NOT NULL DEFAULT 'new',
  resolution     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_complaints_status ON complaints (status, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_complaints_user ON complaints (user_id, created_at DESC);

-- Каждое сохранение задачи методистом — новая ревизия со снапшотом.
CREATE TABLE IF NOT EXISTS task_revisions (
  id         UUID PRIMARY KEY,
  task_id    TEXT NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
  rev        INTEGER NOT NULL,
  author_id  UUID REFERENCES users (id) ON DELETE SET NULL,
  snapshot   JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (task_id, rev)
);
CREATE INDEX IF NOT EXISTS ix_revisions_task ON task_revisions (task_id, rev DESC);

-- Журнал действий админки (кто, что, над чем).
CREATE TABLE IF NOT EXISTS audit_log (
  id         UUID PRIMARY KEY,
  user_id    UUID REFERENCES users (id) ON DELETE SET NULL,
  action     TEXT NOT NULL,
  target     TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_audit_created ON audit_log (created_at DESC);
