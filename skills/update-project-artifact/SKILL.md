# Скилл: обновить проектный артефакт (update-project-artifact)

## Назначение

Создать/обновить только артефакты из Topic Passport `project.expected_artifacts` (lean: `05-project-artifacts`).

## Входы

- `00-input/project-state.yaml`
- `00-input/topic-passport.json`
- Lesson Brief и финальная лекция

## Результаты

- `05-project/project-change.json`
- `05-project/proposed/…`
- `05-project/approved/…`
- при необходимости diff

## Правила

- Не трогай canonical `project/compliance/…` напрямую из этой стадии (только proposed/approved в run; merge — отдельное осознанное решение).
- Не плоди lesson-only артефакт, если практика уже закрывает упражнение.
- Сверься с вкладкой «Документация» трекера: `Начат` / `Где начато` (см. `course/lesson-generation-pipeline.md`).
- Один targeted rewrite только при critical/major.
