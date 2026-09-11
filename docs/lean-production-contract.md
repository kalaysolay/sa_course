# Lean lesson production contract

The production goal is an approved lesson package with the smallest useful model context.

## Context rule

Each task reads only the files listed in its task packet. Pass artifacts between stages by path. Do not paste prior artifacts into dispatch messages and do not open the historical publisher specification during a normal lesson run.

## Stages

1. Plan and research: produce a compact Lesson Brief and a claim-to-source map.
2. Write: produce one complete lecture draft.
3. Review: read the lecture once and write two verdicts: `content` and `learning`.
4. Assess: author the assessment and its LO coverage self-check in one pass.
5. Project: run only when Topic Passport `project.expected_artifacts` is non-empty.
6. Finalize locally, then update the tracker from the generated manifest.

## Revision policy

- Deterministic format, link, schema, and coverage checks run before semantic review.
- Only `critical` and `major` issues trigger revision.
- `minor` and `suggestion` issues are recorded without a rewrite.
- Rerun only a failed review perspective.
- Allow at most one full rewrite per artifact in lean mode; otherwise request human review.

## Output budgets

Default limits live in `publisher.yaml`. Approved reviews contain only a verdict, a short summary, and an empty issues array. Source packs map claims to evidence instead of retelling source documents.

## Completion

Run `node scripts/publisher.mjs /finalize-codex-run <runId>`. Finalization validates the package, updates course progress, and writes `99-package/payload-metrics.json`. The tracker task reads only the manifest and metrics.
