# Скилл: собрать пакет урока (assemble-lesson-package)

## Назначение

В lean-режиме сборку делает оркестратор командой:

```powershell
node scripts/publisher.mjs /finalize-codex-run <runId>
```

## Что проверяется

- наличие brief, source-pack, final lecture, assessment, exercises/answers;
- схемы brief/assessment/manifest;
- формат заголовка лекции и package format;
- одобренные вердикты `content` и `learning`;
- project-change, если passport требует артефакты.

## Результат

- `output/<module>/<topic>/` — lecture, exercises, answers, sources, project, lesson-manifest;
- обновление `course/progress.yaml`;
- `99-package/payload-metrics.json`.
