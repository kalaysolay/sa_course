export function stakeholderBrief({ topic, module, section, passport, fixture }) {
  const mustCover = [
    'понятие stakeholder',
    'пользователь системы и stakeholder — не одно и то же',
    'внутренние и внешние stakeholders',
    'способы выявления заинтересованных лиц',
    'интерес и влияние',
    'stakeholder register',
    'выбор способа взаимодействия',
    'границы темы: RACI и политические конфликты не разбираются глубоко'
  ];
  const scopedMustCover = fixture === 'incomplete-brief'
    ? mustCover.filter(item => item !== 'stakeholder register')
    : mustCover;
  return {
    topicId: topic.id,
    title: topic.title,
    moduleId: module.id,
    sectionId: section.id,
    audienceLevel: 'beginner',
    prerequisites: [
      'Студент понимает, что требования описывают ожидаемое поведение и ограничения системы.',
      'Студент различает функциональные и нефункциональные требования.',
      'Студент видел, что требования появляются не сами по себе, а из целей, ограничений и ожиданий людей.'
    ],
    learningOutcomes: [
      {
        id: 'REQ-STAKEHOLDERS-LO1',
        text: 'Объяснять, кто является заинтересованным лицом проекта и почему stakeholder не равен пользователю системы.'
      },
      {
        id: 'REQ-STAKEHOLDERS-LO2',
        text: 'Выявлять основных внутренних и внешних заинтересованных лиц проекта Compliance.'
      },
      {
        id: 'REQ-STAKEHOLDERS-LO3',
        text: 'Анализировать интерес, влияние и подходящий способ взаимодействия со stakeholder.'
      },
      {
        id: 'REQ-STAKEHOLDERS-LO4',
        text: 'Заполнять базовый stakeholder register для учебного проекта.'
      }
    ],
    mustCover: scopedMustCover,
    shouldCover: [
      'матрица интерес/влияние как рабочий прием, а не бюрократическая классификация',
      'как не потерять тихих, но важных stakeholders',
      'как связать stakeholder register с дальнейшим выявлением требований'
    ],
    doNotCover: passport.scope.exclude,
    misconceptions: [
      'stakeholder — это только будущий пользователь системы',
      'stakeholder — это только заказчик или руководитель',
      'достаточно спросить одного самого влиятельного человека',
      'реестр заинтересованных лиц нужен ради заполнения таблицы'
    ],
    recommendedStructure: [
      'Открывающая ситуация: аналитик пришел в Compliance-проект и не знает, с кем говорить',
      'Понятие stakeholder через влияние, интерес и последствия проекта',
      'Почему пользователь системы и stakeholder не одно и то же',
      'Внутренние и внешние stakeholders в Compliance',
      'Способы выявления: документы, оргструктура, интервью, наблюдение, вопросы на встречах',
      'Интерес и влияние: как приоритизировать коммуникации',
      'Stakeholder register: минимальная структура и пример заполнения',
      'Выбор способа взаимодействия',
      'Практическое задание и связь со следующей темой'
    ],
    projectUsage: {
      scenario: passport.project.case,
      artifactsToUpdate: passport.project.expected_artifacts
    },
    assessmentRequirements: {
      minKnowledgeQuestions: 3,
      minApplicationQuestions: 2,
      projectExerciseRequired: true,
      mustCheckLearningOutcomes: ['REQ-STAKEHOLDERS-LO1', 'REQ-STAKEHOLDERS-LO2', 'REQ-STAKEHOLDERS-LO3', 'REQ-STAKEHOLDERS-LO4']
    },
    editorialRequirements: {
      useNarrativeOpening: true,
      mustContainRealisticCases: true,
      tablesMustHaveNarrativeExplanation: true,
      avoidDefinitionDump: true,
      tone: 'спокойный преподаватель-практик'
    },
    target: {
      videoMinutes: 45,
      depth: 'detailed'
    }
  };
}

