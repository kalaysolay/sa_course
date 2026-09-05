import path from 'node:path';

const DEFAULT_COURSE_TRACKER = {
  spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/1She4DAsy9KIQ0uXdMDbTvtDsftT3BNBiorYMScyArew/edit',
  spreadsheetId: '1She4DAsy9KIQ0uXdMDbTvtDsftT3BNBiorYMScyArew',
  sheetName: 'План лекций',
  topicIdColumn: 'H',
  headerRow: 4,
  dataStartRow: 5,
  columns: {
    lessonTree: 'A',
    lectureGenerated: 'B',
    lectureEdited: 'C',
    artifacts: 'D',
    artifactStatus: 'E',
    lessonStatus: 'F',
    courseOrder: 'G',
    topicId: 'H',
    output: 'I',
    runId: 'J'
  }
};

function normalizeCourseTracker(config = {}) {
  if (!config || !Object.keys(config).length) return DEFAULT_COURSE_TRACKER;
  const columns = config.columns || {};
  return {
    spreadsheetUrl: config.spreadsheetUrl || config.spreadsheet_url || DEFAULT_COURSE_TRACKER.spreadsheetUrl,
    spreadsheetId: config.spreadsheetId || config.spreadsheet_id || DEFAULT_COURSE_TRACKER.spreadsheetId,
    sheetName: config.sheetName || config.sheet_name || DEFAULT_COURSE_TRACKER.sheetName,
    topicIdColumn: config.topicIdColumn || config.topic_id_column || DEFAULT_COURSE_TRACKER.topicIdColumn,
    headerRow: config.headerRow || config.header_row || DEFAULT_COURSE_TRACKER.headerRow,
    dataStartRow: config.dataStartRow || config.data_start_row || DEFAULT_COURSE_TRACKER.dataStartRow,
    columns: {
      lessonTree: columns.lessonTree || columns.lesson_tree || DEFAULT_COURSE_TRACKER.columns.lessonTree,
      lectureGenerated: columns.lectureGenerated || columns.lecture_generated || DEFAULT_COURSE_TRACKER.columns.lectureGenerated,
      lectureEdited: columns.lectureEdited || columns.lecture_edited || DEFAULT_COURSE_TRACKER.columns.lectureEdited,
      artifacts: columns.artifacts || DEFAULT_COURSE_TRACKER.columns.artifacts,
      artifactStatus: columns.artifactStatus || columns.artifact_status || DEFAULT_COURSE_TRACKER.columns.artifactStatus,
      lessonStatus: columns.lessonStatus || columns.lesson_status || DEFAULT_COURSE_TRACKER.columns.lessonStatus,
      courseOrder: columns.courseOrder || columns.course_order || DEFAULT_COURSE_TRACKER.columns.courseOrder,
      topicId: columns.topicId || columns.topic_id || DEFAULT_COURSE_TRACKER.columns.topicId,
      output: columns.output || DEFAULT_COURSE_TRACKER.columns.output,
      runId: columns.runId || columns.run_id || DEFAULT_COURSE_TRACKER.columns.runId
    }
  };
}

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
  },
  {
    id: '10-tracker-updater',
    role: 'Course Tracker Updater',
    outputPath: '99-package/tracker-update-report.md',
    task: 'Update the Google Sheets course tracker row for this lesson, or add a row when the topic is absent.'
  }
];

export function buildCodexTaskPackets(ctx) {
  const courseTracker = normalizeCourseTracker(ctx.courseTracker);
  const manifest = {
    mode: 'codex-app',
    externalApiRequired: false,
    runId: ctx.run.runId,
    topicId: ctx.topic.id,
    topicTitle: ctx.topic.title,
    courseOrder: ctx.topic.course_order,
    workflowVersion: ctx.run.workflowVersion,
    createdAt: ctx.createdAt,
    courseTracker,
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
      content: stageMarkdown(stage, ctx, courseTracker)
    }))
  ];

  return { manifest, packets };
}

function dispatchMarkdown(ctx, manifest) {
  const courseTracker = manifest.courseTracker;
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
    '5. Finish with `10-tracker-updater.md`: update the Google Sheets tracker row for this Topic ID, or add the row if it is missing.',
    '',
    '## Course Tracker',
    '',
    `- Spreadsheet: ${courseTracker.spreadsheetUrl}`,
    `- Sheet: ${courseTracker.sheetName}`,
    `- Match existing lessons by Topic ID in column ${courseTracker.topicIdColumn}.`,
    '- Update the existing row instead of appending a duplicate. Append only when the Topic ID is absent.',
    '- Preserve multiline cells in `Модуль / раздел / урок` and `Артефакты`.',
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

function stageMarkdown(stage, ctx, courseTracker) {
  const sourceLines = ctx.sources.length
    ? ctx.sources.map(source => `- ${source.id}: ${source.title} [${source.availability}]`)
    : ['- no sources resolved'];
  const projectArtifacts = ctx.passport.project?.artifacts || ctx.passport.projectUsage?.artifactsToUpdate || [];
  const artifactLines = projectArtifacts.length ? projectArtifacts.map(item => `- ${item}`) : ['- inspect lesson brief/project state'];
  const writerEditorialLines = stage.id === '04-writer'
    ? [
        `- The first line of the lecture is mandatory and must be exactly: \`# Лекция ${ctx.topic.course_order}. ${ctx.topic.title}\`. Do not replace it with an editorial or marketing-style title.`,
        '- Write a coherent lecture, not a README or slide outline: paragraphs and one continuing scenario are the default.',
        '- Use bullets only for independent items, compact checklists, or the final recap; never replace explanation with a table or list.',
        '- When a technical abstraction is difficult, use a relevant analogy if it helps; state where that analogy stops being accurate.',
        '- Start from a familiar situation and explain the purpose before introducing the term.'
      ]
    : [];

  const trackerLines = stage.id === '10-tracker-updater'
    ? [
        '',
        '## Google Sheets Tracker Update',
        '',
        `- Spreadsheet: ${courseTracker.spreadsheetUrl}`,
        `- Sheet: ${courseTracker.sheetName}`,
        `- Locate the row where column ${courseTracker.topicIdColumn} equals \`${ctx.topic.id}\`.`,
        '- If the row exists, update only the cells for this lesson and any related artifact-status cells that changed.',
        '- If the row does not exist, append a new row using the same column order and formatting as existing rows.',
        '- Set `Лекция сгенерирована` to `Да` when `03-lecture/final.md` or packaged `lecture.md` exists.',
        '- Set `Лекция отредактирована` to `Да` when the approved/final lecture exists after review.',
        '- Put artifacts in one cell with newline-separated entries.',
        '- Use `Статус артефакта` for artifact lifecycle, not a binary yes/no: examples are `Не начат`, `Создан`, `Продолжен`, `Изменен`, `Не создавался в этом уроке`, or a concise path-specific status.',
        '- Update `Статус урока`, `Output`, and `Run ID` from the final run state.',
        '- Write `99-package/tracker-update-report.md` with the spreadsheet URL, row number, changed columns, and any unresolved issue.',
        ''
      ]
    : [
        '',
        '## Course Tracker Note',
        '',
        `- The final tracker owner is \`10-tracker-updater.md\`, which updates ${courseTracker.spreadsheetUrl}.`,
        '- If this stage creates or changes artifacts, leave enough evidence in its expected output for the tracker updater to update columns D/E accurately.',
        ''
      ];

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
    ...writerEditorialLines,
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
    ...trackerLines,
    ''
  ].join('\n');
}

export function codexTaskDir(runDir) {
  return path.join(runDir, 'codex-tasks');
}
