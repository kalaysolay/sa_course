# AnalystGym backend (Фаза 0)

## Быстрый старт

```bash
# 1. Статика макета подтянется сама при сборке (таска syncMockup).
# 2. Поднять всё:
docker compose -f ../deploy/docker-compose.yml up --build
# 3. Открыть: http://localhost:8080 (хаб), /api/health (JSON).
```

Локальная разработка без Docker: `./gradlew bootRun` (нужны JDK 21
и запущенные postgres/redis, если ваш код их уже требует; в Фазе 0 не требует).

## Порты и переменные

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
