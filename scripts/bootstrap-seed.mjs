import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeText(file, content) {
  mkdirp(path.dirname(file));
  fs.writeFileSync(file, content, 'utf8');
}

function writeData(file, data) {
  writeText(file, JSON.stringify(data, null, 2) + '\n');
}

function topic(id, slug, title, order, courseOrder) {
  return { id, slug, title, order, course_order: courseOrder };
}

function section(id, slug, title, order, topics) {
  return { id, slug, title, order, topics };
}

function module(id, slug, title, order, sections, extra = {}) {
  return { id, slug, title, order, sections, ...extra };
}

const curriculum = {
  course_id: 'system-analysis',
  curriculum_status: 'draft',
  ownership: 'author',
  agents_can_modify: false,
  agents_can_report_gaps: true,
  notes: [
    'Seed curriculum from Course Publisher spec v0.3.',
    'Several compound early baseline titles are split only to preserve the MVP contract: REQ-STAKEHOLDERS has course_order 14.'
  ],
  modules: [
    module('M01', 'M01-profession', 'О профессии системного аналитика', 1, [
      section('M01-S01', 'S01-role', 'Роль аналитика', 1, [
        topic('PROF-ROLE', 'analyst-role', 'Роль системного аналитика и его типовые задачи', 1, 1),
        topic('PROF-LIFECYCLE', 'analyst-lifecycle', 'Жизненный цикл работы аналитика', 2, 2),
        topic('PROF-SKILLS', 'analyst-skills', 'Навыки и компетенции системного аналитика', 3, 3)
      ]),
      section('M01-S02', 'S02-ba-sa', 'БА и СА в одном проекте', 2, [
        topic('BASA-BOUNDARY', 'ba-sa-boundary', 'Где заканчивается бизнес-анализ и начинается системный анализ', 1, 4),
        topic('BASA-RESULTS', 'ba-sa-results', 'Какие результаты возникают по пути анализа', 2, 5),
        topic('BASA-ARTIFACTS', 'ba-sa-artifacts', 'Какие артефакты возникают по пути анализа', 3, 6)
      ])
    ]),
    module('M02', 'M02-process', 'Процесс разработки ПО', 2, [
      section('M02-S01', 'S01-team', 'Команда', 1, [
        topic('TEAM-ROLES', 'team-roles', 'Команда разработки и роли участников', 1, 7)
      ]),
      section('M02-S02', 'S02-development-management', 'Организация разработки', 2, [
        topic('DEV-MODELS', 'development-models', 'Модели управления разработкой ПО', 1, 8),
        topic('AGILE-METHODS', 'agile-methods', 'Гибкие методологии', 2, 9)
      ]),
      section('M02-S03', 'S03-sdlc', 'Жизненный цикл ПО', 3, [
        topic('SDLC-STAGES', 'sdlc-stages', 'Этапы разработки ПО', 1, 10),
        topic('SDLC-LIFECYCLE', 'sdlc-lifecycle', 'Жизненный цикл ПО', 2, 11)
      ])
    ]),
    module('M03', 'M03-requirements', 'Требования к ПО', 3, [
      section('M03-S01', 'S01-basics', 'Основы требований', 1, [
        topic('REQ-INTRO', 'requirements-intro', 'Что такое требования и какие они бывают', 1, 12),
        topic('REQ-FNFR', 'functional-nonfunctional-requirements', 'Функциональные и нефункциональные требования', 2, 13)
      ]),
      section('M03-S02', 'S02-elicitation', 'Заинтересованные лица и выявление требований', 2, [
        topic('REQ-STAKEHOLDERS', 'stakeholders', 'Заинтересованные лица', 1, 14),
        topic('REQ-ELICITATION', 'elicitation-methods', 'Способы выявления требований', 2, 15)
      ]),
      section('M03-S03', 'S03-formalization', 'Формализация', 3, [
        topic('REQ-MODELING', 'requirements-modeling', 'Моделирование и формализация требований', 1, 16)
      ]),
      section('M03-S04', 'S04-specification', 'Спецификация', 4, [
        topic('REQ-SPECIFICATION', 'requirements-specification', 'Спецификация и документирование требований', 1, 17)
      ]),
      section('M03-S05', 'S05-management', 'Управление', 5, [
        topic('REQ-MANAGEMENT', 'requirements-management', 'Управление требованиями', 1, 18)
      ])
    ]),
    module('M04', 'M04-modeling', 'Моделирование процессов и поведения', 4, [
      section('M04-S01', 'S01-use-cases', 'Сценарии использования', 1, [
        topic('UML-USE-CASE', 'uml-use-case', 'UML. Диаграмма сценариев использования', 1, 19)
      ]),
      section('M04-S02', 'S02-activities', 'Процессы', 2, [
        topic('UML-ACTIVITY', 'uml-activity', 'UML. Диаграмма активности', 1, 20)
      ]),
      section('M04-S03', 'S03-state', 'Жизненный цикл объекта', 3, [
        topic('UML-STATE', 'uml-state', 'UML. Диаграмма состояний', 1, 21)
      ]),
      section('M04-S04', 'S04-sequence', 'Взаимодействие компонентов', 4, [
        topic('UML-SEQUENCE', 'uml-sequence', 'UML. Диаграмма последовательностей', 1, 22)
      ])
    ]),
    module('M05', 'M05-architecture', 'Архитектура информационных систем', 5, [
      section('M05-S01', 'S01-information-systems', 'Что такое информационная система', 1, [
        topic('ARCH-IS-TYPES', 'is-types', 'Различные типы ИС: веб, десктоп, мобильные', 1, 23),
        topic('ARCH-BASIC-SCHEMA', 'basic-schema', 'Базовая схема client → frontend → backend → database', 2, 24)
      ]),
      section('M05-S02', 'S02-architectural-styles', 'Архитектурные стили', 2, [
        topic('ARCH-STYLES', 'architecture-styles', 'Виды архитектуры информационных систем', 1, 25),
        topic('ARCH-MONOLITH', 'monolith', 'Монолит', 2, 26),
        topic('ARCH-MICROSERVICES', 'microservices', 'Микросервисы', 3, 27)
      ]),
      section('M05-S03', 'S03-infrastructure', 'Основные инфраструктурные компоненты', 3, [
        topic('ARCH-REVERSE-PROXY', 'reverse-proxy', 'Reverse proxy и балансировка — обзор', 1, 28),
        topic('ARCH-API-GATEWAY', 'api-gateway', 'API Gateway — обзор', 2, 29),
        topic('ARCH-CACHE', 'cache', 'Кэш — обзор', 3, 30),
        topic('ARCH-STORAGE', 'storage', 'Файловое/объектное хранилище — обзор', 4, 31)
      ]),
      section('M05-S04', 'S04-interaction', 'Взаимодействие', 4, [
        topic('ARCH-SYNC', 'sync-interaction', 'Синхронное взаимодействие', 1, 32),
        topic('ARCH-ASYNC', 'async-interaction', 'Асинхронное взаимодействие', 2, 33)
      ]),
      section('M05-S05', 'S05-access-security', 'Безопасность доступа', 5, [
        topic('SEC-AUTHENTICATION', 'authentication', 'Аутентификация', 1, 34),
        topic('SEC-AUTHORIZATION', 'authorization', 'Авторизация', 2, 35)
      ])
    ]),
    module('M06', 'M06-integrations', 'Интеграции', 6, [
      section('M06-S01', 'S01-integration-basics', 'Основы интеграций', 1, [
        topic('INT-BASICS', 'integration-basics', 'Способы интеграции систем', 1, 36)
      ]),
      section('M06-S02', 'S02-sync-api', 'Синхронные API', 2, [
        topic('INT-REST', 'rest', 'REST', 1, 37),
        topic('INT-SOAP', 'soap', 'SOAP', 2, 38)
      ]),
      section('M06-S03', 'S03-async-messaging', 'Асинхронный обмен', 3, [
        topic('INT-MQ', 'message-queue', 'Очереди сообщений / Message Queue', 1, 39)
      ]),
      section('M06-S04', 'S04-other-integrations', 'Другие способы интеграции', 4, [
        topic('INT-FILES', 'file-integration', 'Интеграция через файлы', 1, 40),
        topic('INT-DATABASE', 'database-integration', 'Интеграция через базы данных', 2, 41)
      ]),
      section('M06-S05', 'S05-contract-design', 'Проектирование контрактов', 5, [
        topic('INT-API-DESIGN', 'api-design', 'Проектирование API и взаимодействия приложений', 1, 42)
      ])
    ]),
    module('M07', 'M07-databases-basic', 'Базы данных — базовый уровень', 7, [
      section('M07-S01', 'S01-basics', 'Основы', 1, [
        topic('DB-INTRO', 'db-intro', 'Введение', 1, 43),
        topic('DB-RELATIONAL', 'relational-db', 'Реляционные базы данных', 2, 44),
        topic('DB-STRUCTURE', 'db-structure', 'Структура баз данных', 3, 45),
        topic('DB-PSQL', 'psql', 'Подключение к PostgreSQL с помощью psql', 4, 46)
      ]),
      section('M07-S02', 'S02-tables-model', 'Таблицы и модель данных', 2, [
        topic('DB-TABLES', 'tables', 'Таблицы, строки и столбцы', 1, 47),
        topic('DB-DATA-TYPES', 'data-types', 'Основные типы данных', 2, 48),
        topic('DB-NULL', 'null-values', 'NULL и особые значения', 3, 49),
        topic('DB-PK', 'primary-key', 'Первичный ключ', 4, 50),
        topic('DB-FK', 'foreign-key', 'Внешний ключ', 5, 51),
        topic('DB-RELATIONSHIPS', 'relationships', 'Связи 1:1, 1:N, M:N', 6, 52)
      ]),
      section('M07-S03', 'S03-basic-sql', 'Базовый SQL', 3, [
        topic('SQL-LANGUAGE', 'sql-language', 'Язык SQL', 1, 53),
        topic('SQL-SELECT', 'select', 'SELECT', 2, 54),
        topic('SQL-WHERE', 'where', 'WHERE', 3, 55),
        topic('SQL-AND-OR', 'and-or', 'AND / OR', 4, 56),
        topic('SQL-IN', 'in', 'IN', 5, 57),
        topic('SQL-BETWEEN', 'between', 'BETWEEN', 6, 58),
        topic('SQL-LIKE', 'like', 'LIKE', 7, 59),
        topic('SQL-ORDER-BY', 'order-by', 'Сортировка данных', 8, 60),
        topic('SQL-LIMIT', 'limit', 'Ограничение выборки', 9, 61),
        topic('SQL-DISTINCT', 'distinct', 'Уникальные строки', 10, 62),
        topic('SQL-JOIN-BASIC', 'basic-join', 'Базовые JOIN', 11, 63)
      ])
    ]),
    module('M08', 'M08-databases-advanced', 'Базы данных — продвинутый уровень', 8, [
      section('M08-S01', 'S01-analytics', 'Аналитические запросы', 1, [
        topic('SQL-AGGREGATES', 'aggregates', 'Агрегатные функции', 1, 64),
        topic('SQL-GROUP-BY', 'group-by', 'GROUP BY', 2, 65),
        topic('SQL-HAVING', 'having', 'HAVING', 3, 66),
        topic('SQL-JOIN-ADVANCED', 'advanced-join', 'Более сложные JOIN', 4, 67),
        topic('SQL-CTE', 'cte', 'Подзапросы / CTE — на необходимом аналитику уровне', 5, 68)
      ]),
      section('M08-S02', 'S02-data-change', 'Изменение данных', 2, [
        topic('SQL-INSERT', 'insert', 'INSERT', 1, 69),
        topic('SQL-UPDATE', 'update', 'UPDATE', 2, 70),
        topic('SQL-DELETE', 'delete', 'DELETE', 3, 71)
      ]),
      section('M08-S03', 'S03-ddl', 'DDL и ограничения', 3, [
        topic('SQL-CREATE-TABLE', 'create-table', 'CREATE TABLE', 1, 72),
        topic('SQL-CONSTRAINTS', 'constraints', 'Основные ограничения полей', 2, 73),
        topic('SQL-ALTER-TABLE', 'alter-table', 'ALTER TABLE', 3, 74),
        topic('SQL-IDENTITY', 'identity-sequence', 'Identity / sequence / автоинкремент', 4, 75),
        topic('SQL-INDEXES', 'indexes', 'Индексы — концептуально', 5, 76)
      ]),
      section('M08-S04', 'S04-transactions', 'Транзакционность', 4, [
        topic('DB-TRANSACTION', 'transaction', 'Что такое транзакция', 1, 77),
        topic('DB-ACID', 'acid', 'ACID', 2, 78),
        topic('DB-COMMIT-ROLLBACK', 'commit-rollback', 'COMMIT / ROLLBACK', 3, 79),
        topic('DB-ISOLATION', 'isolation', 'Изоляция — базовая модель', 4, 80),
        topic('DB-LOCKS', 'locks', 'Блокировки — концептуально', 5, 81)
      ])
    ]),
    module('M09', 'M09-quality', 'Качество требований и спецификации', 9, [
      section('M09-S01', 'S01-quality-criteria', 'Критерии качества', 1, [
        topic('REQ-QUALITY-ATOMICITY', 'atomicity', 'Атомарность', 1, 82),
        topic('REQ-QUALITY-COMPLETENESS', 'completeness', 'Полнота', 2, 83),
        topic('REQ-QUALITY-AMBIGUITY', 'ambiguity', 'Однозначность', 3, 84),
        topic('REQ-QUALITY-CONSISTENCY', 'consistency', 'Консистентность', 4, 85),
        topic('REQ-QUALITY-VERIFIABILITY', 'verifiability', 'Проверяемость', 5, 86),
        topic('REQ-QUALITY-FEASIBILITY', 'feasibility', 'Выполнимость', 6, 87),
        topic('REQ-QUALITY-BREVITY', 'brevity', 'Краткость без потери смысла', 7, 88)
      ]),
      section('M09-S02', 'S02-review', 'Ревью требований', 2, [
        topic('REQ-REVIEW-HOWTO', 'review-howto', 'Как проводить ревью', 1, 89),
        topic('REQ-REVIEW-DEFECTS', 'review-defects', 'Типовые дефекты требований', 2, 90),
        topic('REQ-REVIEW-SEVERITY', 'review-severity', 'Critical / Major / Minor замечания', 3, 91)
      ]),
      section('M09-S03', 'S03-consistency', 'Согласованность спецификации', 3, [
        topic('REQ-TRACEABILITY', 'traceability', 'Traceability', 1, 92),
        topic('REQ-CROSS-CONSISTENCY', 'cross-consistency', 'Поиск противоречий между требованиями, моделями, API и данными', 2, 93)
      ])
    ]),
    module('M10', 'M10-ai', 'AI для аналитика', 10, [
      section('M10-S01', 'S01-placeholder', 'Содержание проектируется после основной части курса', 1, [
        { ...topic('AI-PLACEHOLDER', 'ai-placeholder', 'LLM, prompts, tools, skills, MCP, агенты, review', 1, 94), status: 'placeholder' }
      ])
    ], { status: 'PLACEHOLDER' }),
    module('M11', 'M11-final-project', 'Финальный проект: реализация системы coding agents', 11, [
      section('M11-S01', 'S01-spec-handoff', 'Передача спецификации в разработку', 1, [
        topic('FINAL-SPEC-PACKAGE', 'final-spec-package', 'Подготовка итогового пакета спецификации Compliance', 1, 95),
        topic('FINAL-CODING-AGENTS', 'coding-agents-handoff', 'Передача спецификации coding agents', 2, 96),
        topic('FINAL-IMPLEMENTATION-AMBIGUITIES', 'implementation-ambiguities', 'Разбор неоднозначностей и ошибок реализации', 3, 97),
        topic('FINAL-ACCEPTANCE', 'acceptance', 'Приёмка результата относительно требований', 4, 98)
      ])
    ])
  ]
};

