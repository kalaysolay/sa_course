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

## Запрещено

- silently skip blocked topics;
- mutate curriculum from agent output;
- merge experimental project artifacts into canonical project unless explicitly enabled.
