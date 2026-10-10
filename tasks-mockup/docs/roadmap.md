# AnalystGym — поэтапный план разработки (v0.1)

Принцип: вертикальные срезы, каждая фаза заканчивается рабочей демкой.
**MVP = тренажёр целиком.** Курсы — отдельным этапом после MVP
(видео не записано, спешки нет).

## MVP: Тренажёр

### Фаза 0 — Фундамент (~1 неделя) — ✅ ГОТОВА (2026-10-09)

Цель: репозиторий собирается, поднимается и раздаёт макет; CI зелёный.
Никакой бизнес-логики — только скелет, инфра и проверки.

**0.1. Каркас Gradle.** `backend/settings.gradle` (include всех модулей),
корневой `build.gradle` + `gradle/libs.versions.toml` (Boot 3.4.x, Java 21
toolchain, ArchUnit, Testcontainers — зависимости объявлены, используются позже),
Gradle wrapper закоммичен. Дерево:
```
backend/
  app/                  # AnalystGymApplication, application.yml, HostProductFilter
  modules/{identity,catalog,practice,review,assessment,
           courses,content,billing,quality,notify,admin}/
    build.gradle        # пока только зависимости: shared/kernel (+ spring-web по нужде)
    src/main/java/ru/analystgym/<module>/
    src/test/java/ru/analystgym/<module>/
  shared/kernel/        # Result, AppException, TimeProvider
  shared/persistence/   # пусто до Фазы 1 (Flyway едет туда же)
```
Каждый модуль — свой Gradle-сабпроект, свой корневой пакет
`ru.analystgym.<module>` (это нужно ArchUnit-правилу ниже).

**0.2. Точка входа.** `AnalystGymApplication`, `application.yml`
(port 8080, нейтральные имена env без секретов в репо),
`GET /api/health → {status:"UP", product, version}` (version из jar manifest,
fallback `dev`), `HostProductFilter`: читает `Host`, кладёт атрибут
`product` (`practice`|`course`|default), в Фазе 0 только логирует и отдаёт
в health для проверки.

**0.3. Статика из макета.** Gradle-таска `syncMockup` (тип Copy):
из `tasks-mockup/` в `app/src/main/resources/static/`, исключить
`server.py`, `check-mockup.py`, `scripts/`. Boot раздаёт как есть —
проверка: `GET /` отдаёт хаб, `GET /assets/styles.css` — 200.
(Замена `Store` на `api.js` — не Фаза 0, это Фазы 1–2.)

**0.4. Docker Compose** (`deploy/docker-compose.yml` + `deploy/Caddyfile` +
`deploy/.env.example`): сервисы `app` (build `../backend`, порт 8080),
`postgres:16` (volume `pgdata`, healthcheck `pg_isready`),
`redis:7-alpine`, `caddy` (80/443 → `reverse_proxy app:8080`).
Локально: `localhost:8080` напрямую; поддомены — через записи
`127.0.0.1 practice.local course.local` в hosts (инструкция в
`backend/README.md`). Postgres/Redis в Фазе 0 просто подняты и healthy,
приложение их не трогает (Flyway и миграции — Фаза 1).

**0.5. CI** (`.github/workflows/build.yml`): JDK 21, `./gradlew build`
(компиляция + тесты + ArchUnit), кэш Gradle. Без деплоя (деплой — Фаза 4).

**0.6. ArchUnit-тест** (`app/src/test/.../ModuleBoundariesTest`):
1) пакеты `ru.analystgym.*` не образуют циклов;
2) `..review..` не зависит от `..web..`/`..catalog..` (только kernel +
   свои DTO). Тест красный до фикса структуры — чиним структуру, не тест.

**0.7. Документация фазы.** `backend/README.md`: требования (JDK 21,
Docker), команды (`compose up`, `./gradlew bootRun`, `./gradlew test`),
таблица портов (8080 app, 5432 pg, 6379 redis, 80/443 caddy) и env
(`POSTGRES_PASSWORD` и т.д. только через `.env`, в репо — `.env.example`).