function flatten(curr) {
  const rows = [];
  for (const mod of curr.modules) for (const sec of mod.sections) for (const top of sec.topics) rows.push({ module: mod, section: sec, topic: top });
  return rows.sort((a, b) => a.topic.course_order - b.topic.course_order);
}

const rows = flatten(curriculum);
for (const row of rows) row.topic.passport = `course/modules/${row.module.slug}/sections/${row.section.slug}/topics/${row.topic.slug}.yaml`;

function genericPassport(row) {
  const prev = rows.find(x => x.topic.course_order === row.topic.course_order - 1)?.topic.id ?? null;
  const next = rows.find(x => x.topic.course_order === row.topic.course_order + 1)?.topic.id ?? null;
  return {
    id: row.topic.id,
    title: row.topic.title,
    course_order: row.topic.course_order,
    purpose: `Задать базовое понимание темы «${row.topic.title}» в логике курса системного анализа.`,
    scope: { include: [row.topic.title], exclude: ['углубление за пределы базового уровня курса'] },
    prerequisites: { topics: prev ? [prev] : [] },
    previous_topics: prev ? [prev] : [],
    next_topics: next ? [next] : [],
    project: { stage: 'course_foundation', case: 'Связать тему со сквозным проектом Compliance, если это методически уместно.', expected_artifacts: [] },
    author_notes: ['Seed passport. Требует авторского уточнения перед production-quality выпуском.'],
    sources: { primary: [], secondary: ['SRC-AUTHOR-MATERIALS'], examples: [], allow_external_research: false }
  };
}

