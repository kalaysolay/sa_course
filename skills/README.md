# Skills Course Publisher

Краткие контракты стадий. Рабочий lean-порядок задают:

- `docs/lean-production-contract.md`
- `docs/codex-native-workflow.md`
- пакеты в `runs/<runId>/codex-tasks/` (их генерирует оркестратор)

Роли агентов (человекочитаемые правила) — в `agents/*/AGENT.md`.

| Скилл | Lean-стадия |
|---|---|
| design-lesson + research-topic | `01-plan-research` |
| write-lesson / revise-lesson | `02-writer` / rewrite в `03-lean-review` |
| review-subject + review-methodology + review-editorial (+ coverage/scope) | `03-lean-review` (content + learning) |
| create-assessment / review-assessment | `04-assessment` (+ детерминированный finalize) |
| update-project-artifact / review-project-artifact | `05-project-artifacts` (если нужно) |
| assemble-lesson-package | `/finalize-codex-run` |
| resolve-next-topic / resolve-sources / register-gap / update-course-progress | оркестратор |
