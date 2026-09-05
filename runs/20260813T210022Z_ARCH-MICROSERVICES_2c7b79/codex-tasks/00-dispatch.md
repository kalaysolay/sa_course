# Codex Agent Dispatch: ARCH-MICROSERVICES

Run: 20260813T210022Z_ARCH-MICROSERVICES_2c7b79
Topic: 27. Микросервисы
Mode: Codex/ChatGPT app agents, no external OpenAI API key required.

## How to use

1. Start with `01-methodologist.md` and write each expected artifact into the path named in the task packet.
2. Keep every review independent: reviewers must inspect the artifact, not rewrite it silently.
3. If a reviewer rejects an artifact, write a revision request beside the draft and create the next draft version.
4. When all artifacts are approved, run the local validator/package step before marking the lesson complete.
5. Finish with `10-tracker-updater.md`: update the Google Sheets tracker row for this Topic ID, or add the row if it is missing.

## Course Tracker

- Spreadsheet: https://docs.google.com/spreadsheets/d/1She4DAsy9KIQ0uXdMDbTvtDsftT3BNBiorYMScyArew/edit
- Sheet: План лекций
- Match existing lessons by Topic ID in column H.
- Update the existing row instead of appending a duplicate. Append only when the Topic ID is absent.
- Preserve multiline cells in `Модуль / раздел / урок` and `Артефакты`.

## Task Map

- 01-methodologist | Methodologist | codex-tasks/01-methodologist.md -> 01-brief/lesson-brief-v1.json
- 02-scope-critic | Content Critic | codex-tasks/02-scope-critic.md -> 01-brief/scope-review-v1.json
- 03-researcher | Researcher | codex-tasks/03-researcher.md -> 02-research/source-pack.md
- 04-writer | Lecture Writer | codex-tasks/04-writer.md -> 03-lecture/draft-v1.md
- 05-review-panel | Review Panel | codex-tasks/05-review-panel.md -> 03-lecture/review-v1/
- 06-assessment | Assessment Author | codex-tasks/06-assessment.md -> 04-assessment/draft-v1.json
- 07-assessment-reviewer | Assessment Reviewer | codex-tasks/07-assessment-reviewer.md -> 04-assessment/review-v1.json
- 08-project-artifacts | Project Artifact Author | codex-tasks/08-project-artifacts.md -> 05-project/proposed/
- 09-project-reviewer | Project Artifact Reviewer | codex-tasks/09-project-reviewer.md -> 05-project/reviews/project-v1.json
- 10-tracker-updater | Course Tracker Updater | codex-tasks/10-tracker-updater.md -> 99-package/tracker-update-report.md

## Current Open Gaps

- none