export function stakeholderScopeIssues({ brief, passport }) {
  const issues = [];
  const requiredPassportItems = passport.scope.include || [];
  for (const item of requiredPassportItems) {
    const covered = brief.mustCover.some(value => value.toLowerCase().includes(item.toLowerCase()) || item.toLowerCase().includes(value.toLowerCase()));
    if (!covered) {
      issues.push({
        id: `CC-SCOPE-${String(issues.length + 1).padStart(3, '0')}`,
        severity: 'major',
        category: 'scope_gap',
        location: 'mustCover',
        problem: `В Lesson Brief отсутствует обязательный элемент из Topic Passport: ${item}.`,
        requiredChange: `Добавить в mustCover и будущую структуру лекции: ${item}.`
      });
    }
  }
  const checks = [
    {
      ok: brief.learningOutcomes?.some(lo => /stakeholder/i.test(lo.text) && /пользовател/i.test(lo.text) && /не равен|не одно и то же|отлич/i.test(lo.text)),
      category: 'learning_outcome_gap',
      problem: 'Learning Outcomes не фиксируют важное различие: пользователь системы и stakeholder — не одно и то же.',
      requiredChange: 'Добавить LO про отличие stakeholder от пользователя системы.'
    },
    {
      ok: brief.projectUsage?.artifactsToUpdate?.includes('business-analysis/stakeholders.md'),
      category: 'project_artifact_gap',
      problem: 'Brief не требует создать или обновить stakeholders.md для проекта Compliance.',
      requiredChange: 'Добавить business-analysis/stakeholders.md в projectUsage.artifactsToUpdate.'
    },
    {
      ok: brief.misconceptions?.some(item => /stakeholder/i.test(item) && /только .*пользовател/i.test(item)),
      category: 'misconception_gap',
      problem: 'Brief не предупреждает типичную ошибку: stakeholder — только пользователь системы.',
      requiredChange: 'Добавить misconception про отличие stakeholder от пользователя.'
    },
    {
      ok: brief.doNotCover?.some(item => /RACI/i.test(item)),
      category: 'scope_boundary_gap',
      problem: 'Brief не защищает урок от ухода в RACI как отдельную большую тему.',
      requiredChange: 'Добавить RACI в doNotCover или явно ограничить глубину.'
    }
  ];
  for (const check of checks) {
    if (!check.ok) {
      issues.push({
        id: `CC-SCOPE-${String(issues.length + 1).padStart(3, '0')}`,
        severity: 'major',
        category: check.category,
        location: 'lesson-brief',
        problem: check.problem,
        requiredChange: check.requiredChange
      });
    }
  }
  return issues;
}

