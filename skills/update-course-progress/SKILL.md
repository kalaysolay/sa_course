# Скилл: обновить прогресс курса (update-course-progress)

## Назначение

Синхронизировать статусы тем после run и пересчитать summary / next_candidate.

## Где живёт

- машинно: `course/progress.yaml`
- человекочитаемо: `course/PROGRESS.md` (пишет оркестратор)

## Статусы

`planned` | `in_progress` | `completed` | `needs_revision` | `blocked` | `skipped`

## Важно для перегенерации

Темы с `needs_revision` имеют приоритет над `planned` при выборе `next_candidate`, чтобы не перепрыгивать утерянные уроки.
