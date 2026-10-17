-- Старые JWT не имеют назначения и связи с сессией: после обновления нужен новый вход.
ALTER TABLE refresh_tokens ADD COLUMN session_id UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE refresh_tokens ADD COLUMN family_id UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE refresh_tokens ALTER COLUMN session_id DROP DEFAULT;
ALTER TABLE refresh_tokens ALTER COLUMN family_id DROP DEFAULT;
CREATE UNIQUE INDEX uq_refresh_session ON refresh_tokens (session_id);
CREATE INDEX ix_refresh_family ON refresh_tokens (family_id);
UPDATE refresh_tokens SET revoked = TRUE WHERE revoked = FALSE;
