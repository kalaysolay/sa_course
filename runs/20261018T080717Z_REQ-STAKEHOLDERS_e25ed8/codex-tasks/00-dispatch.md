# Диспетчер Codex-агентов: REQ-STAKEHOLDERS

Run: 20261018T080717Z_REQ-STAKEHOLDERS_e25ed8
Тема: 14. Заинтересованные лица
Режим: агенты Codex/ChatGPT app, внешний OPENAI_API_KEY не нужен.

## Как работать

1. Выполняй только пакеты задач ниже, строго по порядку. Не восстанавливай опущенные legacy-стадии.
2. Читай только объявленные входы каждого пакета. Передавай артефакты путями к файлам, а не копированием всего текста между агентами.
3. Перед semantic-ревью прогони детерминированные проверки формата/схемы. Rewrite — только на critical и major.
4. Перезапускай только упавшую перспективу ревью; не больше одного полного rewrite на артефакт.
5. После авторских стадий выполни `node scripts/publisher.mjs /finalize-codex-run 20261018T080717Z_REQ-STAKEHOLDERS_e25ed8`.
6. Заверши пакетом трекера, опираясь на готовый manifest и payload-metrics.

## Трекер курса

- Таблица: https://docs.google.com/spreadsheets/d/1She4DAsy9KIQ0uXdMDbTvtDsftT3BNBiorYMScyArew/edit
- Лист: План лекций
- Ищи существующий урок по Topic ID в колонке H.
- Обновляй существующую строку, не дублируй. Новую строку добавляй только если Topic ID отсутствует.
- Сохраняй многострочные ячейки в `Модуль / раздел / урок` и `Артефакты`.
- Если Google Drive недоступен — обнови локальный xlsx-экспорт трекера тем же правилами.

## Карта задач

- 01-plan-research | Планировщик урока и исследователь | codex-tasks/01-plan-research.md -> 01-brief/lesson-brief-final.json, 02-research/source-pack.md
- 02-writer | Автор лекции | codex-tasks/02-writer.md -> 03-lecture/draft-v1.md
- 03-lean-review | Lean-ревью лекции | codex-tasks/03-lean-review.md -> 03-lecture/review-v1/content.json, 03-lecture/review-v1/learning.json, 03-lecture/final.md
- 04-assessment | Автор практики с self-check | codex-tasks/04-assessment.md -> 04-assessment/draft.json, 04-assessment/exercises.md, 04-assessment/answers.md
- 05-project-artifacts | Автор проектных артефактов с self-check | codex-tasks/05-project-artifacts.md -> 05-project/project-change.json, 05-project/proposed/, 05-project/approved/
- 06-tracker-updater | Обновление трекера курса | codex-tasks/06-tracker-updater.md -> 99-package/tracker-update-report.md

## Открытые GAP

- GAP-0001: source_gap/minor — Primary source SRC-WIEGERS-REQUIREMENTS зарегистрирован, но недоступен.
- GAP-0002: source_gap/minor — Primary source SRC-WIEGERS-REQUIREMENTS зарегистрирован, но недоступен.
