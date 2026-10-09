/* ============================================================
   data-core.js — справочники: уровни, теги, подборки (домены)
   В проде это таблицы в админке; здесь — редактируемый JSON,
   изменения админки живут в localStorage и подхватываются каталогом.
   ============================================================ */

window.SA_DATA = window.SA_DATA || {};

/* ---------- Уровни сложности ---------- */
SA_DATA.levels = [
  {
    id: 'easy',
    name: 'Лёгкий',
    cssClass: 'level-easy',
    order: 1,
    active: true,
    description: 'Базовая задача на 15–25 минут. Проверяет, что кандидат владеет терминологией и умеет оформить простую вещь без подсказок.',
    profile: 'Junior / Junior+',
    timeHint: '15–25 мин'
  },
  {
    id: 'medium',
    name: 'Средний',
    cssClass: 'level-medium',
    order: 2,
    active: true,
    description: 'Задача с неоднозначностью: данных не хватает, есть конфликт ограничений. Проверяет самостоятельность и полноту проработки.',
    profile: 'Middle',
    timeHint: '30–45 мин'
  },
  {
    id: 'hard',
    name: 'Сложный',
    cssClass: 'level-hard',
    order: 3,
    active: true,
    description: 'Проектная задача на 45–90 минут: распределённые системы, компромиссы, эксплуатация. Проверяет системное мышление и опыт.',
    profile: 'Senior / Lead',
    timeHint: '45–90 мин'
  }
];

/* ---------- Справочник тегов (меток) ---------- */
/* category — группа для админки; количество задач считается динамически */
SA_DATA.tagCategories = [
  { id: 'api', name: 'API и контракты' },
  { id: 'integration', name: 'Интеграции' },
  { id: 'architecture', name: 'Архитектура' },
  { id: 'data', name: 'Данные и SQL' },
  { id: 'requirements', name: 'Требования' },
  { id: 'modeling', name: 'Моделирование и диаграммы' },
  { id: 'reliability', name: 'Надёжность и эксплуатация' },
  { id: 'security', name: 'Безопасность' },
  { id: 'process', name: 'Процессы и коммуникации' },
  { id: 'analytics', name: 'Аналитика и метрики' },
  { id: 'quality', name: 'Качество и приёмка' }
];