function stakeholderPassport() {
  return {
    id: 'REQ-STAKEHOLDERS',
    title: 'Заинтересованные лица',
    course_order: 14,
    purpose: 'Научить начинающего аналитика понимать, кто влияет на проект, кому важен его результат и от кого необходимо получать информацию и требования.',
    scope: {
      include: ['понятие stakeholder', 'способы выявления заинтересованных лиц', 'внутренние и внешние stakeholders', 'интерес и влияние', 'stakeholder register', 'выбор способа взаимодействия'],
      exclude: ['сложные enterprise governance frameworks', 'глубокое управление политическими конфликтами', 'RACI как самостоятельную большую тему']
    },
    prerequisites: { topics: ['REQ-FNFR'] },
    previous_topics: ['REQ-FNFR'],
    next_topics: ['REQ-ELICITATION'],
    project: {
      stage: 'business_analysis',
      case: 'Аналитик подключён к проекту автоматизации комплаенса и должен понять, с кем необходимо работать перед полноценным выявлением требований.',
      expected_artifacts: ['business-analysis/stakeholders.md']
    },
    author_notes: ['Не превращать тему в классификацию ради классификации.', 'Показать, почему пользователь системы и stakeholder — не одно и то же.', 'Разобрать заказчика, сотрудника, комплаенс-офицера и руководителя.'],
    sources: { primary: ['SRC-WIEGERS-REQUIREMENTS'], secondary: ['SRC-PUT-ANALYTIKA'], examples: ['REF-MY-STAKEHOLDER-DOC-01'], allow_external_research: true },
    source_policy: { on_missing_primary: 'continue_with_secondary_and_register_minor_gap' }
  };
}