**Критерии готовности Фазы 0 (все пункты — да):**
- [ ] `docker compose -f deploy/docker-compose.yml up` поднимает 4 сервиса без ошибок
  (НЕ ПРОВЕРЕНО: на дев-машине лежал Docker-демон; вместо compose проверена связка
  `analystgym-pg` + `bootRun` — перенос проверки compose на VPS/Фазу 4);
- [x] `GET /` возвращает хаб макета (200, проверено живьём 2026-10-10),
  `GET /api/health` — JSON со статусом (публичный, проверено живьём);
- [ ] CI зелёный на пуше в `main` (смотреть вкладку Actions; локальный `build` зелёный);
- [x] ArchUnit-тест зелёный (входит в каждый `./gradlew build`);
- [x] В репо нет секретов (только `.env.example`, проверено `git ls-files`),
  сгенерированная статика в git не коммитится (игнор `resources/static` работает).

### Фаза 1 — Аккаунты + витрина каталога (1–2 недели) — ✅ ГОТОВА (2026-10-10)

Исходный план (не меняется): регистрация/вход/JWT в httpOnly-куках, роли,
сброс пароля (письмо в лог). Сид БД из данных макета (задачи, подборки,
справочники). Read-API каталога, `api.js` первые методы (каталог/подборки).
**Демо:** вход работает, каталог грузится из Postgres.
**Критерий:** гость видит витрину, студент — свой прогресс-чип.

**Сделано:**

- [x] Identity: register/login/refresh (ротация)/logout/logout-all/me,
  сброс пароля (токен в лог по контракту «письмо в лог»);
- [x] Каталог read-API: `/api/tasks`, `/api/tasks/{id}`, `/api/collections`,
  `/api/collections/{id}`, `/api/dictionaries` (+ `/api/auth/csrf` для CSRF-прайминга);
- [x] Сид из макета: V1 identity, V2 уровни/метки/подборки (3/60/6),
  V3 задачи (16) — генератор `tasks-mockup/scripts/gen-seed.ps1`;
- [x] `api.js`: fetch-first + fallback на встроенные данные, каталог и подборки
  ждут `Api.ready`, прайм CSRF перед каждым POST;
- [x] Проверено: `./gradlew build` зелёный (11 unit-тестов identity + catalog +
  ArchUnit); макет в headless Edge рендерит витрину без сервера (16 задач, 33 ссылки
  подборок); витрина с сервера (`:8080/catalog.html`) рендерит 16 задач через живой API.

**Проверено живьём** (Postgres 16 в Docker, контейнер `analystgym-pg`, чистая база):

- миграции V1–V3 применяются; `/api/health` публичный 200;
- каталог: 16 задач, фильтр `level=easy` → 4, поиск `Kafka` → 1, битый id → 404,
  кириллица по байтам цела;
- auth-цикл: register 201 → me 200 → refresh 200 → logout → me 401;
- сброс: request 202 (+202 для несуществующего email, без перечисления),
  confirm 200, повтор 401, вход с новым 200, со старым 401.

**Проблемы → решения (все проверены живьём):**

| # | Проблема | Решение |
|---|---|---|
| 1 | Flyway: `Unsupported Database: PostgreSQL 16.15` (в Flyway 10+ СУБД в отдельных артефактах) | `flyway-database-postgresql` в `shared/persistence` |
| 2 | Spring не видел имён `@RequestParam` (`/api/tasks` падал) | `-parameters` глобально в `build.gradle` |
| 3 | Работала дефолтная Basic-авторизация вместо нашей (`WWW-Authenticate: Basic`) — app не зависел от модулей | `implementation` на identity/catalog в `app/build.gradle` |
| 4 | `NoSuchBean UserRepository` — JPA-скан видел только пакет приложения | `@EnableJpaRepositories` + `@EntityScan("ru.analystgym")` |
| 5 | `/api/health` был закрыт (401 вместо контракта Фазы 0) | `permitAll` (контракт) |
| 6 | Битые id отдавали 401 вместо 404 (error-dispatch перепроверяется цепочкой) | `permitAll` на `/error` |
| 7 | Анонимный `/api/auth/me` падал в NPE (500) | `authenticated()` раньше `permitAll`, плюс страховка от null в методе |
| 8 | Сырая кука XSRF-TOKEN в заголовке даёт 403 (дефолтный XOR-хендлер Boot) | `/api/auth/csrf` отдаёт маскированный токен, фронт шлёт его |
| 9 | Каждый JWT-запрос чистил CSRF-куку (`CsrfAuthenticationStrategy`, доказано до байткода) — следующий POST умирал | пустая session-стратегия на `CsrfConfigurer` (stateless: события логина нет) + прайм перед каждым POST |