SA_DATA.tags = [
  { id: 'rest-api', name: 'REST API', category: 'api', active: true, synonyms: ['rest', 'http api'] },
  { id: 'soap', name: 'SOAP', category: 'api', active: true, synonyms: ['wsdl', 'xml'] },
  { id: 'graphql', name: 'GraphQL', category: 'api', active: true, synonyms: [] },
  { id: 'api-design', name: 'Проектирование API', category: 'api', active: true, synonyms: ['openapi', 'swagger', 'контракт'] },
  { id: 'versioning', name: 'Версионирование', category: 'api', active: true, synonyms: ['versioning'] },
  { id: 'idempotency', name: 'Идемпотентность', category: 'api', active: true, synonyms: ['idempotency'] },

  { id: 'integrations', name: 'Интеграции', category: 'integration', active: true, synonyms: ['integration'] },
  { id: 'kafka', name: 'Kafka', category: 'integration', active: true, synonyms: ['брокер', 'очередь', 'topic'] },
  { id: 'rabbitmq', name: 'RabbitMQ', category: 'integration', active: false, synonyms: ['amqp'] },
  { id: 'async', name: 'Асинхронное взаимодействие', category: 'integration', active: true, synonyms: ['event-driven', 'событий'] },
  { id: 'webhook', name: 'Webhook', category: 'integration', active: true, synonyms: ['callback'] },
  { id: 'files', name: 'Файловый обмен', category: 'integration', active: true, synonyms: ['sftp', 'csv', 'xml-файл'] },

  { id: 'architecture', name: 'Архитектура', category: 'architecture', active: true, synonyms: ['arch'] },
  { id: 'system-design', name: 'Системный дизайн', category: 'architecture', active: true, synonyms: [] },
  { id: 'microservices', name: 'Микросервисы', category: 'architecture', active: true, synonyms: [] },
  { id: 'saga', name: 'Сага / распределённые транзакции', category: 'architecture', active: true, synonyms: ['2pc', 'компенсаци'] },
  { id: 'cqrs', name: 'CQRS / событийная модель', category: 'architecture', active: false, synonyms: ['event sourcing'] },
  { id: 'ddd', name: 'DDD и границы контекстов', category: 'architecture', active: true, synonyms: ['bounded context'] },
  { id: 'cache', name: 'Кэширование', category: 'architecture', active: true, synonyms: ['redis', 'cache'] },

  { id: 'sql', name: 'SQL', category: 'data', active: true, synonyms: ['select', 'join'] },
  { id: 'db-design', name: 'Проектирование БД', category: 'data', active: true, synonyms: ['схема бд'] },
  { id: 'normalization', name: 'Нормализация', category: 'data', active: true, synonyms: ['нф', '3нф'] },
  { id: 'indexes', name: 'Индексы и производительность', category: 'data', active: true, synonyms: ['индекс', 'explain'] },
  { id: 'transactions', name: 'Транзакции и блокировки', category: 'data', active: true, synonyms: ['isolation', 'mvcc'] },
  { id: 'migration', name: 'Миграции данных', category: 'data', active: true, synonyms: ['migration'] },
  { id: 'dwh', name: 'DWH / витрины', category: 'data', active: true, synonyms: ['хранилище', 'etl', 'витрина'] },
  { id: 'nosql', name: 'NoSQL', category: 'data', active: true, synonyms: ['mongo', 'document store'] },

  { id: 'requirements', name: 'Требования', category: 'requirements', active: true, synonyms: ['тз', 'srs'] },
  { id: 'user-story', name: 'User Story', category: 'requirements', active: true, synonyms: ['пользовательская история'] },
  { id: 'acceptance', name: 'Критерии приёмки', category: 'requirements', active: true, synonyms: ['acceptance criteria', 'bdd'] },
  { id: 'use-case', name: 'Use Case / сценарии', category: 'requirements', active: true, synonyms: ['сценарий использования'] },
  { id: 'edge-cases', name: 'Граничные случаи и ошибки', category: 'requirements', active: true, synonyms: ['альтернативные сценарии', 'edge case'] },
  { id: 'nfr', name: 'Нефункциональные требования', category: 'requirements', active: true, synonyms: ['нфт', 'sla', 'нагрузка'] },

  { id: 'uml', name: 'UML', category: 'modeling', active: true, synonyms: [] },
  { id: 'sequence', name: 'Sequence-диаграмма', category: 'modeling', active: true, synonyms: ['диаграмма последовательности'] },
  { id: 'bpmn', name: 'BPMN', category: 'modeling', active: true, synonyms: ['бизнес-процесс'] },
  { id: 'er', name: 'ER-диаграмма', category: 'modeling', active: true, synonyms: ['сущность-связь'] },
  { id: 'state', name: 'Диаграмма состояний', category: 'modeling', active: true, synonyms: ['state machine'] },
  { id: 'component', name: 'Компонентная схема', category: 'modeling', active: true, synonyms: ['c4', 'deployment'] },

  { id: 'reliability', name: 'Надёжность', category: 'reliability', active: true, synonyms: ['отказоустойчивость'] },
  { id: 'retry', name: 'Таймауты и ретраи', category: 'reliability', active: true, synonyms: ['retry', 'timeout', 'circuit breaker'] },
  { id: 'observability', name: 'Логирование и мониторинг', category: 'reliability', active: true, synonyms: ['метрики системы', 'tracing', 'alert'] },
  { id: 'degradation', name: 'Деградация и план Б', category: 'reliability', active: true, synonyms: ['fallback', 'graceful'] },

  { id: 'security', name: 'Безопасность', category: 'security', active: true, synonyms: [] },
  { id: 'oauth', name: 'Аутентификация / OAuth 2.0', category: 'security', active: true, synonyms: ['jwt', 'токен', 'auth'] },
  { id: 'pd', name: 'Персональные данные (152-ФЗ)', category: 'security', active: true, synonyms: ['pii', 'gdpr'] },
  { id: 'roles', name: 'Роли и права доступа', category: 'security', active: true, synonyms: ['rbac', 'доступ'] },

  { id: 'stakeholders', name: 'Стейкхолдеры', category: 'process', active: true, synonyms: ['заказчик'] },
  { id: 'conflict', name: 'Конфликты требований', category: 'process', active: true, synonyms: ['переговоры', 'согласование позиций', 'эскалация'] },
  { id: 'agile', name: 'Agile / Scrum', category: 'process', active: true, synonyms: ['спринт'] },
  { id: 'estimation', name: 'Оценка и декомпозиция', category: 'process', active: true, synonyms: ['декомпозиция', 'оценка'] },
  { id: 'discovery', name: 'Discovery и интервью', category: 'process', active: true, synonyms: ['custdev', 'исследование'] },

  { id: 'metrics', name: 'Продуктовые метрики', category: 'analytics', active: true, synonyms: ['kpi'] },
  { id: 'ab', name: 'A/B-эксперименты', category: 'analytics', active: true, synonyms: ['ab test'] },
  { id: 'reports', name: 'Отчётность', category: 'analytics', active: true, synonyms: ['дашборд', 'bi'] },
  { id: 'unit-economics', name: 'Юнит-экономика', category: 'analytics', active: false, synonyms: [] },

  { id: 'testing', name: 'Тестирование и QA', category: 'quality', active: true, synonyms: ['qa'] },
  { id: 'data-quality', name: 'Качество данных', category: 'quality', active: true, synonyms: ['dq', 'валидация данных', 'чистота данных'] },
  { id: 'docs', name: 'Документация', category: 'quality', active: true, synonyms: ['confluence', 'wiki'] },
  { id: 'release', name: 'Выкатка и feature flags', category: 'quality', active: true, synonyms: ['feature toggle', 'релиз'] }
];

