import path from 'node:path';
import { expectedProjectArtifacts, requiresProjectStage } from './pipelinePolicy.mjs';

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

function buildStages(ctx) {
  const limits = ctx.optimization?.output_limits || {};
  const stages = [
    {
      id: '01-plan-research',
      role: 'Lesson Planner and Researcher',
      outputs: ['01-brief/lesson-brief-final.json', '02-research/source-pack.md'],
      inputs: ['00-input/course-context.yaml', '00-input/topic-passport.json', '00-input/source-registry-slice.json', '00-input/audience.md'],
      task: 'Create a compact lesson brief and a claim-to-source map in one pass.',
      rules: [
        `Keep the brief under ${limits.lesson_brief_chars || 6000} characters unless a schema-required field makes that impossible.`,
        `Keep the source pack under ${limits.source_pack_chars || 5000} characters; record claims, direct links, caveats, and availability instead of retelling sources.`,
        'Do not read the monolithic publisher specification unless the listed inputs leave a required output field ambiguous.'
      ]
    },
    {
      id: '02-writer',
      role: 'Lecture Writer',
      outputs: ['03-lecture/draft-v1.md'],
      inputs: ['01-brief/lesson-brief-final.json', '02-research/source-pack.md', '00-input/course-style.md'],
      task: 'Write one complete Russian lecture draft from the approved compact inputs.',
      rules: [
        `The first line must be exactly: \`# Лекция ${ctx.topic.course_order}. ${ctx.topic.title}\`.`,
        'Use the source pack by reference; do not reproduce it inside the lecture.',
        'End with direct public source links only. Never link to run-relative files with ../.'
      ]
    },
    {
      id: '03-lean-review',
      role: 'Lean Lecture Review',
      outputs: ['03-lecture/review-v1/content.json', '03-lecture/review-v1/learning.json', '03-lecture/final.md'],
      inputs: ['01-brief/lesson-brief-final.json', '02-research/source-pack.md', '03-lecture/draft-v1.md', '00-input/course-style.md'],
      task: 'Read the lecture once and review it from two perspectives: content/coverage and learning/editorial.',
      rules: [
        `For an approved perspective keep its JSON under ${limits.approved_review_chars || 600} characters.`,
        'Only critical and major issues trigger revision. Minor issues are recorded without a rewrite.',
        'If revision is required, preserve the draft, create a targeted next version, and rerun only the failed perspective.',
        'Allow at most one full rewrite. Copy the approved draft to 03-lecture/final.md.'
      ]
    },
    {
      id: '04-assessment',
      role: 'Assessment Author with Self-check',
      outputs: ['04-assessment/draft.json', '04-assessment/exercises.md', '04-assessment/answers.md'],
      inputs: ['01-brief/lesson-brief-final.json', '03-lecture/final.md'],
      task: 'Create the assessment and verify learning-outcome coverage in the same pass.',
      rules: [
        `Default to at most ${limits.assessment_default_items || 9} items; exceed this only when the brief explicitly requires more.`,
        'Include answers, explanations, observable criteria, and an LO coverage map.',
        'Do not create a separate semantic reviewer task when deterministic schema and coverage checks pass.'
      ]
    }
  ];

  if (requiresProjectStage(ctx.passport)) {
    stages.push({
      id: '05-project-artifacts',
      role: 'Project Artifact Author with Self-check',
      outputs: ['05-project/project-change.json', '05-project/proposed/', '05-project/approved/'],
      inputs: ['00-input/project-state.yaml', '00-input/topic-passport.json', '01-brief/lesson-brief-final.json', '03-lecture/final.md'],
      task: 'Create only the project artifacts explicitly required by the Topic Passport and self-check them once.',
      rules: [
        'Do not create an additional lesson-only artifact when the assessment already contains the project exercise.',
        'Do not mutate canonical project files; write proposed and approved run artifacts only.',
        'Only critical or major issues justify one targeted revision.'
      ]
    });
  }

  stages.push({
    id: '06-tracker-updater',
    role: 'Course Tracker Updater',
    outputs: ['99-package/tracker-update-report.md'],
    inputs: ['99-package/lesson-manifest.json', '99-package/payload-metrics.json'],
    task: 'After local finalization, update the Google Sheets tracker from the manifest.',
    rules: ['Read no lecture drafts, reviews, source pack, or project state unless the manifest reports an unresolved inconsistency.']
  });
  return stages;
}

