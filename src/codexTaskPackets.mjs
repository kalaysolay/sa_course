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
      role: 'Планировщик урока и исследователь',
      outputs: ['01-brief/lesson-brief-final.json', '02-research/source-pack.md'],
      inputs: ['00-input/course-context.yaml', '00-input/topic-passport.json', '00-input/source-registry-slice.json', '00-input/audience.md'],
      task: 'За один проход создать компактный Lesson Brief и карту утверждений → источники.',
      rules: [
        `Держи brief короче ${limits.lesson_brief_chars || 6000} символов, если только схема не требует обязательных полей длиннее.`,
        `Держи source pack короче ${limits.source_pack_chars || 5000} символов: фиксируй утверждения, прямые ссылки, оговорки и availability, а не пересказ источников.`,
        'Не открывай монолитную спецификацию издательства, пока перечисленных входов хватает для обязательных полей результата.'
      ]
    },
    {
      id: '02-writer',
      role: 'Автор лекции',
      outputs: ['03-lecture/draft-v1.md'],
      inputs: ['01-brief/lesson-brief-final.json', '02-research/source-pack.md', '00-input/course-style.md'],
      task: 'Написать один полный черновик лекции на русском по утверждённым компактным входам.',
      rules: [
        `Первая строка должна быть ровно: \`# Лекция ${ctx.topic.course_order}. ${ctx.topic.title}\`.`,
        'Используй source pack по ссылкам; не копируй его содержимое внутрь лекции.',
        'В конце — только прямые публичные ссылки на реально использованные источники. Никогда не ссылайся на файлы run через ../.'
      ]
    },
    {
      id: '03-lean-review',
      role: 'Lean-ревью лекции',
      outputs: ['03-lecture/review-v1/content.json', '03-lecture/review-v1/learning.json', '03-lecture/final.md'],
      inputs: ['01-brief/lesson-brief-final.json', '02-research/source-pack.md', '03-lecture/draft-v1.md', '00-input/course-style.md'],
      task: 'Прочитать лекцию один раз и вынести два вердикта: content/coverage и learning/editorial.',
      rules: [
        `Для одобренной перспективы держи её JSON короче ${limits.approved_review_chars || 600} символов.`,
        'Rewrite запускают только critical и major. Minor фиксируй без переписывания.',
        'Если нужна доработка — сохрани draft, сделай точечную следующую версию и перезапусти только упавшую перспективу.',
        'Не больше одного полного rewrite. Одобренный текст скопируй в 03-lecture/final.md.'
      ]
    },
    {
      id: '04-assessment',
      role: 'Автор практики с self-check',
      outputs: ['04-assessment/draft.json', '04-assessment/exercises.md', '04-assessment/answers.md'],
      inputs: ['01-brief/lesson-brief-final.json', '03-lecture/final.md'],
      task: 'Создать практику и в том же проходе проверить покрытие learning outcomes.',
      rules: [
        `По умолчанию не больше ${limits.assessment_default_items || 9} заданий; превышай только если brief явно требует больше.`,
        'Добавь ответы, объяснения, наблюдаемые критерии и карту покрытия LO.',
        'Не создавай отдельную semantic-ревью задачу, если детерминированные проверки схемы и покрытия проходят.'
      ]
    }
  ];

  if (requiresProjectStage(ctx.passport)) {
    stages.push({
      id: '05-project-artifacts',
      role: 'Автор проектных артефактов с self-check',
      outputs: ['05-project/project-change.json', '05-project/proposed/', '05-project/approved/'],
      inputs: ['00-input/project-state.yaml', '00-input/topic-passport.json', '01-brief/lesson-brief-final.json', '03-lecture/final.md'],
      task: 'Создать только артефакты из Topic Passport и один раз сделать self-check.',
      rules: [
        'Не плоди отдельный lesson-only артефакт, если практика уже содержит project exercise.',
        'Не меняй canonical-файлы проекта; пиши только proposed и approved внутри run.',
        'Один targeted rewrite — только при critical или major.'
      ]
    });
  }

  stages.push({
    id: '06-tracker-updater',
    role: 'Обновление трекера курса',
    outputs: ['99-package/tracker-update-report.md'],
    inputs: ['99-package/lesson-manifest.json', '99-package/payload-metrics.json'],
    task: 'После локальной финализации обновить трекер (Google Sheets или локальный xlsx) по manifest.',
    rules: ['Не читай черновики лекции, ревью, source pack или project state, пока manifest не сообщит о несоответствии.']
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
    `# Диспетчер Codex-агентов: ${ctx.topic.id}`,
    '',
    `Run: ${ctx.run.runId}`,
    `Тема: ${ctx.topic.course_order}. ${ctx.topic.title}`,
    'Режим: агенты Codex/ChatGPT app, внешний OPENAI_API_KEY не нужен.',
    '',
    '## Как работать',
    '',
    '1. Выполняй только пакеты задач ниже, строго по порядку. Не восстанавливай опущенные legacy-стадии.',
    '2. Читай только объявленные входы каждого пакета. Передавай артефакты путями к файлам, а не копированием всего текста между агентами.',
    '3. Перед semantic-ревью прогони детерминированные проверки формата/схемы. Rewrite — только на critical и major.',
    '4. Перезапускай только упавшую перспективу ревью; не больше одного полного rewrite на артефакт.',
    `5. После авторских стадий выполни \`node scripts/publisher.mjs /finalize-codex-run ${ctx.run.runId}\`.`,
    '6. Заверши пакетом трекера, опираясь на готовый manifest и payload-metrics.',
    '',
    '## Трекер курса',
    '',
    `- Таблица: ${courseTracker.spreadsheetUrl}`,
    `- Лист: ${courseTracker.sheetName}`,
    `- Ищи существующий урок по Topic ID в колонке ${courseTracker.topicIdColumn}.`,
    '- Обновляй существующую строку, не дублируй. Новую строку добавляй только если Topic ID отсутствует.',
    '- Сохраняй многострочные ячейки в `Модуль / раздел / урок` и `Артефакты`.',
    '- Если Google Drive недоступен — обнови локальный xlsx-экспорт трекера тем же правилами.',
    '',
    '## Карта задач',
    '',
    ...manifest.tasks.map(task => `- ${task.id} | ${task.role} | ${task.taskFile} -> ${task.expectedOutputs.join(', ')}`),
    '',
    '## Открытые GAP',
    '',
    ...(ctx.openGaps.length ? ctx.openGaps.map(gap => `- ${gap.id}: ${gap.type}/${gap.severity} — ${gap.description}`) : ['- нет']),
    ''
  ].join('\n');
}

