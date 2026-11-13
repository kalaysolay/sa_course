# Сверка состояния курса с физическими пакетами — 11.11.2026

Дата: 11.11.2026. Повод: при генерации урока ARCH-SYNC (32) обнаружено, что тема ARCH-ASYNC (33)
помечена `completed`, хотя пакета в `output/` нет. Проведён полный аудит.

## Метод

Сверка `course/progress.yaml` (статус `completed`) с физическим наличием
`output/<module>/<topic>/lesson-manifest.json` и `lecture.md` для всех 98 тем курса.
Скрипт-аудит: `Temp/opencode/audit-progress.mjs` (временный, удалён после проверки).

## Результат аудита

- тем в курсе: 98; помечены `completed`: 44; **физических пакетов на диске: 30**;
- рассинхрон: **14 тем** — прогресс claims `completed`, пакета нет;
- расхождение run_id между прогрессом и манифестом: 0 (проблема только в отсутствии пакетов);
- отдельно `needs_revision` (корректно): UML-STATE (21), UML-SEQUENCE (22) — у них уже честный статус.

### Список 14 тем

| Тема | order | Прежний run | Особенность |
|------|-------|-------------|-------------|
| ARCH-ASYNC | 33 | 20260814T192557Z | — |
| SEC-AUTHENTICATION | 34 | 20260814T205625Z | пакет собирался в общий `output/M06/INT-REST/` |
| SEC-AUTHORIZATION | 35 | 20260814T205625Z | пакет собирался в общий `output/M06/INT-REST/` |
| INT-BASICS | 36 | 20260813T212909Z | — |
| INT-REST | 37 | 20260815T053035Z | — |
| INT-SOAP | 38 | 20260818T051353Z | — |
| INT-MQ | 39 | 20260824T203750Z | — |
| INT-FILES | 40 | 20260825T045808Z | — |
| INT-DATABASE | 41 | 20260826T192218Z | — |
| INT-API-DESIGN | 42 | 20260827T194221Z | — |
| DB-INTRO | 43 | 20260828T135922Z | — |
| DB-RELATIONAL | 44 | 20260828T194520Z | — |
| DB-STRUCTURE | 45 | 20260905T123031Z | — |
| DB-PSQL | 46 | 20260911T045957Z | — |

Причина: пакеты были потеряны при повторном клонировании репозитория и не попали в git
(`.gitignore`-whitelist). Прогресс этого не отражал: `recomputeProgress` доверяет сохранённому
статусу и не проверяет наличие файлов.

## Принятые меры

1. **Прогресс приведён в соответствие** (каноническим кодом `src/progress.mjs`):
   14 тем → `status: needs_revision`, `output: null`, прежние `run_id`/`output` сохранены
   в `previous_run_id`/`previous_output`, добавлена `note` о причине.
   Итог: `completed 44 → 30`, `needs_revision 2 → 16`, `planned 52`, `last_completed = ARCH-SYNC (32)`.
2. **Зарегистрированы GAP** `GAP-0003…GAP-0016`, тип `missing_lesson_package`, severity `minor`
   (не блокирует перегенерацию: `blockingGapsForTopic` смотрит только critical/major),
   `affected_topics` — по одной теме, `suggested_action` — команда пересборки.
3. **Трекер курса** (локальный xlsx-экспорт; живая Google Sheets в сессии недоступна —
   нет Sheets MCP, браузер не залогинен, CSV-экспорт отдаёт 401): строки 37–50 приведены
   к конвенции утерянных пакетов (как у UML-STATE/UML-SEQUENCE):
   `Лекция сгенерирована = Нет`, `Лекция отредактирована = Нет`, `Артефакты` — пусто,
   `Статус артефакта = Пакет отсутствует в output/ (потерян при re-clone, не попал в git); нужна перегенерация`,
   `Статус урока = Нужна перегенерация`, `Output` — пусто; прежний run id сохранён в `Run ID`.
   Строка найдена по Topic ID (колонка H), дубликаты не создавались.
4. **Карта покрытия выявления**: аудит выполнен скриптом, повторяется перед крупными прогонами;
   причина в том, что `recomputeProgress` (src/progress.mjs) не сверяет статус с файловой системой —
   это кандидат на доработку издателя (ADR-уровневое решение).

## Очередь перегенерации

`next_candidate` = **UML-STATE (21)** — по дизайну `recomputeProgress` приоритет отдаётся
`needs_revision` в порядке курса. Фактический порядок работы (по номеру урока):
21, 22, затем 33 → 46.

Очередь на пересборку: UML-STATE, UML-SEQUENCE, ARCH-ASYNC, SEC-AUTHENTICATION, SEC-AUTHORIZATION,
INT-BASICS, INT-REST, INT-SOAP, INT-MQ, INT-FILES, INT-DATABASE, INT-API-DESIGN, DB-INTRO,
DB-RELATIONAL, DB-STRUCTURE, DB-PSQL (16 тем).