export function buildCodexTaskPackets(ctx) {
  const courseTracker = normalizeCourseTracker(ctx.courseTracker);
  const stages = buildStages(ctx);
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
    optimization: {
      mode: ctx.optimization?.mode || 'lean',
      projectStageRequired: requiresProjectStage(ctx.passport),
      expectedProjectArtifacts: expectedProjectArtifacts(ctx.passport),
      rerunFailedChecksOnly: ctx.optimization?.rerun_failed_checks_only !== false
    },
    taskCount: stages.length,
    dispatch: 'codex-tasks/00-dispatch.md',
    tasks: stages.map(stage => ({
      id: stage.id,
      role: stage.role,
      taskFile: `codex-tasks/${stage.id}.md`,
      expectedOutputs: stage.outputs,
      inputFiles: stage.inputs
    }))
  };

  const packets = [
    {
      file: '00-dispatch.md',
      content: dispatchMarkdown(ctx, manifest)
    },
    ...stages.map(stage => ({
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
    '1. Execute only the task packets listed below, in order. Do not recreate omitted legacy stages.',
    '2. Read only each packet’s declared inputs. Pass artifacts by file path rather than copying their full text between agents.',
    '3. Run deterministic format/schema checks before semantic review. Only critical and major issues trigger a revision.',
    '4. Rerun only the failed review perspective and allow at most one full rewrite per artifact.',
    `5. After authoring, run \`node scripts/publisher.mjs /finalize-codex-run ${ctx.run.runId}\`.`,
    '6. Finish with the tracker packet, using the generated manifest and payload metrics.',
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
    ...manifest.tasks.map(task => `- ${task.id} | ${task.role} | ${task.taskFile} -> ${task.expectedOutputs.join(', ')}`),
    '',
    '## Current Open Gaps',
    '',
    ...(ctx.openGaps.length ? ctx.openGaps.map(gap => `- ${gap.id}: ${gap.type}/${gap.severity} - ${gap.description}`) : ['- none']),
    ''
  ].join('\n');
}

function stageMarkdown(stage, ctx, courseTracker) {
  const trackerLines = stage.id === '06-tracker-updater'
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
    : [];

  return [
    `# ${stage.role}: ${ctx.topic.id}`,
    '',
    `Task: ${stage.task}`,
    'Expected outputs:',
    ...stage.outputs.map(output => `- \`${output}\``),
    '',
    '## Hard Constraints',
    '',
    '- Write only inside this run directory.',
    '- Preserve Russian language for learner-facing course content.',
    '- Use the Compliance project case as the through-line for examples and exercises.',
    '- Do not skip missing prerequisites or source gaps; record them explicitly.',
    '- Do not load `docs/course-publisher-spec-v0.3.md` unless a declared input cannot resolve a required field.',
    '',
    '## Topic Context',
    '',
    `- Module: ${ctx.module.id} - ${ctx.module.title}`,
    `- Section: ${ctx.section.id} - ${ctx.section.title}`,
    `- Topic: ${ctx.topic.course_order}. ${ctx.topic.title} (${ctx.topic.id})`,
    '',
    '## Files To Read First',
    '',
    ...stage.inputs.map(input => `- \`${input}\``),
    '',
    '## Lean Rules',
    '',
    ...stage.rules.map(rule => `- ${rule}`),
    ...trackerLines,
    ''
  ].join('\n');
}

export function codexTaskDir(runDir) {
  return path.join(runDir, 'codex-tasks');
}
