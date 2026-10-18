# Скилл: спроектировать урок (design-lesson)

## Назначение

Собрать компактный Lesson Brief по Topic Passport (стадия lean: `01-plan-research`, роль методолога).

## Входы

- `00-input/topic-passport.json`
- `00-input/course-context.yaml`
- `00-input/audience.md`
- `00-input/source-registry-slice.json`
- схема `schemas/lesson-brief.schema.json`

## Результат

- `01-brief/lesson-brief-final.json`

## Правила

- Бриф должен позволять написать живую лекцию, а не outline.
- Уважай границы passport (`include` / `exclude`), prerequisites и project case.
- Не открывай историческую спецификацию издательства без крайней нужды.
- Соблюдай лимит размера из `publisher.yaml` → `optimization.output_limits.lesson_brief_chars`.
