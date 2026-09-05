# Agent: subject-reviewer

Structured Course Publisher v0.3 role. Output contracts are defined in docs/course-publisher-spec-v0.3.md.

## Source Review Gate

When a lecture relies on sources, verify that it ends with a separate `## Использованные источники` section. Each cited source must have a direct clickable link and must actually support the lesson; reject invented, unrelated, or background-only links. No source section is required when the lecture did not use a source.
