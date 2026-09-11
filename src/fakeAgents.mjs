import {
  stakeholderBrief,
  stakeholderAssessment,
  stakeholderAssessmentReview,
  stakeholderEditorialReview,
  stakeholderLecture,
  stakeholderMethodologyReview,
  stakeholderProjectArtifact,
  stakeholderProjectReview,
  stakeholderScopeIssues,
  stakeholderSubjectReview
} from './stakeholdersIteration2.mjs';

function review(verdict, reviewer, artifact, summary, issues = [], positiveNotes = []) {
  return { reviewer, artifact, verdict, summary, positiveNotes, issues };
}

export class FakeAgentAdapter {
  designLesson({ topic, module, section, passport, fixture }) {
    if (topic.id === 'REQ-STAKEHOLDERS') return stakeholderBrief({ topic, module, section, passport, fixture });
    const include = fixture === 'incomplete-brief'
      ? passport.scope.include.filter(x => !/register|реестр/i.test(x))
      : passport.scope.include;
    const learningOutcomes = topic.id === 'REQ-STAKEHOLDERS'
      ? [
          { id: 'REQ-STAKEHOLDERS-LO1', text: 'Объяснять, кто является заинтересованным лицом проекта.' },
          { id: 'REQ-STAKEHOLDERS-LO2', text: 'Выявлять основных заинтересованных лиц.' },
          { id: 'REQ-STAKEHOLDERS-LO3', text: 'Анализировать их интерес и влияние.' }
        ]
      : [{ id: `${topic.id}-LO1`, text: `Объяснять тему «${topic.title}» на базовом уровне.` }];
    return {
      topicId: topic.id,
      title: topic.title,
      moduleId: module.id,
      sectionId: section.id,
      audienceLevel: 'beginner',
      prerequisites: passport.prerequisites?.topics || [],
      learningOutcomes,
      mustCover: include,
      shouldCover: topic.id === 'REQ-STAKEHOLDERS' ? ['карта интерес/влияние', 'план коммуникации на базовом уровне'] : [],
      doNotCover: passport.scope.exclude || [],
      misconceptions: topic.id === 'REQ-STAKEHOLDERS' ? ['stakeholder — только пользователь системы', 'stakeholder — только заказчик'] : [],
      recommendedStructure: ['Зачем тема нужна аналитику', 'Ключевые понятия', 'Compliance case', 'Практическая работа', 'Итоги'],
      projectUsage: { scenario: passport.project.case, artifactsToUpdate: passport.project.expected_artifacts || [] },
      assessmentRequirements: { minKnowledgeQuestions: 3, minApplicationQuestions: 2, projectExerciseRequired: true },
      editorialRequirements: { useNarrativeOpening: true, mustContainRealisticCases: true, tablesMustHaveNarrativeExplanation: true },
      target: { videoMinutes: 45, depth: 'detailed' }
    };
  }

  scopeReview({ brief, passport, fixture }) {
    if (fixture === 'curriculum-gap') {
      return review('REJECTED', 'content-critic', '01-brief/lesson-brief-v1.json', 'Обнаружен curriculum gap.', [{
        id: 'CC-SCOPE-001',
        severity: 'major',
        category: 'curriculum_gap',
        location: 'mustCover',
        problem: 'Фундаментальная часть темы не назначена ни в текущий scope, ни в будущую тему.',
        requiredChange: 'Автору нужно уточнить curriculum.',
        gapProposal: { type: 'curriculum_gap', suggestedAction: 'Проверить разбиение темы и назначить недостающий фундаментальный блок.' }
      }]);
    }
    const issues = brief.topicId === 'REQ-STAKEHOLDERS'
      ? stakeholderScopeIssues({ brief, passport })
      : (passport.scope?.include || []).filter(item => !brief.mustCover.some(x => x.toLowerCase() === item.toLowerCase())).map((item, i) => ({
          id: `CC-SCOPE-${String(i + 1).padStart(3, '0')}`,
          severity: 'major',
          category: 'scope_gap',
          location: 'mustCover',
          problem: `В Lesson Brief отсутствует обязательный элемент: ${item}.`,
          requiredChange: `Добавить в mustCover: ${item}.`
        }));
    if (issues.length) {
      return review('REJECTED', 'content-critic', '01-brief/lesson-brief-v1.json', 'Lesson Brief не покрывает author scope.', issues);
    }
    return review('APPROVED', 'content-critic', '01-brief/lesson-brief-v1.json', 'Scope покрывает Topic Passport.', []);
  }