export function stakeholderLecture({ brief, topic, revision = 1, fixture }) {
  const omitCoverage = fixture === 'incomplete-lecture' && revision === 1;
  const registerSection = omitCoverage ? [] : [
    '## Stakeholder Register: не таблица ради таблицы',
    '',
    'Stakeholder register — это рабочий артефакт аналитика: список заинтересованных лиц с кратким объяснением, почему они важны, что им нужно от проекта, насколько они влияют на решения и как с ними лучше взаимодействовать. Он помогает не держать карту проекта в голове и не зависеть от случайной памяти после встреч.',
    '',
    'Для первого уровня курса достаточно простой структуры: роль или человек, почему он stakeholder, интерес, влияние, что нужно узнать, способ взаимодействия, открытые вопросы. Не нужно начинать с тяжелых корпоративных шаблонов: начинающему аналитику важнее научиться видеть людей вокруг требований.',
    '',
    '| Stakeholder | Почему важен | Интерес | Влияние | Как взаимодействовать |',
    '|---|---|---|---|---|',
    '| Комплаенс-офицер | отвечает за правила и корректность процесса | высокий | высокое | интервью, уточнение исключений, ревью артефактов |',
    '| Сотрудник | проходит проверки и вводит данные | средний | среднее | короткие интервью, наблюдение за текущим процессом |',
    '| Руководитель направления | отвечает за прозрачность и сроки | высокий | высокое | согласование целей, демонстрация статусов |',
    '| ИТ-команда | знает ограничения систем и интеграций | средний | высокое | технические консультации, проверка реализуемости |',
    '',
    'После такой таблицы аналитик уже видит план следующего шага: с кем провести интервью, какие документы запросить, какие решения нужно согласовать и какие риски не закрыты.'
  ];
  const lecture = [
    `# Лекция ${topic.course_order}. ${brief.title}`,
    '',
    '## Первый день аналитика в Compliance-проекте',
    '',
    'Представим, что аналитика подключили к проекту автоматизации комплаенса. На первой встрече звучит простая формулировка: «Нужно автоматизировать проверки сотрудников и сделать процесс прозрачным». На первый взгляд хочется сразу спрашивать про экранные формы, статусы, уведомления и отчеты. Но если начать с интерфейсов, можно быстро собрать аккуратные, но неполные требования.',
    '',
    'Главный вопрос в начале другой: кто вообще заинтересован в этом проекте и почему? Комплаенс-офицер хочет, чтобы процесс соответствовал правилам. Руководитель хочет видеть статусы и узкие места. Сотрудники хотят не тратить лишнее время и понимать, что от них требуется. ИТ-команда думает об интеграциях и ограничениях. Юридическая служба может волноваться о формулировках и хранении данных. Все эти люди смотрят на один проект с разных сторон.',
    '',
    'Если аналитик видит только будущего пользователя системы, он слышит только часть реальности. Поэтому тема заинтересованных лиц появляется до полноценного выявления требований: сначала нужно понять, с кем говорить, чьи решения учитывать и чьи проблемы проект должен не ухудшить.',
    '',
    '## Понятие Stakeholder',
    '',
    'Stakeholder, или заинтересованное лицо, — это человек, группа или организация, которые влияют на проект, зависят от его результата или имеют значимый интерес в том, как проект будет устроен. Важно не заучить определение, а увидеть три признака: интерес, влияние и последствия.',
    '',
    'Интерес означает, что результат проекта для человека что-то меняет. Влияние означает, что человек может принимать решения, давать ограничения, блокировать или поддерживать изменения. Последствия означают, что проект меняет работу, ответственность, риски или удобство этого человека, даже если он не нажимает кнопки в будущей системе.',
    '',
    'В Compliance-проекте сотрудник может быть обычным пользователем: он заполняет форму или подтверждает сведения. Но руководитель направления может почти не пользоваться системой каждый день и все равно быть важным stakeholder, потому что ему нужны прозрачные сроки, контроль просрочек и управленческая отчетность. ИТ-архитектор может не быть бизнес-пользователем, но его ограничения по интеграциям повлияют на требования. Это и есть практический смысл темы.',
    '',
    '## Пользователь системы и stakeholder — не одно и то же',
    '',
    'Одна из самых частых ошибок начинающего аналитика — считать stakeholder только пользователем системы. Пользователь — это тот, кто непосредственно взаимодействует с продуктом. Stakeholder — более широкое понятие. Он может пользоваться системой, принимать решения о проекте, задавать правила, зависеть от отчетности, отвечать за риски или обслуживать систему после запуска.',
    '',
    'Например, комплаенс-офицер может быть пользователем, потому что заводит проверки и анализирует статусы. Сотрудник тоже пользователь, если он отвечает на запросы в системе. Но директор по рискам может входить в систему редко, зато именно он определяет, какие показатели должны быть видны в отчетах. Служба безопасности может не работать в интерфейсе каждый день, но ее требования к доступам и журналированию обязательны. Если аналитик пропустит этих людей, требования окажутся удобными для части пользователей и опасно неполными для проекта.',
    '',
    '## Внутренние и внешние stakeholders',
    '',
    'Внутренние stakeholders находятся внутри организации или проектной команды. В нашем кейсе это комплаенс-офицер, сотрудники, руководители, ИТ-команда, служба безопасности, юридическая служба, команда поддержки. Они участвуют в процессе, принимают решения или будут жить с результатом проекта после внедрения.',
    '',
    'Внешние stakeholders находятся за пределами организации, но все равно влияют на проект или зависят от него. Для учебного Compliance-кейса это могут быть регуляторы, внешние аудиторы, подрядчики, поставщики интегрируемых систем. На базовом уровне важно не углубляться в сложные governance frameworks, а научиться задавать правильный вопрос: есть ли за пределами команды кто-то, чьи правила, ожидания или проверки ограничивают систему?',
    '',
    'Разделение на внутренних и внешних нужно не ради классификации. Оно помогает не смотреть только на оргструктуру своей команды. Иногда самый важный источник требований находится не в списке будущих пользователей, а в регламенте, аудиторской проверке или внешнем нормативном ограничении.',
    '',
    '## Способы выявления заинтересованных лиц',
    '',
    'Заинтересованные лица редко приходят к аналитику полным списком. Их приходится выявлять. Первый источник — документы: устав проекта, бизнес-кейс, регламенты, описания текущего процесса, матрицы ответственности, договоры, политики безопасности. Они показывают роли, решения, согласования и зоны ответственности.',
    '',
    'Второй источник — оргструктура и процесс. Полезно пройти путь будущего процесса от начала до конца и спросить: кто инициирует проверку, кто предоставляет данные, кто принимает решение, кто получает уведомления, кто разбирает исключения, кто отвечает за сбой, кто смотрит отчет?',
    '',
    'Третий источник — интервью и рабочие встречи. На каждой встрече аналитик не только собирает требования, но и уточняет карту людей: «Кто еще участвует?», «Кто согласует это решение?», «Кого затронет изменение?», «Кто будет недоволен, если мы сделаем так?», «Кто знает исключения из правила?». Эти вопросы часто открывают stakeholders, которых не было в стартовом списке.',
    '',
    'Четвертый источник — наблюдение за текущей работой. Если комплаенс-проверки сейчас ведутся через почту и таблицы, полезно посмотреть, кто реально отправляет письма, кому пересылают спорные случаи, кто исправляет ошибки и кто вручную собирает отчетность. Реальный процесс часто богаче официального описания.',
    '',
    '## Интерес и влияние',
    '',
    'Когда список stakeholders появился, аналитик не должен одинаково глубоко работать со всеми сразу. Нужно понять интерес и влияние. Интерес показывает, насколько человеку важен результат проекта. Влияние показывает, насколько он может изменить, ускорить, заблокировать или направить проект.',
    '',
    'Высокий интерес и высокое влияние требуют регулярного контакта. Комплаенс-офицер в нашем проекте, скорее всего, относится именно сюда: он знает правила, отвечает за качество процесса и будет активно проверять результат. Руководитель направления тоже может иметь высокий интерес и влияние, если проект связан с отчетностью и сроками.',
    '',
    'Высокий интерес и низкое влияние означает, что человека сильно затронет изменение, но он не принимает ключевые решения. Сотрудник, который проходит проверки, может попасть сюда. Его нельзя игнорировать: именно он покажет неудобства текущего процесса, но формат взаимодействия будет другим — короткие интервью, наблюдение, проверка прототипа.',
    '',
    'Низкий интерес и высокое влияние тоже опасная зона. Например, ИТ-безопасность может не быть инициатором проекта, но одно обязательное ограничение по доступам изменит требования. Таких stakeholders нужно вовремя вовлекать для проверки решений, иначе проект столкнется с поздними блокерами.',
    '',
    ...registerSection,
    '',
    '## Выбор способа взаимодействия',
    '',
    'После выявления stakeholders аналитик выбирает не только кого спросить, но и как с ним работать. Для человека, который знает правила и исключения, подходит глубинное интервью. Для группы пользователей, выполняющих однотипные действия, подойдут короткие интервью, наблюдение или совместный разбор процесса. Для руководителя полезнее обсуждать цели, метрики, риски и отчетность. Для ИТ-команды — ограничения, интеграции, доступы, данные и эксплуатацию.',
    '',
    'Хороший аналитик не проводит одинаковую встречу со всеми. Он связывает формат коммуникации с ролью stakeholder. С комплаенс-офицером можно подробно пройти регламент и исключения. С сотрудником — проверить, где текущий процесс раздражает или ломается. С руководителем — согласовать, какие решения система должна сделать видимыми. С ИТ — проверить, какие данные уже есть и какие ограничения нельзя нарушить.',
    '',
    '## Границы темы',
    '',
    'Границы темы: RACI и политические конфликты не разбираются глубоко.',
    '',
    'В этой лекции мы не превращаем stakeholders в большую тему корпоративной политики. RACI может быть полезной техникой, но здесь он не становится отдельным большим блоком. Сложные enterprise governance frameworks и глубокое управление политическими конфликтами тоже остаются за рамками. Сейчас задача проще и важнее: научиться видеть заинтересованных лиц, не путать их с пользователями и собрать рабочий stakeholder register для следующего шага выявления требований.',
    '',
    '## Что меняется в проекте Compliance',
    '',
    'После этой темы в сквозном проекте появляется первый осознанный артефакт бизнес-анализа: `business-analysis/stakeholders.md`. Он фиксирует карту людей и ролей вокруг проекта. Этот файл не финальный навсегда: по мере выявления требований он будет уточняться. Но без него следующая тема — способы выявления требований — повисает в воздухе, потому что непонятно, у кого и зачем мы эти требования выявляем.',
    '',
    '## Итоги',
    '',
    'Stakeholder — это не просто красивое слово для заказчика или пользователя. Это способ аналитика увидеть социальную и организационную карту проекта. У каждого stakeholder есть интерес, влияние и причина быть в поле зрения аналитика. Если начать проект с этой карты, требования становятся не набором пожеланий, а результатом осознанной работы с людьми, решениями, ограничениями и последствиями.',
    '',
    'После лекции студент должен уметь объяснить, кто является заинтересованным лицом, найти основных stakeholders в Compliance-кейсе, оценить их интерес и влияние, выбрать способ взаимодействия и заполнить базовый stakeholder register.',
    ''
  ].join('\n');
  if (omitCoverage) return lecture.replaceAll('stakeholder register', 'реестр заинтересованных лиц');
  if (fixture === 'subject-error' && revision === 1) {
    return `${lecture}\n\nStakeholder — это только пользователь системы, поэтому остальных участников проекта можно не учитывать.\n`;
  }
  if (fixture === 'methodology-gap' && revision === 1) {
    return lecture.replace('После лекции студент должен уметь объяснить, кто является заинтересованным лицом, найти основных stakeholders в Compliance-кейсе, оценить их интерес и влияние, выбрать способ взаимодействия и заполнить базовый stakeholder register.', 'Материал завершен.');
  }
  if (fixture === 'editorial-gap' && revision === 1) {
    return [
      `# ${brief.title}`,
      '',
      '- stakeholder',
      '- users',
      '- influence',
      '- interest',
      '- register',
      '- internal',
      '- external',
      '- interviews',
      '- documents',
      '- Compliance',
      '',
      'Stakeholder register. Stakeholder. Influence. Interest.',
      ''
    ].join('\n');
  }
  return lecture;
}

