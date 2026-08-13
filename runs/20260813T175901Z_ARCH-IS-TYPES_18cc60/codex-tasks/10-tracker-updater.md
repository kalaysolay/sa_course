# Course Tracker Updater: ARCH-IS-TYPES

Task: Update the Google Sheets course tracker row for this lesson, or add a row when the topic is absent.
Expected output: `99-package/tracker-update-report.md`

## Hard Constraints

- Work inside this run directory only.
- Preserve Russian language for learner-facing course content.
- Use the Compliance project case as the through-line for examples and exercises.
- Do not skip missing prerequisites or source gaps; record them explicitly.
- Produce complete artifacts, not notes about what should be produced later.

## Topic Context

- Module: M05 - Архитектура информационных систем
- Section: M05-S01 - Что такое информационная система
- Topic: 23. Различные типы ИС: веб, десктоп, мобильные (ARCH-IS-TYPES)
- Topic Passport: course/modules/M05-architecture/sections/S01-information-systems/topics/is-types.yaml

## Expected Project Artifacts

- inspect lesson brief/project state

## Resolved Sources

- SRC-AUTHOR-MATERIALS: Авторские материалы курса [available]

## Files To Read First

- `00-input/course-context.yaml`
- `00-input/topic-passport.json`
- `00-input/project-state.yaml`
- `00-input/source-registry-slice.json`

## Quality Gate

Before finishing, check that the artifact can be consumed by the next stage without hidden assumptions.

## Google Sheets Tracker Update

- Spreadsheet: https://docs.google.com/spreadsheets/d/1She4DAsy9KIQ0uXdMDbTvtDsftT3BNBiorYMScyArew/edit
- Sheet: План лекций
- Locate the row where column H equals `ARCH-IS-TYPES`.
- If the row exists, update only the cells for this lesson and any related artifact-status cells that changed.
- If the row does not exist, append a new row using the same column order and formatting as existing rows.
- Set `Лекция сгенерирована` to `Да` when `03-lecture/final.md` or packaged `lecture.md` exists.
- Set `Лекция отредактирована` to `Да` when the approved/final lecture exists after review.
- Put artifacts in one cell with newline-separated entries.
- Use `Статус артефакта` for artifact lifecycle, not a binary yes/no: examples are `Не начат`, `Создан`, `Продолжен`, `Изменен`, `Не создавался в этом уроке`, or a concise path-specific status.
- Update `Статус урока`, `Output`, and `Run ID` from the final run state.
- Write `99-package/tracker-update-report.md` with the spreadsheet URL, row number, changed columns, and any unresolved issue.

