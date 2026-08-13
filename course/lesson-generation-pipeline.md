# Lesson generation pipeline

This file defines mandatory checks for every generated lesson package.

## Analyst artifact check

Before generating a lesson, check whether the lesson must create or update a canonical analyst artifact.

Use these rules:

1. Look up the lesson in the Google Sheet tracker:
   - tab: `Документация`
   - columns: `В каком модуле начинаем`, `Урок(и)`, `Начат`, `Где начато`
2. For each matching artifact, decide one of four outcomes:
   - no analyst artifact is required for this lesson;
   - create a new canonical analyst artifact;
   - update an existing canonical analyst artifact;
   - create only a lesson example or solution, without changing canonical project documentation.
3. Canonical analyst artifacts must live under `project/compliance/...`.
4. Files under `output/.../project/solution/...` are lesson materials or reference solutions. Do not use them as the `Где начато` value in `Документация`.
5. If a canonical artifact is created or updated, the lesson package must record it in:
   - `lesson-manifest.json`;
   - the `Артефакты` column in `План лекций`;
   - the `Статус артефакта` column in `План лекций`;
   - the corresponding row in `Документация`.
6. If the lesson creates only a sample artifact inside the lesson package, mark this explicitly as a lesson-package artifact and keep the canonical documentation row unchanged.

## Required documentation update after generation

After every lesson generation:

1. Update `План лекций`.
2. Update `Документация` when a canonical analyst artifact starts or changes:
   - set `Начат` to `Да` only when a canonical file exists under `project/compliance/...`;
   - set `Где начато` to the canonical path;
   - keep `Где начато` empty for lesson-only examples;
   - update `Урок(и)` when a new lesson becomes responsible for creating or continuing the artifact.
3. If an artifact is planned but not yet created, keep `Начат = Нет` and use `Урок(и)` to show the planned lesson.