const dirs = [
  'docs', 'course', 'project/compliance/business-analysis', 'project/compliance/system-analysis', 'project/compliance/diagrams',
  'project/compliance/database', 'project/compliance/api', 'project/compliance/integrations', 'project/compliance/architecture',
  'references/books/requirements', 'references/books/business-analysis', 'references/books/databases', 'references/books/architecture',
  'references/books/integrations', 'references/standards', 'references/official-docs', 'references/author-materials',
  'references/artifact-examples/requirements', 'references/artifact-examples/stakeholder-registers',
  'references/artifact-examples/use-cases', 'references/artifact-examples/api', 'references/artifact-examples/database',
  'references/artifact-examples/architecture', 'schemas', 'runs', 'output', 'agents', 'skills'
];
for (const d of dirs) mkdirp(path.join(root, d));

const spec = path.join(root, 'course-publisher-spec-v0.3.md');
const specCopy = path.join(root, 'docs', 'course-publisher-spec-v0.3.md');
if (fs.existsSync(spec) && !fs.existsSync(specCopy)) fs.copyFileSync(spec, specCopy);

writeData(path.join(root, 'publisher.yaml'), {
  publisher: { version: '0.3' },
  revisions: { lecture: 3, assessment: 2, project_artifacts: 3 },
  review: { block_on: ['critical', 'major'], max_minor_for_auto_approve: 5 },
  features: { visuals: false, google_drive_publish: false, whole_module_generation: false, experimental_project_artifacts: true, experimental_project_auto_merge: false },
  course_progress: { auto_update: true, maintain_human_readable_progress: true, block_on_major_gap: true, never_silently_skip_topic: true },
  curriculum: { author_controlled: true, require_topic_passport: true },
  sources: { registry_required: true },
  logging: { events_jsonl: true, keep_drafts: true, keep_reviews: true }
});