function makeReview(verdict, reviewer, artifact, summary, issues = [], positiveNotes = []) {
  return { reviewer, artifact, verdict, summary, positiveNotes, issues };
}

function issue(id, severity, category, location, problem, requiredChange) {
  return { id, severity, category, location, problem, requiredChange };
}

export function stakeholderSubjectReview({ lecture }) {
  const issues = [];
  if (/stakeholder\s+—\s+это только пользователь системы/i.test(lecture)) {
    issues.push(issue(
      'SUBJ-STK-001',
      'major',
      'factual_error',
      'lecture',
      'Лекция утверждает, что stakeholder — это только пользователь системы.',
      'Исправить: stakeholder шире пользователя системы и может быть decision maker, regulator, support, security или другой затронутой ролью.'
    ));
  }
  if (/остальных участников проекта можно не учитывать/i.test(lecture)) {
    issues.push(issue(
      'SUBJ-STK-002',
      'major',
      'dangerous_simplification',
      'lecture',
      'Текст предлагает не учитывать остальных участников проекта.',
      'Показать, что пропуск stakeholders приводит к неполным требованиям и поздним блокерам.'
    ));
  }
  if (!/интерес[, ]+влияние|интерес.*влияние|влияние.*интерес/i.test(lecture)) {
    issues.push(issue(
      'SUBJ-STK-003',
      'major',
      'concept_missing',
      'lecture',
      'В лекции нет пары понятий interest/influence как основы анализа stakeholders.',
      'Добавить объяснение интереса и влияния на примере Compliance.'
    ));
  }
  return issues.length
    ? makeReview('REJECTED', 'subject', '03-lecture/draft.md', 'Есть предметные ошибки или опасные упрощения.', issues)
    : makeReview('APPROVED', 'subject', '03-lecture/draft.md', 'Предметных блокеров не обнаружено.', [], ['Корректно разведены stakeholder и пользователь системы.']);
}

