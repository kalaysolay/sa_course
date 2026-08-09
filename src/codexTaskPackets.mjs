import path from 'node:path';

const STAGES = [
  {
    id: '01-methodologist',
    role: 'Methodologist',
    outputPath: '01-brief/lesson-brief-v1.json',
    task: 'Design the lesson brief from the Topic Passport and course context.'
  },
  {
    id: '02-scope-critic',
    role: 'Content Critic',
    outputPath: '01-brief/scope-review-v1.json',
    task: 'Review the lesson brief for scope, prerequisites, project fit, and curriculum gaps.'
  },
  {
    id: '03-researcher',
    role: 'Researcher',
    outputPath: '02-research/source-pack.md',
    task: 'Build a concise source pack with citations, caveats, and unavailable-source notes.'
  },
  {
    id: '04-writer',
    role: 'Lecture Writer',
    outputPath: '03-lecture/draft-v1.md',
    task: 'Write the full lecture draft using the approved brief and source pack.'
  },
  {
    id: '05-review-panel',
    role: 'Review Panel',
    outputPath: '03-lecture/review-v1/',
    task: 'Run subject, coverage, methodology, and editorial reviews as separate JSON files.'
  },
  {
    id: '06-assessment',
    role: 'Assessment Author',
    outputPath: '04-assessment/draft-v1.json',
    task: 'Create exercises, answers, rubric, and learning-outcome coverage for the lesson.'
  },
  {
    id: '07-assessment-reviewer',
    role: 'Assessment Reviewer',
    outputPath: '04-assessment/review-v1.json',
    task: 'Review assessment coverage, correctness, answer quality, and project relevance.'
  },
  {
    id: '08-project-artifacts',
    role: 'Project Artifact Author',
    outputPath: '05-project/proposed/',
    task: 'Draft Compliance project artifact changes requested by the lesson brief.'
  },
  {
    id: '09-project-reviewer',
    role: 'Project Artifact Reviewer',
    outputPath: '05-project/reviews/project-v1.json',
    task: 'Review proposed project artifacts against the lesson, case continuity, and rubric.'
  }
];

export function buildCodexTaskPackets(ctx) {
  const manifest = {
    mode: 'codex-app',
    externalApiRequired: false,
    runId: ctx.run.runId,
    topicId: ctx.topic.id,
    topicTitle: ctx.topic.title,
    courseOrder: ctx.topic.course_order,
    workflowVersion: ctx.run.workflowVersion,
    createdAt: ctx.createdAt,
    taskCount: STAGES.length,
    dispatch: 'codex-tasks/00-dispatch.md',
    tasks: STAGES.map(stage => ({
      id: stage.id,
      role: stage.role,
      taskFile: `codex-tasks/${stage.id}.md`,
      expectedOutput: stage.outputPath
    }))
  };

  const packets = [
    {
      file: '00-dispatch.md',
      content: dispatchMarkdown(ctx, manifest)
    },
    ...STAGES.map(stage => ({
      file: `${stage.id}.md`,
      content: stageMarkdown(stage, ctx)
    }))
  ];

  return { manifest, packets };
}

function dispatchMarkdown(ctx, manifest) {
  return [
    `# Codex Agent Dispatch: ${ctx.topic.id}`,
    '',
    `Run: ${ctx.run.runId}`,
    `Topic: ${ctx.topic.course_order}. ${ctx.topic.title}`,
    `Mode: Codex/ChatGPT app agents, no external OpenAI API key required.`,
    '',
    '## How to use',
    '',
    '1. Start with `01-methodologist.md` and write each expected artifact into the path named in the task packet.',
    '2. Keep every review independent: reviewers must inspect the artifact, not rewrite it silently.',
    '3. If a reviewer rejects an artifact, write a revision request beside the draft and create the next draft version.',
    '4. When all artifacts are approved, run the local validator/package step before marking the lesson complete.',
    '',
    '## Task Map',
    '',
    ...manifest.tasks.map(task => `- ${task.id} | ${task.role} | ${task.taskFile} -> ${task.expectedOutput}`),
    '',
    '## Current Open Gaps',
    '',
    ...(ctx.openGaps.length ? ctx.openGaps.map(gap => `- ${gap.id}: ${gap.type}/${gap.severity} - ${gap.description}`) : ['- none']),
    ''
  ].join('\n');
}

function stageMarkdown(stage, ctx) {
  const sourceLines = ctx.sources.length
    ? ctx.sources.map(source => `- ${source.id}: ${source.title} [${source.availability}]`)
    : ['- no sources resolved'];
  const projectArtifacts = ctx.passport.project?.artifacts || ctx.passport.projectUsage?.artifactsToUpdate || [];
  const artifactLines = projectArtifacts.length ? projectArtifacts.map(item => `- ${item}`) : ['- inspect lesson brief/project state'];

  return [
    `# ${stage.role}: ${ctx.topic.id}`,
    '',
    `Task: ${stage.task}`,
    `Expected output: \`${stage.outputPath}\``,
    '',
    '## Hard Constraints',
    '',
    '- Work inside this run directory only.',
    '- Preserve Russian language for learner-facing course content.',
    '- Use the Compliance project case as the through-line for examples and exercises.',
    '- Do not skip missing prerequisites or source gaps; record them explicitly.',
    '- Produce complete artifacts, not notes about what should be produced later.',
    '',
    '## Topic Context',
    '',
    `- Module: ${ctx.module.id} - ${ctx.module.title}`,
    `- Section: ${ctx.section.id} - ${ctx.section.title}`,
    `- Topic: ${ctx.topic.course_order}. ${ctx.topic.title} (${ctx.topic.id})`,
    `- Topic Passport: ${ctx.topic.passport}`,
    '',
    '## Expected Project Artifacts',
    '',
    ...artifactLines,
    '',
    '## Resolved Sources',
    '',
    ...sourceLines,
    '',
    '## Files To Read First',
    '',
    '- `00-input/course-context.yaml`',
    '- `00-input/topic-passport.json`',
    '- `00-input/project-state.yaml`',
    '- `00-input/source-registry-slice.json`',
    '',
    '## Quality Gate',
    '',
    'Before finishing, check that the artifact can be consumed by the next stage without hidden assumptions.',
    ''
  ].join('\n');
}

export function codexTaskDir(runDir) {
  return path.join(runDir, 'codex-tasks');
}
