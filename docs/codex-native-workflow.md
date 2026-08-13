# Codex-native course production workflow

Primary path: Codex/ChatGPT desktop app. No OPENAI_API_KEY is required.

## Commands

```powershell
node scripts\publisher.mjs /prepare-codex-next
node scripts\publisher.mjs /prepare-codex-lesson 1
node scripts\publisher.mjs /publish-lesson 1 --adapter codex
```

The command creates a run with status CODEX_TASKS_READY and writes input context plus role packets under runs/<runId>/codex-tasks/.

## Role order

1. Methodologist -> 01-brief/lesson-brief-v1.json
2. Content Critic -> 01-brief/scope-review-v1.json
3. Researcher -> 02-research/source-pack.md
4. Lecture Writer -> 03-lecture/draft-v1.md
5. Review Panel -> 03-lecture/review-v1/*.json
6. Assessment Author -> 04-assessment/draft-v1.json
7. Assessment Reviewer -> 04-assessment/review-v1.json
8. Project Artifact Author -> 05-project/proposed/
9. Project Artifact Reviewer -> 05-project/reviews/project-v1.json
10. Course Tracker Updater -> 99-package/tracker-update-report.md

Rejected artifacts produce a revision request and next draft version. Approved artifacts move forward to package validation.

## Course tracker

Every Codex-native run must finish by updating the Google Sheets course tracker:

- Spreadsheet: https://docs.google.com/spreadsheets/d/1She4DAsy9KIQ0uXdMDbTvtDsftT3BNBiorYMScyArew/edit
- Sheet: `План лекций`
- Existing rows are matched by `Topic ID` in column `H`.
- If the topic row exists, update the relevant cells for that lesson; do not append a duplicate row.
- If the topic row is missing, append it using the same column order as the existing tracker.
- `Артефакты` stays a newline-separated list inside one cell.
- `Статус артефакта` captures lifecycle details such as created, continued, changed, not started, or not used in this lesson.

## Adapter policy

Primary: Codex/ChatGPT app task packets. Test/demo: FakeAgentAdapter. Optional only: OpenAIAdapter for future headless automation when an external API key is explicitly desired.