export function stakeholderMethodologyReview({ brief, lecture }) {
  const checks = [
    {
      ok: /не одно и то же|не равен/i.test(lecture) && /пользователь/i.test(lecture),
      id: 'METH-STK-001',
      category: 'learning_outcome_coverage',
      problem: 'LO1 не обеспечен: студент может не увидеть различие stakeholder и пользователя.',
      requiredChange: 'Добавить явное объяснение и пример различия.'
    },
    {
      ok: /внутренние и внешние stakeholders/i.test(lecture),
      id: 'METH-STK-002',
      category: 'learning_outcome_coverage',
      problem: 'LO2 не обеспечен: нет явной рамки внутренних и внешних stakeholders.',
      requiredChange: 'Добавить раздел с внутренними и внешними stakeholders Compliance.'
    },
    {
      ok: /интерес и влияние/i.test(lecture),
      id: 'METH-STK-003',
      category: 'learning_outcome_coverage',
      problem: 'LO3 не обеспечен: не раскрыта связка интерес/влияние.',
      requiredChange: 'Добавить пошаговый разбор интереса и влияния.'
    },
    {
      ok: /Stakeholder Register|stakeholder register/i.test(lecture),
      id: 'METH-STK-004',
      category: 'learning_outcome_coverage',
      problem: 'LO4 не обеспечен: нет stakeholder register как результата практики.',
      requiredChange: 'Добавить структуру и пример stakeholder register.'
    },
    {
      ok: /После лекции студент должен/i.test(lecture),
      id: 'METH-STK-005',
      category: 'teachability',
      problem: 'В конце лекции нет явной формулировки того, что студент должен уметь после урока.',
      requiredChange: 'Добавить финальный учебный ориентир, связанный с LO.'
    }
  ];
  const issues = checks.filter(check => !check.ok).map(check => issue(
    check.id,
    'major',
    check.category,
    'lecture',
    check.problem,
    check.requiredChange
  ));
  return issues.length
    ? makeReview('REJECTED', 'methodology', '03-lecture/draft.md', 'Лекция не полностью обеспечивает обучение по заявленным LO.', issues)
    : makeReview('APPROVED', 'methodology', '03-lecture/draft.md', 'Learning outcomes обеспечены объяснениями, примерами и проектным действием.', [], ['Есть понятный переход от объяснения к project artifact.']);
}

