# Codex-native производство уроков

Основной путь: Codex/ChatGPT desktop app. `OPENAI_API_KEY` не нужен.

## Команды

```powershell
node scripts\publisher.mjs /prepare-codex-next
node scripts\publisher.mjs /prepare-codex-lesson 1
node scripts\publisher.mjs /publish-lesson 1 --adapter codex
```

Команда создаёт run со статусом `CODEX_TASKS_READY` и пишет контекст плюс пакеты ролей в `runs/<runId>/codex-tasks/`.

## Порядок lean-ролей

1. Планировщик + исследователь → компактный brief и карта утверждений → источники.
2. Автор лекции → один полный черновик.
3. Lean-ревью → два вердикта за одно чтение: content/coverage и learning/editorial.
4. Автор практики → assessment + self-check покрытия LO.
5. Автор проектных артефактов → только если Topic Passport объявляет expected artifacts.
6. Обновление трекера → читает только финальный manifest и payload metrics.

Перед пакетом трекера выполни локальную финализацию:

```powershell
node scripts\publisher.mjs /finalize-codex-run <runId>
```

Проверки формата, относительных ссылок, схем и покрытия assessment — локально. Rewrite только на critical/major. Перезапускай только упавшую перспективу; в lean — не больше одного полного rewrite.

## Трекер курса

Каждый Codex-native run завершается обновлением трекера:

- Таблица: https://docs.google.com/spreadsheets/d/1She4DAsy9KIQ0uXdMDbTvtDsftT3BNBiorYMScyArew/edit
- Лист: `План лекций`
- Существующие строки ищутся по `Topic ID` в колонке `H`.
- Если строка есть — обновляй её; не добавляй дубликат.
- Если Topic ID нет — добавь строку в том же порядке колонок.
- `Артефакты` — список через перевод строки в одной ячейке.
- `Статус артефакта` — жизненный цикл: создан, продолжен, изменён, не начат, в этом уроке не использовался и т.п.
- Если Google Drive MCP недоступен — правь локальный xlsx-экспорт теми же правилами; синхронизируй вкладку `Документация` по `course/lesson-generation-pipeline.md`.

## Политика адаптеров

Основной: task packets для Codex/ChatGPT app. Тесты/демо: FakeAgentAdapter. Опционально: OpenAIAdapter для headless, только если явно нужен внешний API-ключ.