/* ---------- Подборки (домены) ---------- */
SA_DATA.collections = [
  {
    id: 'integrations',
    name: 'Интеграции',
    icon: '⇄',
    tagline: 'REST, SOAP, брокеры, файловый обмен',
    description: 'Задачи про то, как системы разговаривают друг с другом: контракты, идемпотентность, таймауты и ретраи, гарантии доставки, разбор ошибок. Самый частый блок на собеседованиях системного аналитика.',
    audience: 'SA / BA, Middle и выше',
    taskIds: ['int-timeouts', 'int-idempotency', 'int-soap-migration', 'int-kafka-events', 'int-oauth-partner'],
    active: true
  },
  {
    id: 'system-design',
    name: 'Проектирование и системный дизайн',
    icon: '◧',
    tagline: 'Архитектура, границы сервисов, состояния',
    description: 'Проектирование системы с нуля: границы сервисов, модель данных, состояния сущностей, синхронные и асинхронные потоки. Проверяем, умеете ли вы принимать решения и обосновывать компромиссы.',
    audience: 'SA, Middle / Senior',
    taskIds: ['des-er-catalog', 'des-order-state', 'des-notifications', 'des-loyalty'],
    active: true
  },
  {
    id: 'databases',
    name: 'Базы данных и SQL',
    icon: '⛁',
    tagline: 'Схемы, запросы, производительность, миграции',
    description: 'От простого SELECT до плана миграции на сотни миллионов строк: нормализация, индексы, транзакции, витрины и качество данных. Практика, которую реально дают на технических экранах.',
    audience: 'SA / BA / Data-ориентированные роли',
    taskIds: ['db-slow-report', 'db-normalization', 'db-dwh-metrics', 'db-migration'],
    active: true
  },
  {
    id: 'requirements',
    name: 'Требования и коммуникации',
    icon: '✎',
    tagline: 'Сбор, формализация, конфликты стейкхолдеров',
    description: 'Превращение «хотим как у конкурентов» в требования, по которым можно разрабатывать: user stories, критерии приёмки, альтернативные сценарии, работа с конфликтом заказчика и рисков.',
    audience: 'BA / SA, Junior и выше',
    taskIds: ['req-vague-feature', 'req-api-contract', 'req-stakeholder-conflict'],
    active: true
  },
  {
    id: 'interview-warmup',
    name: 'Разминка перед собеседованием',
    icon: '⚡',
    tagline: '6 задач на 2–3 вечера',
    description: 'Короткий набор, который покрывает типовые вопросы технического экрана: контракт API, идемпотентность, медленный запрос, модель состояний, бизнес-процесс и нефункциональные требования.',
    audience: 'Все уровни',
    taskIds: ['req-vague-feature', 'int-timeouts', 'db-slow-report', 'des-order-state', 'int-idempotency', 'req-api-contract'],
    active: true
  },
  {
    id: 'fintech',
    name: 'Финтех и платежи',
    icon: '₽',
    tagline: 'Деньги, согласованность, аудит',
    description: 'Доменная подборка: платёжные потоки, согласованность данных, идемпотентность списаний, безопасность и требования регуляторов. Подходит, если собес в банк или платёжный сервис.',
    audience: 'SA / BA, Middle+',
    taskIds: ['int-idempotency', 'int-kafka-events', 'int-oauth-partner', 'db-migration', 'des-loyalty'],
    active: true
  }
];

