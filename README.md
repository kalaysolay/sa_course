# Course Publisher

Файловый stateful-пайплайн для выпуска курса по бизнес- и системному анализу на сквозном проекте Compliance.

## Quick Start

```powershell
node .\scripts\bootstrap-seed.mjs
node .\scripts\publisher.mjs /course-status
node .\scripts\publisher.mjs /publish-next
node .\scripts\publisher.mjs /publish-lesson 14
node .\viewer\server.mjs .\output
node --test
```

## Course Viewer

Локальный вьюер для визуального контроля срендеренных Markdown-лекций лежит в `viewer/`.

```powershell
npm run viewer -- .\output
```

После запуска откройте `http://127.0.0.1:5177`. Вьюер рекурсивно ищет `lecture.md` в выбранной папке, показывает кликабельный список лекций и рендерит контент выбранной лекции. Папку можно поменять в поле сверху без перезапуска сервера.

Если открыть `viewer/public/index.html` напрямую, текстовый путь к папке не сработает из-за ограничений браузера. В этом режиме используйте кнопку `...` рядом с полем папки и выберите директорию через системный диалог.

Первая реализация использует fake agent adapter. Реальные LLM/subagent adapters подключаются только после прохождения skeleton-тестов.

## OpenAI Adapter

По умолчанию CLI использует deterministic fake adapter для тестов и воспроизводимости.

Для реального OpenAI Responses API:

    $env:OPENAI_API_KEY="..."
    node .\scripts\publisher.mjs /publish-lesson 15 --adapter openai

Настройки можно переопределить:

    node .\scripts\publisher.mjs /publish-topic REQ-ELICITATION --adapter openai --model gpt-5.6-sol --reasoning medium

Модель по умолчанию для OpenAI adapter: gpt-5.6-terra. Для максимального качества можно указать gpt-5.6-sol, для режима ближе к ChatGPT Instant можно указать chat-latest.


## Codex-native Production

Primary production runs are prepared for the Codex/ChatGPT desktop app and do not require `OPENAI_API_KEY`.

```powershell
node scripts\publisher.mjs /prepare-codex-next
node scripts\publisher.mjs /prepare-codex-lesson 1
node scripts\publisher.mjs /publish-lesson 1 --adapter codex
```

The generated run stops at `CODEX_TASKS_READY`; role packets live in `runs/<runId>/codex-tasks/`. See `docs/codex-native-workflow.md`.

After the authoring packets are complete, validate and assemble the package locally:

```powershell
node scripts\publisher.mjs /finalize-codex-run <runId>
```

Lean mode uses 5 task packets for lessons without project artifacts and 6 when the Topic Passport requires one. Token/payload metrics are written to `99-package/payload-metrics.json`.

The OpenAI API adapter is optional only, for future headless automation when an external API key is explicitly desired.
