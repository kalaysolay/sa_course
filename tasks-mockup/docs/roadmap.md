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
- [ ] `docker compose -f deploy/docker-compose.yml up` поднимает 4 сервиса без ошибок;
- [ ] `GET /` возвращает хаб макета, `GET /api/health` — JSON со статусом;
- [ ] CI зелёный на пуше в `main`;
- [ ] ArchUnit-тест зелёный;
- [ ] В репо нет секретов (только `.env.example`), нет сгенерированных файлов.

### Фаза 1 — Аккаунты + витрина каталога (1–2 недели) — ✅ ГОТОВА (2026-10-10)

Что сделано: identity (register/login/refresh/logout/me, сброс пароля — заглушка
без письма до Фазы 3), каталог read-API (`/api/tasks`, `/api/collections`,
`/api/dictionaries`), сид из макета (V2 уровни/метки/подборки, V3 задачи),
`api.js` с fetch-first и fallback на встроенные данные (каталог + подборки ждут
`Api.ready`). Проверено: `./gradlew build` зелёный (11 unit-тестов identity +
catalog), макет в headless Edge рендерит 16 задач и подборки без сервера.
Остаток долга: ручная проверка входа и каталога против живой Postgres
(Docker на дев-машине недоступен — проверить через VPS/CI).
Регистрация/вход/JWT в httpOnly-куках, роли, сброс пароля (письмо в лог).
Сид БД из данных макета (задачи, подборки, справочники). Read-API каталога,
`api.js` первые методы (каталог/подборки).
**Демо:** вход работает, каталог грузится из Postgres.
**Критерий:** гость видит витрину, студент — свой прогресс-чип.

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