**Не входит в фазу (следующие этапы):**

- формы входа/регистрации во фронте (только методы `api.js`) — этап личного кабинета;
- настоящие письма (только лог) — Фаза 3/4;
- полные тела задач в API (только сводки) — Фаза 2;
- серверный прогресс студента (чип пока из локального Store) — Фаза 2;
- `docker compose` целиком — Фаза 4 (прод-деплой).

### Фаза 2 — Контур практики, mock-режим (2–3 недели, ядро MVP)
Черновики, идемпотентный submit (`Idempotency-Key` → 202), jobs-таблица +
воркер, `MockReviewProvider` — порт `review-engine.js` 1-в-1 (веса, пороги,
структура `ReviewResult`), грейд считает код, polling статуса, история
попыток, эталон после ревью.
**Демо:** полный цикл «решил → отправил → получил ревью» через бэк.
**Критерий:** ревью из бэка совпадает с макетом на контрольных решениях.

### Фаза 3 — Диагностика + контур качества (2 недели)
Банк вопросов (минимальный CRUD — вопросов в админке макета нет),
порт `scoring.js`, история замеров, план прокачки. Админские API:
задачи (CRUD, рубрика, статусы, симулятор — серверная валидация),
жалобы (очередь, резолюции), разбор попыток, дашбордMISS-топ.
**Демо:** диагностика end-to-end + методист правит задачу через API.
**Критерий:** UC-D01–D03, UC-M01–M08, UC-Q01–Q04 закрыты.

### Фаза 4 — Деньги + LLM + прод (2–3 недели) = ЗАПУСК MVP
Адаптер ЮKassa (тест): заказы, Pro-подписка, идемпотентные вебхуки,
промокоды. `LLMReviewProvider`: DeepSeek по умолчанию, fallback GLM/Qwen,
тексты промптов и трафик из админки, валидация JSON, cost-cap, учёт токенов.
Rate limits, audit-log, письма (сброс, «ревью готово»), бэкап/restore drill,
деплой вариант A (CI→GHCR→VPS), Caddy с поддоменами.
**Демо:** тестовый платёж открывает Pro; ревью от LLM неотличимо по форме.
**Критерий запуска:** чеклист — оплата, ревью p95, бэкап, алерты.

## После MVP

### Фаза 5 — Курсы (2–3 недели, после записи видео)
CRUD курсов/модулей/уроков (админки нет — делать по образцу задач),
import-job `output/*.md` (серверный аналог `build-content.ps1`), прогресс,
paywall + разовые покупки (расширение billing), страница-обзор.
**Критерий:** UC-C01–C05 закрыты.

### Фаза 6 — Рост (по приоритету)
Уведомления-реактивация, онбординг, сертификаты, оценки полезности,
лёгкая геймификация (streak), B2B-кабинет, SSE вместо polling,
RabbitMQ при нагрузке, SPA — только если упрёмся.

## Карта соответствия фаз и юзкейсов (product-spec.md)

| Фаза | Юзкейсы |
|---|---|
| 0 | — (инфра) |
| 1 | UC-S01, UC-S02 (чтение), часть UC-A01 |
| 2 | UC-S03–S07, UC-SYS01 (mock) |
| 3 | UC-D01–D03, UC-S08, UC-M01–M09, UC-Q01–Q04, UC-SYS02 |
| 4 | billing (новый UC-B01–B04 при детализации), UC-L01–L06, UC-SYS01 (LLM) |
| 5 | UC-C01–C05 |
| 6 | backlog |

## Оценка

- MVP (фазы 0–4): **8–11 недель part-time**.
- Курсы (фаза 5): **+2–3 недели**.
- Риски: LLM-качество ревью (закрывается A/B + жалобами), скоринг-честность
  (симулятор в админке), объём переноса фронта (минимизирован api.js).