/* ---------- Компетенции для диагностики уровня ---------- */
SA_DATA.competencies = [
  { id: 'requirements', name: 'Требования и формализация', icon: '✎', short: 'Сбор, user stories, критерии приёмки, полнота' },
  { id: 'integrations', name: 'Интеграции и API', icon: '⇄', short: 'REST/SOAP, контракты, идемпотентность, ошибки' },
  { id: 'data', name: 'Данные и SQL', icon: '⛁', short: 'Схемы, запросы, индексы, качество данных' },
  { id: 'architecture', name: 'Архитектура и системный дизайн', icon: '◧', short: 'Границы сервисов, надёжность, компромиссы' },
  { id: 'modeling', name: 'Моделирование и нотации', icon: '⬡', short: 'UML, BPMN, sequence, ER, состояния' },
  { id: 'process', name: 'Процессы и коммуникации', icon: '◎', short: 'Стейкхолдеры, оценка, декомпозиция, приёмка' },
  { id: 'quality', name: 'Качество, НФТ и эксплуатация', icon: '⚑', short: 'НФТ, тестирование, логирование, выкатка' }
];

/* ---------- Грейды по итогам диагностики ---------- */
SA_DATA.grades = [
  { id: 'intern', min: 0, max: 34, name: 'Старт', title: 'Порог входа', note: 'Базовые понятия знакомы, но системной практики пока мало.' },
  { id: 'junior', min: 35, max: 54, name: 'Junior', title: 'Junior-аналитик', note: 'Решаете типовые задачи под присмотром наставника.' },
  { id: 'middle', min: 55, max: 74, name: 'Middle', title: 'Middle-аналитик', note: 'Самостоятельно ведёте фичу от discovery до приёмки.' },
  { id: 'senior', min: 75, max: 89, name: 'Senior', title: 'Senior-аналитик', note: 'Проектируете решения и держите качество на уровне системы.' },
  { id: 'lead', min: 90, max: 100, name: 'Lead', title: 'Lead / Principal', note: 'Формируете подход, обучаете других, отвечаете за домен.' }
];