writeData(path.join(root, 'course/course.yaml'), {
  course: { id: 'system-analysis', title: 'Системный анализ на практике', language: 'ru', project: 'compliance' },
  audience: { level: 'beginner', assumed_it_background: 'none' },
  curriculum: { file: 'curriculum.yaml' },
  progress: { file: 'progress.yaml' },
  gaps: { file: 'gap-registry.yaml' },
  sources: { registry: '../references/source-registry.yaml' },
  principles: ['practice_first', 'explain_before_formalize', 'one_end_to_end_project', 'business_to_system_analysis', 'no_unexplained_terms', 'curriculum_is_author_controlled']
});

writeData(path.join(root, 'course/curriculum.yaml'), curriculum);
writeText(path.join(root, 'course/audience.md'), '# Аудитория\n\nКурс предназначен для начинающих системных аналитиков без уверенного IT-бэкграунда.\n');
writeText(path.join(root, 'course/course-style.md'), '# Стиль курса\n\nЛекции пишутся человеческим языком, как основа для видеоурока и самостоятельного чтения.\n');
writeData(path.join(root, 'course/glossary.yaml'), { terms: [] });
writeData(path.join(root, 'course/gap-registry.yaml'), { gaps: [] });

const progressTopics = {};
for (const row of rows) {
  const status = row.topic.course_order <= 13 ? 'completed' : 'planned';
  progressTopics[row.topic.id] = {
    course_order: row.topic.course_order,
    module_id: row.module.id,
    title: row.topic.title,
    status,
    output: status === 'completed' ? `output/${row.module.id}/${row.topic.id}/` : null
  };
}
writeData(path.join(root, 'course/progress.yaml'), {
  course_id: 'system-analysis',
  updated_at: '2026-08-09T00:00:00+05:00',
  summary: { total_topics: rows.length, completed: 13, in_progress: 0, blocked: 0, needs_revision: 0, planned: rows.length - 13 },
  last_completed: { topic_id: 'REQ-FNFR', course_order: 13, run_id: 'seed-completed-before-publisher' },
  next_candidate: { topic_id: 'REQ-STAKEHOLDERS', course_order: 14 },
  topics: progressTopics
});

