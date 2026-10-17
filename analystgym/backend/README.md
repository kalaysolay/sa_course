# AnalystGym backend (Фазы 0–4, MVP)

## Быстрый старт

```bash
# 1. Статика макета подтянется сама при сборке (таска syncMockup).
# 2. Поднять всё:
docker compose -f ../deploy/docker-compose.yml up --build
# 3. Открыть: http://localhost:8080 (хаб), /api/health (JSON).
```

Первого администратора создаёт отдельная серверная команда: задать
`APP_DB_URL`, `APP_DB_USER`, `APP_DB_PASSWORD`, `APP_BOOTSTRAP_ADMIN_EMAIL`
и `APP_BOOTSTRAP_ADMIN_PASSWORD` в окружении и выполнить
`java -jar app/build/libs/app-0.1.0.jar --bootstrap-admin` после миграций БД.
Команда не запускает HTTP/воркеры, отказывается повышать существующий аккаунт
и не работает при наличии SUPERADMIN. После запуска удалить bootstrap-пароль
из окружения. `APP_ADMIN_EMAILS` больше не используется. Следующие роли
выдаются через `PUT /api/admin/users/{id}/role` (поля `role`, `expectedRole`).

Серверная админка доступна на `/admin.html`; роль проверяется API, локальные
правки макета на данные БД не влияют. Контент защищён версиями (V13):
изменение требует `version` из последнего GET, конфликт возвращает 409.
`GET /api/tasks/{id}/detail` возвращает версию задачи, `POST /api/attempts`
принимает её в `taskVersion`. Эталоны загружаются только через защищённый
`/reference`; файлы `data-tasks-*.js` в JAR не включаются. Публикация требует
заполненного условия, результата, рубрики, эталона и стартовых вкладок.
Полный контракт и роли: `../tasks-mockup/docs/product-spec.md`, руководство:
`../tasks-mockup/docs/admin-guide.md`.

Проверки пакета безопасности: `./gradlew build :app:integrationTest`
(для integrationTest нужен Docker) и
`node --test ../tasks-mockup/tests/session.test.cjs`.
При старом Testcontainers и новом Docker можно передать JVM-свойство
`-Dapi.version=1.44` через `JAVA_TOOL_OPTIONS`; Docker endpoint берётся из
активного контекста (`DOCKER_HOST` при необходимости).

Локальная разработка без Docker: `./gradlew bootRun` (нужны JDK 21
и запущенный postgres; redis коду не нужен — лимиты в памяти).

## Порты и переменные

V14 (пакет 7–10): submit требует `Idempotency-Key` и неизменяемое тело.
Квота Free включает работу в очереди, failed освобождает место. Все входы
проверки фиксируются при submit; журнал и расходы видны персоналу качества.
Владелец получает только сохранённое публичное условие.

| Переменная | По умолчанию | Назначение |
|---|---|---|
| REVIEW_MAX_SOLUTION_CHARS | 20000 | Сумма исходного содержимого вкладок |
| REVIEW_MAX_INPUT_BYTES | 64000 | UTF-8 байты system+user на вызов |
| REVIEW_MAX_OUTPUT_TOKENS | 2000 | max_tokens в HTTP |
| REVIEW_TOKEN_BUDGET | 160000 | Бюджет попытки со всеми повторами |
| REVIEW_MAX_CALLS | 6 | Все обращения, включая неизвестный исход |
| REVIEW_QUEUE_ENABLED | true | Планировщик (false для тестов/обслуживания) |
| REVIEW_WORKERS | 2 | Параллельные обработки на инстанс, 1–32 |
| REVIEW_LEASE_SECONDS | 30 | Срок захвата |
| REVIEW_HEARTBEAT_MS | 1000 | Продление; значительно короче lease |
| REVIEW_POLL_MS | 500 | Поиск работы |
| REVIEW_MAX_TRIES | 3 | Максимум захватов job |
| REVIEW_RETRY_SECONDS | 2 | Начальная пауза, затем удваивается |

Резерв вызова: байты входа + 1024 + maxOutputTokens. Известный usage заменяет
резерв, неизвестный сохраняет его целиком. Это техническая оценка, не денежный
лимит. Повтор прерванного внешнего вызова может быть платным.
Истёкшие lease восстанавливаются автоматически, готовая часть агента берётся
из журнала. Перед V14 остановить старые воркеры: незавершённые попытки без
плана станут failed (`legacy_review_requires_resubmit`). Готовые ревью
сохраняются; исторический контекст старых попыток может отсутствовать.

| Что | Где | Значение |
|---|---|---|
| app | compose / bootRun | `:8080` |
| postgres | compose | `:5432`, volume `pgdata` |
| redis | compose | `:6379` |
| caddy | compose | `:80`, `:443` |
| секреты | `deploy/.env` | см. `deploy/.env.example` (в git только example) |

Поддомены локально: `127.0.0.1 practice.local course.local` в hosts
+ правка доменов в `deploy/Caddyfile`. Без поддоменов — просто
`localhost:8080` (продукт по умолчанию `practice`).

## Структура

- `settings.gradle` — список модулей; `build.gradle` — общие настройки
  (Java 21 toolchain, UTF-8, JUnit5) и центральный BOM Spring Boot
  (версии библиотек только там, в модулях версий нет).
- `app/` — точка входа, `HostProductFilter`, `/api/health`, syncMockup.
- `modules/*` — 11 продуктовых модулей (пока каркасы, наполнение — Фазы 1–5).
- `shared/kernel` — общие примитивы (`Result`); `shared/persistence` —
  Flyway и репозитории (с Фазы 1, сейчас пусто).

## Правила этого каталога

- Версии библиотек — только здесь (литералы в `app/build.gradle`),
  не размазывать по модулям.
- Новый модуль = строчка в `settings.gradle` + `build.gradle` с комментарием
  «что и в какой фазе» + пакет `ru.analystgym.<name>`.
- `processResources` всегда после `syncMockup`: в образе только свежая статика.