/* ---------- Демо-пользователи (витрина админки; в продукте — из БД) ---------- */
SA_DATA.users = [
  { id: 'u-marat', name: 'Марат Г.', role: 'SA', level: 'Middle', attempts: 14, avg: 58, lastActive: '2026-10-07T19:42:00', recent: [{ taskId: 'int-idempotency', score: 41 }, { taskId: 'int-kafka-events', score: 63 }] },
  { id: 'u-anna', name: 'Анна К.', role: 'BA', level: 'Senior', attempts: 22, avg: 74, lastActive: '2026-10-07T21:05:00', recent: [{ taskId: 'db-slow-report', score: 78 }, { taskId: 'req-vague-feature', score: 81 }] },
  { id: 'u-igor', name: 'Игорь С.', role: 'SA', level: 'Junior', attempts: 6, avg: 33, lastActive: '2026-10-06T12:20:00', recent: [{ taskId: 'req-vague-feature', score: 22 }] },
  { id: 'u-elena', name: 'Елена В.', role: 'BA', level: 'Middle', attempts: 11, avg: 61, lastActive: '2026-10-05T18:11:00', recent: [{ taskId: 'des-order-state', score: 66 }] },
  { id: 'u-timur', name: 'Тимур Д.', role: 'SA', level: 'Junior', attempts: 3, avg: 28, lastActive: '2026-10-04T09:44:00', recent: [{ taskId: 'db-slow-report', score: 31 }] },
  { id: 'u-olga', name: 'Ольга М.', role: 'SA', level: 'Senior', attempts: 19, avg: 82, lastActive: '2026-10-07T22:15:00', recent: [{ taskId: 'int-kafka-events', score: 88 }] }
];

/* ---------- Промпты агентов (редакции; в продукте — версионированная таблица) ---------- */
SA_DATA.prompts = [
  { key: 'sa-reviewer', name: 'Ревью системного аналитика', agent: 'Анна Ковалёва · SA', versions: [
    { v: 2, status: 'archived', traffic: 0, updatedAt: '2026-09-12', model: 'mock-agents/v1', changelog: 'Первая стабильная редакция: полнота, сценарии, измеримость.' },
    { v: 3, status: 'active', traffic: 80, updatedAt: '2026-09-28', model: 'mock-agents/v1', changelog: 'Ужесточили проверку альтернативных сценариев, добавили цитаты-подтверждения.' },
    { v: 4, status: 'canary', traffic: 20, updatedAt: '2026-10-05', model: 'mock-agents/v1', changelog: 'Эксперимент: отдельный разбор UX-состояний (pending/unknown). Смотрим жалобы.' }
  ]},
  { key: 'arch-reviewer', name: 'Ревью архитектора', agent: 'Дмитрий Лазарев · Arch', versions: [
    { v: 1, status: 'archived', traffic: 0, updatedAt: '2026-09-10', model: 'mock-agents/v1', changelog: 'Стартовая редакция.' },
    { v: 2, status: 'active', traffic: 100, updatedAt: '2026-09-25', model: 'mock-agents/v1', changelog: 'Добавили проверку гонок и outbox; снизили терпимость к «быстро/надёжно» без цифр.' }
  ]},
  { key: 'grade-policy', name: 'Политика оценок', agent: 'оба агента', versions: [
    { v: 1, status: 'active', traffic: 100, updatedAt: '2026-09-20', model: 'mock-agents/v1', changelog: 'Пороги 26/46/66/85, веса high=3/mid=2/low=1, structural-бонус до 18%.' }
  ]},
  { key: 'planner', name: 'План прокачки', agent: 'система', versions: [
    { v: 1, status: 'active', traffic: 100, updatedAt: '2026-09-18', model: 'mock-agents/v1', changelog: 'Подбор задач по слабым компетенциям и уровню.' }
  ]}
];