  research({ sources }) {
    return [
      '# Source Pack',
      '',
      '## Resolved Sources',
      '',
      ...sources.map(source => `- ${source.id} — ${source.title} — availability: ${source.availability}`),
      '',
      '## Notes',
      '',
      'Fake researcher фиксирует доступность источников и не притворяется, что missing sources прочитаны.',
      ''
    ].join('\n');
  }

  writeLecture({ brief, topic, revision = 1, fixture }) {
    if (brief.topicId === 'REQ-STAKEHOLDERS') return stakeholderLecture({ brief, topic, revision, fixture });
    const omitLast = fixture === 'incomplete-lecture' && revision === 1;
    const mustCover = omitLast ? brief.mustCover.slice(0, -1) : brief.mustCover;
    return [
      `# Лекция ${topic.course_order}. ${brief.title}`,
      '',
      '## Зачем аналитику эта тема',
      '',
      `В проекте Compliance тема «${brief.title}» нужна не ради терминов, а чтобы студент понял практический следующий шаг: с кем говорить, какие решения уточнять и какие артефакты менять.`,
      '',
      '## Ключевые понятия',
      '',
      ...mustCover.flatMap(item => [
        `### ${item}`,
        '',
        `Разбираем ${item} на простом примере сквозного проекта Compliance. Студент видит, как понятие влияет на вопросы аналитика, проектные решения и качество требований.`,
        ''
      ]),
      '## Compliance case',
      '',
      'Аналитик начинает с комплаенс-офицера, руководителя направления, сотрудников и представителей ИТ. Для каждого участника фиксируются интерес, влияние, ожидания и удобный способ взаимодействия.',
      '',
      '## Практический результат',
      '',
      'После урока студент готовит stakeholder register и объясняет, почему пользователь системы не всегда совпадает с заинтересованным лицом.',
      '',
      '## Итоги',
      '',
      'Тема связывает требования с людьми и решениями: без карты заинтересованных лиц аналитик рискует собрать удобные, но неполные требования.',
      ''
    ].join('\n');
  }

  subjectReview({ brief, lecture }) {
    if (brief.topicId === 'REQ-STAKEHOLDERS') return stakeholderSubjectReview({ brief, lecture });
    return review('APPROVED', 'subject', '03-lecture/draft.md', 'Фактологических блокеров fake reviewer не обнаружил.', []);
  }

  methodologyReview({ brief, lecture }) {
    if (brief.topicId === 'REQ-STAKEHOLDERS') return stakeholderMethodologyReview({ brief, lecture });
    return review('APPROVED', 'methodology', '03-lecture/draft.md', 'Learning outcomes связаны с практикой.', []);
  }

  editorialReview({ brief, lecture }) {
    if (brief.topicId === 'REQ-STAKEHOLDERS') return stakeholderEditorialReview({ brief, lecture });
    return review('APPROVED', 'editorial', '03-lecture/draft.md', 'Текст читается как учебная лекция, а не README.', []);
  }

  coverageReview({ brief, lecture }) {
    const lower = lecture.toLowerCase();
    const missing = brief.mustCover.filter(item => !lower.includes(item.toLowerCase()));
    if (missing.length) {
      return review('REJECTED', 'content-critic', '03-lecture/draft.md', 'Лекция не раскрывает весь approved scope.', missing.map((item, i) => ({
        id: `CC-COVERAGE-${String(i + 1).padStart(3, '0')}`,
        severity: 'major',
        category: 'coverage_gap',
        location: 'lecture',
        problem: `В лекции не раскрыт обязательный элемент: ${item}.`,
        requiredChange: `Добавить содержательное объяснение: ${item}.`
      })));
    }
    return review('APPROVED', 'content-critic', '03-lecture/draft.md', 'Все mustCover элементы присутствуют в лекции.', []);
  }

  contentReview({ brief, lecture }) {
    return mergeReviews('content', this.subjectReview({ brief, lecture }), this.coverageReview({ brief, lecture }));
  }

  learningReview({ brief, lecture }) {
    return mergeReviews('learning', this.methodologyReview({ brief, lecture }), this.editorialReview({ brief, lecture }));
  }

