# Проверки выпуска урока 22

- До запуска: `needs_revision`; прежний пакет отсутствовал в output. Создан новый Codex-native run.
- Роли планирования, написания, ревью, практики и трекера запущены с `fork_turns=none`; передавались пути к необходимым входам.
- Актуальные правила: AGENTS.md, lean-production-contract.md, course-style.md, lesson-generation-pipeline.md.
- Canonical artifact check: Документация строки 8/10/17/31; существующие файлы project/compliance сохранены. Паспорт не требует проектной стадии, manifest.projectChanges пуст.
- Источник: проверенная нормативная OMG UML 2.5.1, evidence в 02-research.
- До semantic review: заголовок, mustCover, fences, относительные ссылки и пять SVG — PASS.
- Независимое content/learning review — APPROVED. Визуально проверены пять схем; minor о повторении оговорок оставлен без rewrite.
- Практика: 7 заданий, A7 project_case; LO1–LO4 покрыты, deterministic assessment — APPROVED.
- Финализация — COMPLETED. После исправления ссылок практики все локальные Markdown-ссылки проверены уже в output — PASS.
- Проверки издательства: `node --test tests/*.test.mjs`, 35/35 PASS. Общий `node --test` захватил сгенерированные browser report.js AnalystGym с window-is-not-defined и был остановлен; к выпуску урока они не относятся.
- Автоматическая проверка отклонила необязательное удаление исследовательских временных файлов (`pdf-tools`, `pdfjs.tgz`, `extract.mjs`) с причиной `blocked by policy`. Они оставлены в run, не включены в output.
- Фактический расход — token-usage.json и token-usage.md; срез до финального ответа, input включает cached input, reasoning повторно не прибавляется к output.
