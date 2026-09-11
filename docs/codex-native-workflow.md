# Codex-native course production workflow

Primary path: Codex/ChatGPT desktop app. No OPENAI_API_KEY is required.

## Commands

```powershell
node scripts\publisher.mjs /prepare-codex-next
node scripts\publisher.mjs /prepare-codex-lesson 1
node scripts\publisher.mjs /publish-lesson 1 --adapter codex
```

The command creates a run with status CODEX_TASKS_READY and writes input context plus role packets under runs/<runId>/codex-tasks/.

## Lean role order

1. Planner + Researcher -> compact brief and source claim map.
2. Lecture Writer -> one complete lecture draft.
3. Lean Review -> two verdicts from one read: content/coverage and learning/editorial.
4. Assessment Author -> assessment plus LO coverage self-check.
5. Project Artifact Author -> only when Topic Passport declares expected artifacts.
6. Course Tracker Updater -> reads the finalized manifest and payload metrics only.

Run deterministic finalization before the tracker task:

```powershell
node scripts\publisher.mjs /finalize-codex-run <runId>
```

Format, relative-link, schema, and assessment-coverage checks run locally. Only critical and major issues trigger revision. Rerun only the failed perspective, and allow at most one full rewrite in lean mode.

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
