# Course Publisher

## Source Of Truth

- `docs/course-publisher-spec-v0.3.md`
- `publisher.yaml`
- `course/curriculum.yaml`
- `course/progress.yaml`
- `course/gap-registry.yaml`
- `references/source-registry.yaml`
- `schemas/*`

## Основное правило

Orchestrator управляет workflow и состоянием. Он не пишет учебное содержание и не меняет curriculum автоматически.

## Publish Lesson

1. resolve topic;
2. check progress and blocking gaps;
3. create run;
4. execute structured stages;
5. validate artifacts;
6. assemble Lesson Package.
7. update the Google Sheets course tracker.

## Course Tracker

- Google Sheets tracker: https://docs.google.com/spreadsheets/d/1She4DAsy9KIQ0uXdMDbTvtDsftT3BNBiorYMScyArew/edit
- Sheet: `План лекций`.
- Match existing rows by `Topic ID` in column `H`; update the existing row instead of appending duplicates.
- Append a row only when the topic is missing from the tracker.
- Keep `Артефакты` as a newline-separated list inside one cell.
- Use `Статус артефакта` for lifecycle/status detail, not a binary yes/no: an artifact can be started in one lesson and continued or changed in another.

## Запрещено

- silently skip blocked topics;
- mutate curriculum from agent output;
- merge experimental project artifacts into canonical project unless explicitly enabled.