for (const row of rows) {
  writeData(path.join(root, 'course/modules', row.module.slug, 'module.yaml'), { id: row.module.id, title: row.module.title, order: row.module.order, status: row.module.status || 'draft' });
  writeData(path.join(root, 'course/modules', row.module.slug, 'sections', row.section.slug, 'section.yaml'), { id: row.section.id, title: row.section.title, order: row.section.order, status: 'draft' });
  writeData(path.join(root, row.topic.passport), row.topic.id === 'REQ-STAKEHOLDERS' ? stakeholderPassport() : genericPassport(row));
}

writeData(path.join(root, 'references/source-registry.yaml'), {
  sources: [
    { id: 'SRC-WIEGERS-REQUIREMENTS', type: 'book', title: 'Software Requirements', authors: ['Karl Wiegers', 'Joy Beatty'], availability: 'missing', location: { type: 'local_file', path: 'references/books/requirements/software-requirements.pdf' } },
    { id: 'SRC-PUT-ANALYTIKA', type: 'book', title: 'Путь аналитика', availability: 'missing', location: { type: 'local_file', path: 'references/books/business-analysis/put-analitika.pdf' } },
    { id: 'SRC-AUTHOR-MATERIALS', type: 'author_material', title: 'Авторские материалы курса', availability: 'available', location: { type: 'directory', path: 'references/author-materials' } },
    { id: 'REF-MY-STAKEHOLDER-DOC-01', type: 'artifact_example', title: 'Пример реестра заинтересованных лиц', availability: 'missing', location: { type: 'local_file', path: 'references/artifact-examples/stakeholder-registers/stakeholders-example.md' } }
  ]
});
writeText(path.join(root, 'references/README.md'), '# References\n\nНаличие записи в registry не означает, что физический файл уже доступен.\n');