  createAssessment({ brief, revision = 1, fixture }) {
    if (brief.topicId === 'REQ-STAKEHOLDERS') return stakeholderAssessment({ brief, revision, fixture });
    const items = brief.learningOutcomes.map((lo, index) => ({
      id: `${brief.topicId}-Q${String(index + 1).padStart(2, '0')}`,
      type: 'single_choice',
      learningOutcomes: [lo.id],
      difficulty: 'basic',
      question: `Какой вариант лучше всего проверяет: ${lo.text}`,
      options: [
        { id: 'A', text: 'Формальный термин без связи с проектом.' },
        { id: 'B', text: 'Практическое применение в проекте Compliance.' },
        { id: 'C', text: 'Случайная техническая деталь.' },
        { id: 'D', text: 'Отказ от анализа заинтересованных лиц.' }
      ],
      correct: ['B'],
      explanation: 'Правильный ответ связывает знание с практической задачей аналитика.'
    }));
    items.push({
      id: `${brief.topicId}-P01`,
      type: 'project_case',
      learningOutcomes: brief.learningOutcomes.map(lo => lo.id),
      difficulty: 'application',
      task: 'Составить черновик stakeholder register для проекта Compliance.',
      expectedResult: 'stakeholder register'
    });
    return { topicId: brief.topicId, items };
  }

  assessmentReview({ brief, assessment }) {
    if (brief.topicId === 'REQ-STAKEHOLDERS') return stakeholderAssessmentReview({ brief, assessment });
    const covered = new Set(assessment.items.flatMap(i => i.learningOutcomes || []));
    const missing = brief.learningOutcomes.filter(lo => !covered.has(lo.id));
    if (missing.length) {
      return review('REJECTED', 'assessment', '04-assessment/draft.json', 'Не все LO покрыты assessment.', missing.map(lo => ({
        id: `ASM-${lo.id}`,
        severity: 'major',
        category: 'learning_outcome_coverage',
        location: 'items',
        problem: `${lo.id} не проверяется.`,
        requiredChange: 'Добавить вопрос или project case.'
      })));
    }
    return {
      ...review('APPROVED', 'assessment', '04-assessment/draft.json', 'Assessment покрывает все LO.', []),
      coverage: Object.fromEntries(brief.learningOutcomes.map(lo => [
        lo.id,
        assessment.items.filter(i => (i.learningOutcomes || []).includes(lo.id)).map(i => i.id)
      ]))
    };
  }

  projectChange({ brief }) {
    return {
      topicId: brief.topicId,
      changes: (brief.projectUsage.artifactsToUpdate || []).map(artifact => ({
        artifact,
        operation: 'create',
        reason: 'Практический результат урока',
        learningOutcomes: brief.learningOutcomes.map(lo => lo.id)
      }))
    };
  }

  projectArtifact({ brief, revision = 1, fixture }) {
    if (brief.topicId === 'REQ-STAKEHOLDERS') return stakeholderProjectArtifact({ brief, revision, fixture });
    return [
      '# Stakeholders',
      '',
      '## Реестр заинтересованных лиц проекта Compliance',
      '',
      '| Stakeholder | Интерес | Влияние | Как взаимодействовать |',
      '|---|---|---|---|',
      '| Комплаенс-офицер | Высокий | Высокое | Интервью и регулярное уточнение правил |',
      '| Сотрудник | Средний | Среднее | Наблюдение и короткие интервью |',
      '| Руководитель направления | Высокий | Высокое | Согласование целей и отчетности |',
      '| ИТ-команда | Средний | Высокое | Уточнение ограничений и интеграций |',
      ''
    ].join('\n');
  }

  projectReview({ brief, change, proposedArtifacts }) {
    if (brief.topicId === 'REQ-STAKEHOLDERS') return stakeholderProjectReview({ brief, change, proposedArtifacts });
    return review('APPROVED', 'project-artifact', '05-project/proposed', 'Proposed artifact соответствует уроку и остается вне canonical project.', []);
  }
}

function mergeReviews(reviewer, ...reviews) {
  const issues = reviews.flatMap(item => item.issues || []);
  return review(
    issues.some(issue => ['critical', 'major'].includes(issue.severity)) ? 'REJECTED' : 'APPROVED',
    reviewer,
    '03-lecture/draft.md',
    issues.length ? `${reviewer} review found ${issues.length} issue(s).` : `${reviewer} review passed.`,
    issues
  );
}
