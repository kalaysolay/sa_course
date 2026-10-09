# Course Publisher

## Source Of Truth

- `docs/lean-production-contract.md` for lesson production;
- `publisher.yaml`
- `course/curriculum.yaml`
- `course/progress.yaml`
- `course/gap-registry.yaml`
- `references/source-registry.yaml`
- `schemas/*`

The historical `docs/course-publisher-spec-v0.3.md` is reference material. Do not load it during normal lesson production; open it only when changing the publisher architecture or a schema contract.

## Основное правило

Orchestrator управляет workflow и состоянием. Он не пишет учебное содержание и не меняет curriculum автоматически.

## Publish Lesson

1. resolve topic;
2. check progress and blocking gaps;
3. create run;
4. execute structured stages;
5. validate artifacts;
6. assemble Lesson Package.
7. update the Google Sheets course tracker.

## Course Tracker

- Google Sheets tracker: https://docs.google.com/spreadsheets/d/1She4DAsy9KIQ0uXdMDbTvtDsftT3BNBiorYMScyArew/edit
- Sheet: `План лекций`.
- Match existing rows by `Topic ID` in column `H`; update the existing row instead of appending duplicates.
- Append a row only when the topic is missing from the tracker.
- Keep `Артефакты` as a newline-separated list inside one cell.
- Use `Статус артефакта` for lifecycle/status detail, not a binary yes/no: an artifact can be started in one lesson and continued or changed in another.

## Запрещено

- silently skip blocked topics;
- mutate curriculum from agent output;
- merge experimental project artifacts into canonical project unless explicitly enabled.

---

# AnalystGym (backend `backend/`, mockup `tasks-mockup/`)

Spec anchor: `tasks-mockup/docs/product-spec.md`. Architecture: `tasks-mockup/docs/architecture.md`. Plan: `tasks-mockup/docs/roadmap.md`. Admin guide: `tasks-mockup/docs/admin-guide.md`.

> **Область действия раздела.** Всё ниже относится **только к реализации
> самого приложения** (бэкенд + макет/фронт). К работе генераторов курса
> (издательство, пайплайн лекций, контент — верхний раздел этого файла)
> эти правила **не применяются** — там действуют свои.

## Правила работы агентов (обязательные, только для приложения)

1. **Не усложняй код без необходимости.** Простое решение, покрывающее
   требование, лучше гибкого «на вырост». Новый слой абстракции, паттерн
   или зависимость — только если задача явно этого требует; выбор фиксируй
   в `architecture.md` как ADR.
2. **Комментарии — на русском.** Javadoc/блочные комментарии для публичных
   классов и методов + точечные комментарии сложных мест прямо внутри
   методов (почему так, а не что делает строка). Очевидное не комментировать.
3. **После каждого завершённого цикла — пробный билд.** Цикл =
   задача/фича/фикс целиком: `./gradlew build` (или аналог для фронта)
   обязан быть зелёным до отчёта о готовности. Упавший билд чинится сразу,
   не откладывается «на потом».
4. **Конфиги вместо кода — по балансу.** Пороги, URL, лимиты, тексты,
   feature-флаги выносятся в конфиги (`application.yml`, env, таблицы
   настроек), а не зашиваются в код. Но: не выносить то, что меняется
   только вместе с кодом (структуры данных, контракты) — это уже не
   конфигурация, а размазанная логика.
5. **Тесты комментируются тоже.** У каждого теста — русское описание
   сценария: что проверяем и почему это важно (given/when/then в комментариях
   или именах). Тест без понятного назначения — плохой тест.

## Заработанные конвенции репозитория (нарушались — больше не нарушаем)

- Текстовые файлы правим только файловыми инструментами (`edit`/`write`);
  PowerShell — только чтение и запуск. `Set-Content`/`Out-File` молча ломают
  UTF-8 кириллицу (двойное перекодирование) — эпизод с `course.js`.
- Проверка фронта — headless Edge напрямую (`& msedge.exe ... | Set-Content`),
  без `cmd /c ... > file` (давал чужие дампы). Пробы — через `write`-файлы,
  временные файлы удалять после проверки.
- Изменения поведения фиксировать в `docs/product-spec.md` / `docs/roadmap.md`
  тем же коммитом (доки — часть definition of done).
- Секреты — только через `.env`, в репо лишь `.env.example`. Никогда
  не коммитить ключи, токены, пароли.
