# Скилл: выбрать следующую тему (resolve-next-topic)

## Назначение

Определить кандидата на production без молчаливого пропуска дыр.

## Логика (оркестратор)

1. Пересчитать `course/progress.yaml`.
2. Взять первую тему со статусом `needs_revision`, иначе первую `planned` (по `course_order`).
3. Проверить blocking GAP (`critical` / `major`) для этой темы.
4. При блокере — остановиться и сообщить, не прыгать дальше.

## Команды

```powershell
node scripts/publisher.mjs /course-status
node scripts/publisher.mjs /prepare-codex-next
```