function stageMarkdown(stage, ctx, courseTracker) {
  const trackerLines = stage.id === '06-tracker-updater'
    ? [
        '',
        '## Обновление трекера (Google Sheets / локальный xlsx)',
        '',
        `- Таблица: ${courseTracker.spreadsheetUrl}`,
        `- Лист: ${courseTracker.sheetName}`,
        `- Найди строку, где колонка ${courseTracker.topicIdColumn} = \`${ctx.topic.id}\`.`,
        '- Если строка есть — обнови только ячейки этого урока и связанные статусы артефактов.',
        '- Если строки нет — добавь новую в том же порядке колонок и формате.',
        '- `Лекция сгенерирована` = `Да`, если есть `03-lecture/final.md` или packaged `lecture.md`.',
        '- `Лекция отредактирована` = `Да`, если есть одобренная/финальная лекция после ревью.',
        '- Артефакты — в одной ячейке, пункты через перевод строки.',
        '- `Статус артефакта` — жизненный цикл, не да/нет: например `Не начат`, `Создан`, `Продолжен`, `Изменен`, `Не создавался в этом уроке`.',
        '- Обнови `Статус урока`, `Output` и `Run ID` по финальному состоянию run.',
        '- При необходимости синхронизируй вкладку `Документация` (`Начат`, `Где начато`) — см. `course/lesson-generation-pipeline.md`.',
        '- Запиши `99-package/tracker-update-report.md`: URL/путь таблицы, номер строки, изменённые колонки, нерешённые вопросы.',
        ''
      ]
    : [];

  return [
    `# ${stage.role}: ${ctx.topic.id}`,
    '',
    `Задача: ${stage.task}`,
    'Ожидаемые результаты:',
    ...stage.outputs.map(output => `- \`${output}\``),
    '',
    '## Жёсткие ограничения',
    '',
    '- Пиши только внутри каталога этого run.',
    '- Учебный контент для студента — на русском.',
    '- Сквозной кейс примеров и практики — проект Compliance.',
    '- Не пропускай молча отсутствующие prerequisites или source gaps; фиксируй явно.',
    '- Не открывай `docs/course-publisher-spec-v0.3.md`, пока объявленных входов хватает.',
    '',
    '## Контекст темы',
    '',
    `- Модуль: ${ctx.module.id} — ${ctx.module.title}`,
    `- Раздел: ${ctx.section.id} — ${ctx.section.title}`,
    `- Тема: ${ctx.topic.course_order}. ${ctx.topic.title} (${ctx.topic.id})`,
    '',
    '## Сначала прочитай',
    '',
    ...stage.inputs.map(input => `- \`${input}\``),
    '',
    '## Правила lean',
    '',
    ...stage.rules.map(rule => `- ${rule}`),
    ...trackerLines,
    ''
  ].join('\n');
}

export function codexTaskDir(runDir) {
  return path.join(runDir, 'codex-tasks');
}
