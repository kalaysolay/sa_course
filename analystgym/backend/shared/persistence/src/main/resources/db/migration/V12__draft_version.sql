-- Защита черновика от тихой перезаписи из другой вкладки или устройства.
ALTER TABLE drafts ADD COLUMN version BIGINT NOT NULL DEFAULT 0;