writeData(path.join(root, 'project/compliance/project.yaml'), { id: 'compliance', title: 'Автоматизация комплаенс', purpose: 'Сквозной учебный проект для курса системного анализа.', domain: 'internal_compliance' });
writeData(path.join(root, 'project/compliance/project-state.yaml'), { project_id: 'compliance', current_stage: 'business_analysis', completed_artifacts: [], planned_artifacts: ['business-analysis/stakeholders.md'] });
writeText(path.join(root, 'project/compliance/facts.md'), '# Compliance Project Facts\n\nСквозной учебный проект: автоматизация внутренних комплаенс-процессов организации.\n');
writeData(path.join(root, 'project/compliance/glossary.yaml'), { terms: [] });

const agents = ['methodologist', 'researcher', 'lesson-writer', 'subject-reviewer', 'methodology-reviewer', 'editorial-reviewer', 'content-critic', 'assessment-author', 'assessment-reviewer', 'project-artifact-author', 'project-artifact-reviewer'];
for (const agent of agents) writeText(path.join(root, 'agents', agent, 'AGENT.md'), `# Agent: ${agent}\n\nStructured Course Publisher v0.3 role. Output contracts are defined in docs/course-publisher-spec-v0.3.md.\n`);
const skills = ['resolve-next-topic', 'update-course-progress', 'register-gap', 'design-lesson', 'resolve-sources', 'research-topic', 'write-lesson', 'revise-lesson', 'review-subject', 'review-methodology', 'review-editorial', 'review-lesson-scope', 'review-lesson-coverage', 'create-assessment', 'review-assessment', 'update-project-artifact', 'review-project-artifact', 'assemble-lesson-package'];
for (const skill of skills) writeText(path.join(root, 'skills', skill, 'SKILL.md'), `# Skill: ${skill}\n\nPlaceholder skill contract for the v0.3 skeleton.\n`);

const schema = required => ({ type: 'object', required, additionalProperties: true });
const schemas = {
  'curriculum.schema.json': ['course_id', 'modules'],
  'topic-passport.schema.json': ['id', 'title', 'course_order', 'purpose', 'scope', 'prerequisites', 'project', 'sources'],
  'progress.schema.json': ['course_id', 'summary', 'last_completed', 'next_candidate', 'topics'],
  'gap-registry.schema.json': ['gaps'],
  'source-registry.schema.json': ['sources'],
  'lesson-brief.schema.json': ['topicId', 'title', 'moduleId', 'sectionId', 'audienceLevel', 'learningOutcomes', 'mustCover', 'doNotCover', 'projectUsage', 'assessmentRequirements'],
  'review.schema.json': ['reviewer', 'artifact', 'verdict', 'summary', 'issues'],
  'assessment.schema.json': ['topicId', 'items'],
  'project-change.schema.json': ['topicId', 'changes'],
  'lesson-manifest.schema.json': ['topicId', 'runId', 'status', 'learningOutcomes', 'files', 'reviews']
};
for (const [file, required] of Object.entries(schemas)) writeData(path.join(root, 'schemas', file), schema(required));

console.log(`Bootstrapped ${rows.length} curriculum topics in ${root}`);
