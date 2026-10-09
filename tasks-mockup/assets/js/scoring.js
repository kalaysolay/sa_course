/* ============================================================
   scoring.js — подсчёт результатов диагностики
   Один и тот же код используют assessment.js и results.js,
   чтобы результат не «разъезжался» между экранами.
   ============================================================ */

window.Scoring = (function () {

  /* Компетенция → метки задач: по ним строим план прокачки */
  const COMPETENCY_TAGS = {
    requirements: ['requirements', 'user-story', 'acceptance', 'use-case', 'edge-cases', 'nfr'],
    integrations: ['integrations', 'rest-api', 'soap', 'api-design', 'idempotency', 'retry', 'async', 'kafka', 'oauth', 'versioning'],
    data: ['sql', 'db-design', 'normalization', 'indexes', 'transactions', 'migration', 'dwh'],
    architecture: ['architecture', 'system-design', 'microservices', 'saga', 'ddd', 'cache', 'reliability'],
    modeling: ['uml', 'sequence', 'bpmn', 'er', 'state', 'component'],
    process: ['stakeholders', 'conflict', 'agile', 'estimation', 'discovery'],
    quality: ['nfr', 'testing', 'data-quality', 'observability', 'release', 'docs', 'reliability']
  };

  const LEVEL_BY_GRADE = {
    intern: 'easy',
    junior: 'easy',
    middle: 'medium',
    senior: 'hard',
    lead: 'hard'
  };

  function tierFor(pct) {
    if (pct >= 80) return 'strong';
    if (pct >= 60) return 'ok';
    if (pct >= 40) return 'weak';
    return 'bad';
  }

  function tierLabel(tier) {
    return {
      strong: 'Сильная зона — можно брать задачи уровня выше',
      ok: 'Рабочий уровень, есть что отшлифовать',
      weak: 'Заметный пробел — здесь чаще всего «валят» на собеседовании',
      bad: 'Критичный пробел — начать стоит отсюда'
    }[tier] || '';
  }

  /**
   * answers: { questionId: выбранныйИндекс }
   * Возвращает готовый объект результата.
   */
  function compute(answers) {
    const questions = (window.SA_DATA.questions || []);
    const competencies = (window.SA_DATA.competencies || []);
    const answered = questions.filter((q) => answers[q.id] !== undefined && answers[q.id] !== null);

    /* --- по компетенциям --- */
    const byCompetency = competencies.map((competency) => {
      const items = questions.filter((q) => q.competency === competency.id);
      const answeredItems = items.filter((q) => answers[q.id] !== undefined && answers[q.id] !== null);
      let earned = 0;
      let total = 0;
      let correct = 0;
      answeredItems.forEach((q) => {
        total += q.difficulty;
        if (answers[q.id] === q.answer) {
          earned += q.difficulty;
          correct += 1;
        }
      });
      const pct = total ? Math.round((earned / total) * 100) : null;
      const tier = pct === null ? null : tierFor(pct);
      return {
        id: competency.id,
        name: competency.name,
        icon: competency.icon,
        short: competency.short,
        total: items.length,
        answered: answeredItems.length,
        correct,
        pct,
        tier,
        tierLabel: tier ? tierLabel(tier) : 'Нет ответов'
      };
    });

    /* --- общий балл: взвешенно по сложности вопроса --- */
    let earned = 0;
    let total = 0;
    let correctCount = 0;
    answered.forEach((q) => {
      total += q.difficulty;
      if (answers[q.id] === q.answer) {
        earned += q.difficulty;
        correctCount += 1;
      }
    });

    /* пропуск ответа штрафуется мягко: считаем от числа отвеченных,
       но показываем долю от всего теста — иначе можно «угадать уровень» пропусками */
    const answeredShare = questions.length ? answered.length / questions.length : 0;
    const rawPct = total ? earned / total : 0;
    const score = Math.round(rawPct * answeredShare * 100 * 10) / 10;
    const scoreRounded = Math.round(score);

    const grades = (window.SA_DATA.grades || []).slice().sort((a, b) => a.min - b.min);
    const grade = grades.find((g) => scoreRounded >= g.min && scoreRounded <= g.max) || grades[grades.length - 1];

    /* --- сильные зоны и пробелы --- */
    const measured = byCompetency.filter((c) => c.pct !== null);
    const sorted = measured.slice().sort((a, b) => b.pct - a.pct);
    const strengths = sorted.filter((c) => c.pct >= 70).slice(0, 3);
    const gaps = sorted.filter((c) => c.pct < 70).slice().reverse().slice(0, 3);

    /* --- детальный разбор ответов --- */
    const detail = questions.map((q) => {
      const chosen = answers[q.id];
      const answeredFlag = chosen !== undefined && chosen !== null;
      return {
        id: q.id,
        competency: q.competency,
        difficulty: q.difficulty,
        question: q.question,
        options: q.options,
        answer: q.answer,
        chosen: answeredFlag ? chosen : null,
        answered: answeredFlag,
        correct: answeredFlag && chosen === q.answer,
        explain: q.explain
      };
    });

    return {
      score,
      scoreRounded,
      grade,
      answeredCount: answered.length,
      questionsCount: questions.length,
      correctCount,
      byCompetency,
      strengths,
      gaps,
      weakest: sorted.length ? sorted[sorted.length - 1] : null,
      strongest: sorted.length ? sorted[0] : null,
      detail
    };
  }

  /** Задачи под пробелы: сначала непокрытые компетенции, затем уровень под грейд */
  function buildPlan(result, limit) {
    const max = limit || 4;
    const gapIds = (result.gaps || []).map((g) => g.id);
    if (!gapIds.length && result.weakest) gapIds.push(result.weakest.id);

    const targetTags = [];
    gapIds.forEach((id) => {
      (COMPETENCY_TAGS[id] || []).forEach((tag) => {
        if (!targetTags.includes(tag)) targetTags.push(tag);
      });
    });

    const targetLevel = LEVEL_BY_GRADE[result.grade.id] || 'medium';
    const levelRank = { easy: 1, medium: 2, hard: 3 };
    const targetRank = levelRank[targetLevel] || 2;

    const tasks = (window.SA_DATA.tasks || []).map((task) => {
      const overlap = (task.tags || []).filter((t) => targetTags.includes(t)).length;
      const done = window.Store && window.Store.status(task.id) === 'reviewed';
      const levelDistance = Math.abs((levelRank[task.level] || 2) - targetRank);
      return {
        task,
        overlap,
        done,
        levelDistance,
        score: overlap * 10 - levelDistance * 2 - (done ? 25 : 0)
      };
    }).filter((item) => item.overlap > 0)
      .sort((a, b) => b.score - a.score);

    return tasks.slice(0, max).map((item, index) => ({
      n: index + 1,
      id: item.task.id,
      title: item.task.title,
      level: item.task.level,
      tags: (item.task.tags || []).filter((t) => targetTags.includes(t)).slice(0, 4),
      reason: gapIds
        .map((id) => (window.SA_DATA.competencies.find((c) => c.id === id) || {}).name)
        .filter(Boolean)
        .slice(0, 2)
        .join(', '),
      done: item.done
    }));
  }

  /** Короткая текстовая интерпретация для карточки результата */
  function narrative(result) {
    const strongest = result.strongest;
    const weakest = result.weakest;
    const parts = [];

    if (result.answeredCount < result.questionsCount) {
      parts.push(`Отвечено ${result.answeredCount} из ${result.questionsCount} — итог посчитан с учётом пропусков, поэтому лучше пройти тест целиком.`);
    }

    if (strongest && strongest.pct >= 70) {
      parts.push(`Опора — «${strongest.name}» (${strongest.pct}%). Здесь вы отвечаете уверенно, на собеседовании это ваша зона контроля.`);
    } else {
      parts.push('Ярко выраженной сильной зоны пока нет: стоит начать с базовых блоков, иначе ответы будут звучать неуверенно во всех темах.');
    }

    if (weakest && weakest.pct < 60) {
      parts.push(`Главный пробел — «${weakest.name}» (${weakest.pct}%). Именно на таких вопросах кандидаты теряют оффер: тема звучит в 80% технических экранов.`);
    }

    const grade = result.grade;
    parts.push(`Итоговый профиль — ${grade.title}: ${grade.note}`);

    return parts;
  }

  /** Сравнение «как это видит работодатель» — для продающего блока результата */
  function marketView(result) {
    const score = result.scoreRounded;
    if (score >= 85) return { label: 'Профиль уровня Senior/Lead', note: 'Таких кандидатов мало: обычно оффер делают после одного технического экрана. Ваша задача на собеседовании — не потерять баллы на коммуникации.' };
    if (score >= 70) return { label: 'Уверенный Middle+', note: 'Вы проходите фильтры большинства вакансий. Решает не база, а глубина: расхождения начинаются на вопросах «а что если откажет».' };
    if (score >= 55) return { label: 'Middle с пробелами', note: 'Типичная картина: сильные требования и процессы, слабые интеграции или архитектура. Оффер реален, но технический экран будет пограничным.' };
    if (score >= 35) return { label: 'Junior+', note: 'Базу видно, но на самостоятельную роль пока не хватает. Хорошая новость: пробелы точечные и закрываются за 4–8 недель практики.' };
    return { label: 'Старт', note: 'Знаний пока недостаточно для самостоятельных задач. Начните с подборок «лёгкого» уровня и диагностики раз в две недели — прогресс будет заметен быстро.' };
  }

  return { compute, buildPlan, narrative, marketView, tierFor, tierLabel, COMPETENCY_TAGS };
})();
