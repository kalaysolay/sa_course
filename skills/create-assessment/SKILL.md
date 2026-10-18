# Скилл: создать практику (create-assessment)

## Назначение

Собрать assessment и проверить покрытие learning outcomes в одном проходе (lean: `04-assessment`).

## Входы

- `01-brief/lesson-brief-final.json`
- `03-lecture/final.md`
- `schemas/assessment.schema.json`

## Результаты

- `04-assessment/draft.json`
- `04-assessment/exercises.md`
- `04-assessment/answers.md`

## Правила

- По умолчанию не больше `assessment_default_items` из `publisher.yaml` (обычно 9), если бриф не требует больше.
- У каждого задания — ответы/объяснения, наблюдаемые критерии, привязка к LO.
- Если бриф требует project case — добавь `project_case` по Compliance.
- Отдельный semantic-ревьюер не нужен, пока проходят схема и детерминированное покрытие LO.