export function stakeholderEditorialReview({ lecture }) {
  const lines = lecture.split('\n');
  const bulletLines = lines.filter(line => /^\s*[-*]\s+/.test(line)).length;
  const headingCount = lines.filter(line => /^##\s+/.test(line)).length;
  const issues = [];
  if (!/Первый день аналитика в Compliance-проекте/i.test(lecture)) {
    issues.push(issue(
      'EDIT-STK-001',
      'major',
      'narrative_opening',
      'opening',
      'Лекция не начинается с живой учебной ситуации.',
      'Добавить narrative opening про первый день аналитика в Compliance-проекте.'
    ));
  }
  if (bulletLines > 6) {
    issues.push(issue(
      'EDIT-STK-002',
      'major',
      'readability',
      'lecture',
      'Текст выглядит как список, а не как лекция для чтения или видео.',
      'Переписать ключевые фрагменты связным объяснением.'
    ));
  }
  if (headingCount < 6) {
    issues.push(issue(
      'EDIT-STK-003',
      'major',
      'structure',
      'lecture',
      'Недостаточно учебных разделов для 45-минутной лекции.',
      'Разбить материал на смысловые разделы с понятными заголовками.'
    ));
  }
  if (/\| Stakeholder \|/.test(lecture) && !/После такой таблицы аналитик/i.test(lecture)) {
    issues.push(issue(
      'EDIT-STK-004',
      'major',
      'table_without_narrative',
      'stakeholder-register',
      'Таблица есть, но нет пояснения, как студент должен ее читать и использовать.',
      'Добавить narrative explanation после таблицы.'
    ));
  }
  return issues.length
    ? makeReview('REJECTED', 'editorial', '03-lecture/draft.md', 'Редакционная форма мешает использовать материал как лекцию.', issues)
    : makeReview('APPROVED', 'editorial', '03-lecture/draft.md', 'Лекция имеет narrative opening, связный текст, структуру и пояснение таблицы.', [], ['Тон соответствует практическому вводному уроку.']);
}

export function stakeholderAssessment({ brief, revision = 1, fixture }) {
  const items = [
    {
      id: 'REQ-STAKEHOLDERS-Q01',
      type: 'single_choice',
      learningOutcomes: ['REQ-STAKEHOLDERS-LO1'],
      difficulty: 'basic',
      question: 'Кто из перечисленных участников является stakeholder проекта Compliance, даже если редко работает в интерфейсе системы?',
      options: [
        { id: 'A', text: 'Только сотрудник, который нажимает кнопки в системе.' },
        { id: 'B', text: 'Руководитель, которому нужна отчетность и прозрачность процесса.' },
        { id: 'C', text: 'Только аналитик, который пишет требования.' },
        { id: 'D', text: 'Никто, кроме будущего администратора системы.' }
      ],
      correct: ['B'],
      explanation: 'Stakeholder шире пользователя: он может влиять на проект или зависеть от результата через решения, отчетность, риски или ограничения.'
    },
    {
      id: 'REQ-STAKEHOLDERS-Q02',
      type: 'single_choice',
      learningOutcomes: ['REQ-STAKEHOLDERS-LO2'],
      difficulty: 'basic',
      question: 'Какой способ лучше всего помогает найти пропущенных stakeholders на старте проекта?',
      options: [
        { id: 'A', text: 'Спросить только инициатора проекта и больше никого не искать.' },
        { id: 'B', text: 'Пройти текущий процесс и спросить, кто инициирует, согласует, исполняет, получает отчетность и разбирает исключения.' },
        { id: 'C', text: 'Сразу проектировать экран stakeholder register.' },
        { id: 'D', text: 'Исключить внешние роли до этапа тестирования.' }
      ],
      correct: ['B'],
      explanation: 'Проход по процессу показывает реальные роли, решения, исключения и зоны ответственности.'
    },
    {
      id: 'REQ-STAKEHOLDERS-Q03',
      type: 'multiple_choice',
      learningOutcomes: ['REQ-STAKEHOLDERS-LO3'],
      difficulty: 'basic',
      question: 'Какие параметры помогают выбрать способ взаимодействия со stakeholder?',
      options: [
        { id: 'A', text: 'Интерес к результату проекта.' },
        { id: 'B', text: 'Влияние на решения, ограничения или приемку.' },
        { id: 'C', text: 'Цветовая схема будущего интерфейса.' },
        { id: 'D', text: 'Наличие у человека формальной учетной записи в системе.' }
      ],
      correct: ['A', 'B'],
      explanation: 'Интерес и влияние помогают понять глубину и частоту коммуникации.'
    },
    {
      id: 'REQ-STAKEHOLDERS-C01',
      type: 'case_analysis',
      learningOutcomes: ['REQ-STAKEHOLDERS-LO2', 'REQ-STAKEHOLDERS-LO3'],
      difficulty: 'application',
      task: 'В Compliance-проекте инициатор назвал только комплаенс-офицера. Найдите еще минимум четыре stakeholder-роли и кратко объясните их интерес и влияние.',
      expectedResult: 'Список должен включать роли вроде сотрудника, руководителя направления, ИТ-команды, службы безопасности, юридической службы, аудитора или регулятора с объяснением интереса и влияния.'
    },
    {
      id: 'REQ-STAKEHOLDERS-C02',
      type: 'communication_plan',
      learningOutcomes: ['REQ-STAKEHOLDERS-LO3'],
      difficulty: 'application',
      task: 'Для комплаенс-офицера, сотрудника и ИТ-команды выберите подходящий способ взаимодействия и объясните выбор.',
      expectedResult: 'Ответ связывает способ взаимодействия с ролью: интервью и ревью правил для комплаенс-офицера, короткие интервью или наблюдение для сотрудника, техническая консультация для ИТ.'
    },
    {
      id: 'REQ-STAKEHOLDERS-P01',
      type: 'project_case',
      learningOutcomes: ['REQ-STAKEHOLDERS-LO1', 'REQ-STAKEHOLDERS-LO2', 'REQ-STAKEHOLDERS-LO3', 'REQ-STAKEHOLDERS-LO4'],
      difficulty: 'application',
      task: 'Составьте черновик stakeholder register для проекта Compliance: роль, почему это stakeholder, интерес, влияние, что нужно выяснить, способ взаимодействия.',
      expectedResult: 'stakeholder register'
    }
  ];
  if (fixture === 'assessment-gap' && revision === 1) return { topicId: brief.topicId, items: items.filter(item => item.id !== 'REQ-STAKEHOLDERS-P01') };
  return { topicId: brief.topicId, items };
}

export function stakeholderAssessmentReview({ brief, assessment }) {
  const items = assessment.items || [];
  const covered = new Map((brief.learningOutcomes || []).map(lo => [lo.id, []]));
  for (const item of items) {
    for (const lo of item.learningOutcomes || []) {
      if (!covered.has(lo)) covered.set(lo, []);
      covered.get(lo).push(item.id);
    }
  }
  const issues = [];
  for (const lo of brief.learningOutcomes || []) {
    if (!covered.get(lo.id)?.length) {
      issues.push(issue(
        `ASM-${lo.id}`,
        'major',
        'learning_outcome_coverage',
        'items',
        `${lo.id} не проверяется assessment.`,
        'Добавить вопрос, case или project exercise, проверяющий этот LO.'
      ));
    }
  }
  const knowledgeCount = items.filter(item => ['single_choice', 'multiple_choice'].includes(item.type)).length;
  const applicationCount = items.filter(item => ['case_analysis', 'communication_plan', 'project_case'].includes(item.type)).length;
  const projectExercise = items.some(item => item.type === 'project_case' && /stakeholder register/i.test(item.expectedResult || item.task || ''));
  if (knowledgeCount < (brief.assessmentRequirements?.minKnowledgeQuestions || 0)) {
    issues.push(issue('ASM-STK-KNOWLEDGE', 'major', 'assessment_shape', 'items', 'Недостаточно knowledge questions.', 'Добавить базовые вопросы на понимание терминов и различий.'));
  }
  if (applicationCount < (brief.assessmentRequirements?.minApplicationQuestions || 0)) {
    issues.push(issue('ASM-STK-APPLICATION', 'major', 'assessment_shape', 'items', 'Недостаточно application questions.', 'Добавить case/application задания по Compliance.'));
  }
  if (brief.assessmentRequirements?.projectExerciseRequired && !projectExercise) {
    issues.push(issue('ASM-STK-PROJECT', 'major', 'project_exercise_missing', 'items', 'Нет project exercise на stakeholder register.', 'Добавить project_case, где студент создает stakeholder register.'));
  }
  const coverage = Object.fromEntries([...covered.entries()]);
  return issues.length
    ? { ...makeReview('REJECTED', 'assessment', '04-assessment/draft.json', 'Assessment не покрывает обязательные LO или форму заданий.', issues), coverage }
    : { ...makeReview('APPROVED', 'assessment', '04-assessment/draft.json', 'Assessment покрывает LO, knowledge/application баланс и project exercise.', [], ['Есть project exercise для stakeholder register.']), coverage };
}

export function stakeholderProjectArtifact({ revision = 1, fixture }) {
  if (fixture === 'project-gap' && revision === 1) {
    return [
      '# Stakeholders',
      '',
      '## Реестр заинтересованных лиц проекта Compliance',
      '',
      '| Stakeholder | Как взаимодействовать |',
      '|---|---|',
      '| Комплаенс-офицер | Интервью |',
      '| Сотрудник | Короткий опрос |',
      ''
    ].join('\n');
  }
  return [
    '# Stakeholders',
    '',
    '## Назначение артефакта',
    '',
    'Этот stakeholder register фиксирует, с кем аналитик работает в проекте автоматизации комплаенса, почему эти роли важны и какой способ взаимодействия подходит для каждой роли.',
    '',
    '## Реестр заинтересованных лиц проекта Compliance',
    '',
    '| Stakeholder | Тип | Почему это stakeholder | Интерес | Влияние | Что выяснить | Как взаимодействовать |',
    '|---|---|---|---|---|---|---|',
    '| Комплаенс-офицер | внутренний | отвечает за правила, исключения и качество процесса | высокий | высокое | правила проверок, исключения, критерии корректности | глубинное интервью, ревью требований |',
    '| Сотрудник | внутренний | проходит проверки и предоставляет сведения | средний | среднее | неудобства текущего процесса, понятность запросов | короткие интервью, наблюдение |',
    '| Руководитель направления | внутренний | отвечает за прозрачность сроков и управленческую отчетность | высокий | высокое | нужные статусы, метрики, эскалации | интервью по целям и отчетности |',
    '| ИТ-команда | внутренняя | знает ограничения систем, данных и интеграций | средний | высокое | источники данных, ограничения, интеграции, доступы | техническая консультация |',
    '| Служба безопасности | внутренняя | задает ограничения по доступам и журналированию | средний | высокое | роли доступа, аудит действий, ограничения хранения | консультация и ревью решений |',
    '| Внешний аудитор или регулятор | внешний | проверяет соответствие процесса правилам | средний | высокое | ожидаемые доказательства и отчетность | анализ документов, уточнение требований через ответственных лиц |',
    '',
    '## Открытые вопросы',
    '',
    '- Какие внешние нормативные документы обязательны для первой версии процесса?',
    '- Кто утверждает исключения из стандартной проверки?',
    '- Какие статусы должны видеть руководители и с какой периодичностью?',
    '- Какие действия пользователей должны попадать в журнал аудита?',
    '',
    '## Связь со следующими шагами',
    '',
    'Этот артефакт используется как вход для выявления требований: он показывает, у кого брать информацию, какие темы обсуждать и какие ограничения проверить до формализации требований.',
    ''
  ].join('\n');
}

export function stakeholderProjectReview({ change, proposedArtifacts }) {
  const issues = [];
  const expected = change.changes?.find(item => item.artifact === 'business-analysis/stakeholders.md');
  if (!expected) {
    issues.push(issue(
      'PROJ-STK-001',
      'major',
      'project_change_missing',
      'project-change.json',
      'Project Change не содержит business-analysis/stakeholders.md.',
      'Добавить create/update для business-analysis/stakeholders.md.'
    ));
  }
  const artifact = proposedArtifacts?.['business-analysis/stakeholders.md'] || '';
  const requiredFragments = [
    ['Комплаенс-офицер', 'missing_role'],
    ['Сотрудник', 'missing_role'],
    ['Руководитель направления', 'missing_role'],
    ['ИТ-команда', 'missing_role'],
    ['Интерес', 'missing_interest'],
    ['Влияние', 'missing_influence'],
    ['Как взаимодействовать', 'missing_communication'],
    ['Открытые вопросы', 'missing_open_questions']
  ];
  for (const [fragment, category] of requiredFragments) {
    if (!artifact.includes(fragment)) {
      issues.push(issue(
        `PROJ-STK-${String(issues.length + 2).padStart(3, '0')}`,
        'major',
        category,
        '05-project/proposed/business-analysis/stakeholders.md',
        `В proposed artifact отсутствует обязательный фрагмент: ${fragment}.`,
        `Добавить ${fragment} в stakeholders.md.`
      ));
    }
  }
  return issues.length
    ? makeReview('REJECTED', 'project-artifact', '05-project/proposed/business-analysis/stakeholders.md', 'Project artifact не соответствует уроку или expected_artifacts.', issues)
    : makeReview('APPROVED', 'project-artifact', '05-project/proposed/business-analysis/stakeholders.md', 'Project artifact соответствует уроку и остается вне canonical project.', [], ['stakeholders.md содержит роли, интерес, влияние, коммуникацию и открытые вопросы.']);
}
