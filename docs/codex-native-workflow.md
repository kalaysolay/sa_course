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

Rejected artifacts produce a revision request and next draft version. Approved artifacts move forward to package validation.

## Adapter policy

Primary: Codex/ChatGPT app task packets. Test/demo: FakeAgentAdapter. Optional only: OpenAIAdapter for future headless automation when an external API key is explicitly desired.
