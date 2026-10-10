-- LLM review infra (Phase 4): providers, agents, prompts + versions,
-- учёт токенов и версий в ревью (иначе тюнинг вслепую, см. admin-guide).

CREATE TABLE IF NOT EXISTS providers (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  base_url       TEXT NOT NULL,
  model          TEXT NOT NULL,
  key_env        TEXT NOT NULL DEFAULT '',
  timeout_sec    INTEGER NOT NULL DEFAULT 120,
  enabled        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agents (
  id        TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  role      TEXT NOT NULL DEFAULT '',
  initials  TEXT NOT NULL DEFAULT '',
  checks    JSONB NOT NULL DEFAULT '[]',
  model     TEXT NOT NULL DEFAULT '',
  prompt_key TEXT NOT NULL DEFAULT '',
  enabled   BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS prompts (
  key   TEXT PRIMARY KEY,
  name  TEXT NOT NULL,
  agent TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS prompt_versions (
  id          UUID PRIMARY KEY,
  prompt_key  TEXT NOT NULL REFERENCES prompts (key) ON DELETE CASCADE,
  v           INTEGER NOT NULL,
  status      TEXT NOT NULL DEFAULT 'archived',
  traffic     INTEGER NOT NULL DEFAULT 0,
  model       TEXT NOT NULL DEFAULT '',
  changelog   TEXT NOT NULL DEFAULT '',
  text        TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (prompt_key, v)
);

ALTER TABLE reviews ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT '';
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS model TEXT NOT NULL DEFAULT '';
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS prompt_versions JSONB NOT NULL DEFAULT '{}';
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS input_tokens INTEGER NOT NULL DEFAULT 0;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS output_tokens INTEGER NOT NULL DEFAULT 0;

-- Провайдеры: DeepSeek рабочий, GLM/Qwen запасные (ключи — только из env).
INSERT INTO providers (id, name, base_url, model, key_env, timeout_sec, enabled) VALUES
  ('deepseek', 'DeepSeek', 'https://api.deepseek.com/v1', 'deepseek-chat', 'DEEPSEEK_API_KEY', 120, TRUE),
  ('glm', 'GLM (Zhipu)', 'https://open.bigmodel.cn/api/paas/v4', 'glm-4', 'GLM_API_KEY', 120, FALSE),
  ('qwen', 'Qwen (Alibaba)', 'https://dashscope.aliyuncs.com/compatible-mode/v1', 'qwen-max', 'QWEN_API_KEY', 120, FALSE),
  ('mock-llm', 'Псевдо-LLM (dev/E2E)', 'mock://local', 'mock-llm', '', 5, FALSE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, base_url = EXCLUDED.base_url,
  model = EXCLUDED.model, key_env = EXCLUDED.key_env, updated_at = now();

-- Агенты как в макете (фокус и checks видит студент).
INSERT INTO agents (id, name, role, initials, checks, model, prompt_key, enabled) VALUES
  ('sa', 'Анна Ковалёва', 'Системный аналитик · 11 лет в финтехе и e-commerce', 'АК',
   '["Полнота: сценарии, роли, данные, ограничения", "Альтернативные и граничные случаи", "Измеримость: метрики и критерии приёмки", "Понятно ли это заказчику и разработке", "Стейкхолдеры, согласования, процесс"]'::jsonb,
   '', 'sa-reviewer', TRUE),
  ('arch', 'Дмитрий Лазарев', 'Архитектор интеграционных решений · 14 лет в высоконагруженных системах', 'ДЛ',
   '["Реализуемость и стоимость предложенного", "Модель данных и согласованность", "Надёжность: таймауты, ретраи, отказы", "Производительность под заявленную нагрузку", "Эксплуатация: логи, метрики, откат"]'::jsonb,
   '', 'arch-reviewer', TRUE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role,
  initials = EXCLUDED.initials, checks = EXCLUDED.checks, prompt_key = EXCLUDED.prompt_key;

-- Промпты: плейсхолдеры solution/rubric/task_title/criteria (см. admin-guide §9).
INSERT INTO prompts (key, name, agent) VALUES
  ('sa-reviewer', 'Ревью системного аналитика', 'sa'),
  ('arch-reviewer', 'Ревью архитектора', 'arch'),
  ('grade-policy', 'Шкала грейдов (справочно для модели)', '')
ON CONFLICT (key) DO NOTHING;

INSERT INTO prompt_versions (id, prompt_key, v, status, traffic, model, changelog, text) VALUES
  (gen_random_uuid(), 'sa-reviewer', 1, 'active', 100, '', 'Стартовый промпт mock-эпохи',
   'Ты — системный аналитик с 11 годами опыта. Разбери решение студента по задаче строго по рубрике. Отвечай ТОЛЬКО валидным JSON без пояснений вне него. Плейсхолдеры подставляет сервер. Задача: {{task_title}}. Рубрика (id и маркеры): {{rubric}}. Решение студента: {{solution}}. Формат ответа: {"criteria": [{"id": "<id из рубрики>", "state": "hit|partial|miss", "evidence": "<цитата-подтверждение до 200 символов или пусто>"}], "narrative": "<почему решение работает или нет, 3-6 предложений>", "covered": [{"title": "<что учтено>", "detail": "<подробно>"}], "missed": [{"title": "<что не учтено>", "state": "hit|partial|miss", "critical": true|false, "why": "<почему важно>"}], "improve": [{"title": "<как усилить>", "detail": "<подробно>"}], "questions": ["<вопрос интервьюера>", "...до 4 штук"]}. Правила: hit — тема раскрыта, partial — упомянута без проработки, miss — отсутствует. Оцени ВСЕ критерии из рубрики, ни одного не пропускай.'),
  (gen_random_uuid(), 'arch-reviewer', 1, 'active', 100, '', 'Стартовый промпт mock-эпохи',
   'Ты — архитектор интеграционных решений с 14 годами опыта. Разбери техническую часть решения строго по рубрике. Отвечай ТОЛЬКО валидным JSON без пояснений вне него. Задача: {{task_title}}. Рубрика (id и маркеры): {{rubric}}. Решение студента: {{solution}}. Формат ответа: {"criteria": [{"id": "<id из рубрики>", "state": "hit|partial|miss", "evidence": "<цитата-подтверждение до 200 символов или пусто>"}], "narrative": "<почему реализуемо или нет, 3-6 предложений>", "covered": [{"title": "<что учтено>", "detail": "<подробно>"}], "missed": [{"title": "<что не учтено>", "state": "hit|partial|miss", "critical": true|false, "why": "<почему важно>"}], "improve": [{"title": "<как усилить>", "detail": "<подробно>"}], "questions": ["<вопрос интервьюера>", "...до 4 штук"]}. Правила: hit — тема раскрыта, partial — упомянута без проработки, miss — отсутствует. Отдельно проверь: числа (таймауты, нагрузки), отказ и откат, схему, корректность данных. Оцени ВСЕ критерии из рубрики.')
ON CONFLICT (prompt_key, v) DO NOTHING;
