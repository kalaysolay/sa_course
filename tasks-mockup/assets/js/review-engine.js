/* ============================================================
   review-engine.js — ревью решения двумя ИИ-агентами
   Агент 1: системный аналитик (полнота, сценарии, бизнес-смысл)
   Агент 2: архитектор/разработчик (реализуемость, данные, надёжность)

   В макете агенты работают детерминированно: сверяют текст решения
   с рубрикой задачи, ищут подтверждения и формируют замечания.
   В продукте на этом месте — LLM-вызов с той же структурой промпта
   и тем же контрактом ответа (ReviewResult), поэтому замена локальная.
   ============================================================ */

(function () {

  /* ---------- утилиты текста ---------- */

  function normalize(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/ё/g, 'е')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function plainFromHtml(html) {
    return String(html || '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function sentencesOf(text) {
    return String(text || '')
      .replace(/\s+/g, ' ')
      .split(/[.!?;\n]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 12);
  }

  function countWords(text) {
    const words = String(text || '').trim().split(/\s+/).filter(Boolean);
    return words.length;
  }

  function truncate(text, max) {
    const value = String(text || '').trim();
    if (value.length <= max) return value;
    return value.slice(0, max - 1).replace(/[,;:\s][^,;:\s]*$/, '') + '…';
  }

  function pick(list, count, offset) {
    const source = Array.isArray(list) ? list.slice() : [];
    const start = (offset || 0) % Math.max(source.length, 1);
    const result = [];
    for (let i = 0; i < source.length && result.length < count; i += 1) {
      result.push(source[(start + i) % source.length]);
    }
    return result;
  }

  /* ---------- извлечение содержимого решения ---------- */

  function collectSolution(tabs) {
    const list = Array.isArray(tabs) ? tabs : [];
    const docParts = [];
    const diagramParts = [];

    list.forEach((tab) => {
      const content = tab && tab.content ? tab.content : '';
      if (!content.trim()) return;
      if (tab.type === 'doc') {
        docParts.push(plainFromHtml(content));
      } else {
        diagramParts.push(content);
      }
    });

    const docText = docParts.join('\n');
    const diagramText = diagramParts.join('\n');
    const fullText = [docText, diagramText].join('\n');
    const normalized = normalize(fullText);
    const docNormalized = normalize(docText);

    return {
      tabs: list,
      docText,
      diagramText,
      fullText,
      normalized,
      docNormalized,
      words: countWords(docText),
      totalChars: fullText.length,
      docTabs: list.filter((t) => t.type === 'doc' && (t.content || '').trim()).length,
      diagramTabs: list.filter((t) => t.type !== 'doc' && (t.content || '').trim()).length,
      headings: (docText.match(/^.{0,80}$/gm) || []).length,
      htmlHeadings: (String(list.filter((t) => t.type === 'doc').map((t) => t.content).join('')).match(/<h[1-6]/gi) || []).length,
      listItems: (String(list.filter((t) => t.type === 'doc').map((t) => t.content).join('')).match(/<li/gi) || []).length
    };
  }

  /* ---------- проверка критерия рубрики ---------- */

  function evaluateCriterion(criterion, solution) {
    const keywords = (criterion.keywords || []).map((k) => normalize(k)).filter(Boolean);
    const haystacks = [solution.normalized, solution.docNormalized];
    const matched = [];

    keywords.forEach((keyword) => {
      if (matched.includes(keyword)) return;
      const found = haystacks.some((hay) => hay && hay.includes(keyword));
      if (found) matched.push(keyword);
    });

    let state = 'miss';
    if (matched.length >= 2) state = 'hit';
    else if (matched.length === 1) state = 'partial';

    let evidence = '';
    if (matched.length) {
      const sentences = sentencesOf(solution.docText || solution.fullText);
      const sentence = sentences.find((s) => {
        const normalizedSentence = normalize(s);
        return matched.some((keyword) => normalizedSentence.includes(keyword));
      });
      evidence = sentence ? truncate(sentence, 170) : '';
    }

    return {
      id: criterion.id,
      title: criterion.title,
      weight: criterion.weight || 'mid',
      weightValue: criterion.weightValue,
      focus: criterion.focus || 'sa',
      why: criterion.why || '',
      state,
      matched,
      evidence
    };
  }

  const WEIGHTS = { high: 3, mid: 2, low: 1 };
  const STATE_POINTS = { hit: 1, partial: 0.55, miss: 0 };

  function coverageOf(results) {
    let earned = 0;
    let total = 0;
    results.forEach((item) => {
      /* Числовой вес 1–10 из админки; иначе legacy high/mid/low */
      const weight = (typeof item.weightValue === 'number' && item.weightValue >= 1 && item.weightValue <= 10)
        ? item.weightValue
        : (WEIGHTS[item.weight] || 2);
      total += weight;
      earned += weight * (STATE_POINTS[item.state] || 0);
    });
    if (!total) return 0;
    return earned / total;
  }

  /* ---------- структурные сигналы (что видит агент сверх рубрики) ---------- */

  function collectSignals(solution) {
    const text = solution.normalized;
    const has = (list) => list.some((k) => text.includes(normalize(k)));

    return {
      numbers: /\d/.test(text) && has(['сек', 'мин', 'час', '%', 'млн', 'тыс', 'rps', 'мс', 'дн', 'строк', 'руб']),
      alternatives: has(['альтернативн', 'если не', 'в случае', 'отказ', 'ошибк', 'граничн', 'не прошел', 'не прошёл', 'fallback', 'деград']),
      structure: solution.htmlHeadings >= 2 || solution.listItems >= 4,
      diagram: solution.diagramTabs > 0 && solution.diagramText.trim().length > 60,
      validation: has(['сверк', 'провер', 'валидац', 'тест', 'критер', 'приемк', 'приёмк', 'reconcil']),
      risks: has(['риск', 'откат', 'rollback', 'деградац', 'точка невозврата', 'план б']),
      people: has(['стейкхолдер', 'заказчик', 'согласов', 'владел', 'бизнес', 'поддержк', 'пользовател']),
      metrics: has(['метрик', 'kpi', 'p95', 'p99', 'мониторинг', 'алерт', 'dash', 'дашборд']),
      tooShort: solution.words < 80,
      empty: solution.totalChars < 40
    };
  }

  /* ---------- шкала качества (не «верно/неверно», а «насколько хорошее решение») ---------- */

  const GRADES = [
    { code: 1, min: 0, label: 'Задача не решена', tone: 'bad', headline: 'Решение не отвечает задаче' },
    { code: 2, min: 26, label: 'Слабое решение', tone: 'bad', headline: 'Ключевые аспекты задачи не раскрыты' },
    { code: 3, min: 46, label: 'Решение с пробелами', tone: 'warn', headline: 'Направление верное, но решение неполное' },
    { code: 4, min: 66, label: 'Хорошее решение', tone: 'ok', headline: 'Решение рабочее, есть что усилить' },
    { code: 5, min: 85, label: 'Сильное решение', tone: 'accent', headline: 'Решение уровня уверенного сеньора' }
  ];

  function gradeFor(score) {
    let current = GRADES[0];
    GRADES.forEach((grade) => { if (score >= grade.min) current = grade; });
    return current;
  }

  const AGENTS = {
    sa: {
      id: 'sa',
      name: 'Анна Ковалёва',
      role: 'Системный аналитик · 11 лет в финтехе и e-commerce',
      initials: 'АК',
      checks: [
        'Полнота: сценарии, роли, данные, ограничения',
        'Альтернативные и граничные случаи',
        'Измеримость: метрики и критерии приёмки',
        'Понятно ли это заказчику и разработке',
        'Стейкхолдеры, согласования, процесс'
      ]
    },
    arch: {
      id: 'arch',
      name: 'Дмитрий Лазарев',
      role: 'Архитектор интеграционных решений · 14 лет в высоконагруженных системах',
      initials: 'ДЛ',
      checks: [
        'Реализуемость и стоимость предложенного',
        'Модель данных и согласованность',
        'Надёжность: таймауты, ретраи, отказы',
        'Производительность под заявленную нагрузку',
        'Эксплуатация: логи, метрики, откат'
      ]
    }
  };

  function structureScore(solution, task, signals) {
    const words = solution.words;
    let volume = 0.1;
    if (words >= 400) volume = 1;
    else if (words >= 250) volume = 0.9;
    else if (words >= 150) volume = 0.75;
    else if (words >= 80) volume = 0.5;
    else if (words >= 40) volume = 0.3;

    const expectsDiagram = (task.starterTabs || []).some((t) => t.type !== 'doc');
    let diagram = expectsDiagram ? 0.35 : 0.8;
    if (signals.diagram) diagram = 1;

    let score = 0.55 * volume + 0.45 * diagram;
    if (signals.numbers) score += 0.06;
    if (signals.alternatives) score += 0.06;
    if (signals.structure) score += 0.04;
    return Math.max(0, Math.min(1, score));
  }

  function agentCriteria(all, agentId) {
    const own = all.filter((item) => item.focus === agentId);
    if (own.length >= 3) return own;
    const others = all.filter((item) => item.focus !== agentId);
    return own.concat(pick(others, 3 - own.length, agentId === 'sa' ? 1 : 0));
  }

  function shortTitle(title, max) {
    const value = String(title || '').replace(/\s*[:—-]\s*.*$/, '');
    return truncate(value, max || 60);
  }

  /* ---------- тексты агентов ---------- */

  function buildCovered(criteria, solution, signals, agentId) {
    const items = criteria
      .filter((c) => c.state === 'hit')
      .map((c) => ({
        title: c.title,
        detail: c.evidence || 'Тема раскрыта в решении.',
        weight: c.weight
      }));

    if (agentId === 'arch' && signals.diagram) {
      items.push({
        title: 'Есть схема, а только текст',
        detail: `Диаграмм в решении: ${solution.diagramTabs}. Визуализация снимает половину вопросов на собеседовании.`,
        weight: 'low'
      });
    }
    if (agentId === 'sa' && signals.numbers) {
      items.push({
        title: 'Присутствуют конкретные величины',
        detail: 'Числа вместо «быстро» и «много» — то, чего ждут от аналитика на техническом экране.',
        weight: 'low'
      });
    }
    if (agentId === 'sa' && signals.alternatives) {
      items.push({
        title: 'Разобраны не только успешные сценарии',
        detail: 'Видно внимание к ошибкам и альтернативным веткам — частая причина провала на собеседованиях.',
        weight: 'low'
      });
    }
    return items;
  }

  function buildMissed(criteria, signals, agentId, solution) {
    const items = criteria
      .filter((c) => c.state !== 'hit')
      .map((c) => ({
        title: c.title,
        state: c.state,
        critical: c.weight === 'high',
        why: c.why
      }));

    if (agentId === 'sa' && signals.tooShort && solution.words > 0) {
      items.push({
        title: 'Объём решения не соответствует уровню задачи',
        state: 'partial',
        critical: false,
        why: `В документе около ${solution.words} слов. На собеседовании такой ответ сочтут поверхностью: не видно ни сценариев, ни обоснований.`
      });
    }
    if (agentId === 'sa' && !signals.people) {
      items.push({
        title: 'Не названы люди и роли: кто согласует, кто владеет решением',
        state: 'miss',
        critical: false,
        why: 'Половина аналитической работы — договориться. Без ролей и владельцев решение остаётся на бумаге.'
      });
    }
    if (agentId === 'arch' && !signals.diagram) {
      items.push({
        title: 'Нет ни одной схемы',
        state: 'miss',
        critical: false,
        why: 'Текст без диаграммы заставляет интервьюера переспрашивать и сомневаться, что поток действительно продуман.'
      });
    }
    if (agentId === 'arch' && !signals.risks) {
      items.push({
        title: 'Не описаны отказ и план отката',
        state: 'miss',
        critical: false,
        why: 'Архитектора всегда спрашивают: «а что сломается и как вернём назад». Это дешевле ответить сразу.'
      });
    }
    if (agentId === 'arch' && !signals.numbers) {
      items.push({
        title: 'Нет численных оценок: сроки, нагрузка, таймаут, объём',
        state: 'miss',
        critical: false,
        why: 'Без цифр невозможно проверить реализуемость. «Быстро» и «надёжно» на техническом экране не засчитываются.'
      });
    }
    if (agentId === 'arch' && !signals.validation) {
      items.push({
        title: 'Не описано, как проверяем корректность',
        state: 'miss',
        critical: false,
        why: 'Сверки, тесты и критерии приёмки — то, что отличает проектную работу от рассуждения.'
      });
    }
    return items;
  }

  function buildNarrative(criteria, signals, agentId, coverage, task) {
    const hits = criteria.filter((c) => c.state === 'hit');
    const misses = criteria.filter((c) => c.state === 'miss');
    const partials = criteria.filter((c) => c.state === 'partial');
    const criticalMiss = misses.find((c) => c.weight === 'high') || misses[0] || partials.find((c) => c.weight === 'high');
    const bestHit = hits.find((c) => c.weight === 'high') || hits[0];
    const persona = AGENTS[agentId];
    const parts = [];

    if (coverage >= 0.8) {
      parts.push(`Решение закрывает задачу: из ${criteria.length} критериев моей зоны ответственности полностью закрыты ${hits.length}.`);
    } else if (coverage >= 0.55) {
      parts.push(`Решение рабочее, но не полное: закрыты ${hits.length} из ${criteria.length} критериев, ещё ${partials.length} упомянуты без проработки.`);
    } else if (coverage >= 0.3) {
      parts.push(`Вижу верное направление мысли, но проработка недостаточная: ${hits.length} из ${criteria.length} критериев закрыты, ${misses.length} не затронуты вовсе.`);
    } else {
      parts.push(`Как ответ на задачу это пока не читается: закрыты ${hits.length} из ${criteria.length} критериев, основные требования условия не раскрыты.`);
    }

    if (bestHit) {
      parts.push(`Сильнее всего — «${shortTitle(bestHit.title, 70)}». ${bestHit.evidence ? 'Подтверждение в тексте: «' + truncate(bestHit.evidence, 130) + '».' : 'Этот аспект виден по структуре ответа.'}`);
    }

    if (criticalMiss) {
      parts.push(`Главный пробел — «${shortTitle(criticalMiss.title, 70)}». ${criticalMiss.why}`);
    }

    if (agentId === 'sa') {
      if (coverage >= 0.7) {
        parts.push('На собеседовании с таким ответом я бы перешёл к уточняющим вопросам, а не к объяснению базы.');
      } else if (!signals.alternatives) {
        parts.push('Отдельно отмечу: не разобраны альтернативные сценарии. Именно на них интервьюер проверяет, работали ли вы с реальными системами, а не с учебным примером.');
      } else {
        parts.push('Не хватает связки «требование → критерий приёмки → как проверяем». Без неё разработка додумает детали сама.');
      }
    } else {
      if (coverage >= 0.7) {
        parts.push('Технически решение реализуемо. Дальше я бы спрашивал про эксплуатацию: что мониторим и как откатываемся.');
      } else if (!signals.risks) {
        parts.push('Слабое место — поведение при отказе. Любая интеграция рано или поздно деградирует, и ответ «такого не будет» на собеседовании не принимается.');
      } else {
        parts.push('Не хватает связи с данными и нагрузкой: без них предложенная схема может не выдержать продакшена.');
      }
    }

    if (coverage >= 0.8) {
      parts.push(`Итог по моей роли: решение задачу ${task.level === 'hard' ? 'закрывает на уровне сильного сеньора' : 'закрывает'}.`);
    } else if (coverage >= 0.55) {
      parts.push('Итог по моей роли: решение частично решает задачу, но в продакшене потребует доработки по перечисленным пунктам.');
    } else {
      parts.push('Итог по моей роли: в текущем виде задачу это не решает — слишком много непрояснённого остаётся на разработку и на заказчика.');
    }

    return parts.join(' ');
  }

  function buildImprove(criteria, signals, agentId, task) {
    const items = [];
    const wOf = (c) => (typeof c.weightValue === 'number' ? c.weightValue : (WEIGHTS[c.weight] || 2));
    criteria
      .filter((c) => c.state !== 'hit')
      .sort((a, b) => wOf(b) - wOf(a))
      .slice(0, 4)
      .forEach((c) => {
        items.push({
          title: `Раскрыть: ${shortTitle(c.title, 80)}`,
          detail: c.why || 'Критерий из рубрики задачи, который сейчас не покрыт.'
        });
      });

    if (agentId === 'sa') {
      if (!signals.structure) items.push({ title: 'Добавить структуру ответа', detail: 'Заголовки и списки вместо сплошного текста: интервьюер читает ответ за 40 секунд.' });
      if (!signals.metrics) items.push({ title: 'Добавить метрики успеха', detail: 'Как поймём, что решение сработало: целевое значение, срок, источник данных.' });
    } else {
      if (!signals.diagram) items.push({ title: 'Добавить схему', detail: 'Sequence или flowchart снимает большую часть уточняющих вопросов. Вкладка PlantUML/Mermaid уже есть.' });
      if (!signals.numbers) items.push({ title: 'Добавить числа', detail: 'Таймауты, объёмы, доля трафика, срок внедрения — всё, что можно проверить.' });
    }
    return items.slice(0, 5);
  }

  function buildQuestions(criteria, task, agentId) {
    const missed = criteria.filter((c) => c.state !== 'hit');
    const pool = (task.interviewQuestions || []).slice();
    const generated = missed.slice(0, 3).map((c) => {
      const stem = shortTitle(c.title, 70);
      return agentId === 'sa'
        ? `${stem} — как это будет работать у пользователя и кто это согласует?`
        : `${stem} — как это реализовать и что произойдёт при отказе?`;
    });
    const result = pick(pool, 2, agentId === 'sa' ? 0 : 1).concat(generated);
    return result.slice(0, 4);
  }

  /* ---------- рекомендации «что потренировать» ---------- */

  function buildRecommendations(task) {
    const all = (window.SA_DATA.tasks || []).filter((t) => t.id !== task.id);
    const taskTags = new Set(task.tags || []);
    const scored = all.map((candidate) => {
      const overlap = (candidate.tags || []).filter((tag) => taskTags.has(tag)).length;
      const levelBoost = candidate.level === task.level ? 1 : 0;
      return { candidate, score: overlap * 2 + levelBoost };
    }).filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);

    return scored.slice(0, 3).map((item) => ({
      id: item.candidate.id,
      title: item.candidate.title,
      level: item.candidate.level
    }));
  }

  /* ---------- итоговая оценка ---------- */

  function buildReview(task, tabs) {
    const solution = collectSolution(tabs);
    const signals = collectSignals(solution);
    const rubric = (task.rubric || []).map((criterion) => evaluateCriterion(criterion, solution));

    const coverage = coverageOf(rubric);
    const structure = structureScore(solution, task, signals);
    let score = Math.round(100 * (0.82 * coverage + 0.18 * structure));
    if (coverage < 0.12) score = Math.min(score, 22);
    if (signals.empty) score = Math.min(score, 6);
    score = Math.max(0, Math.min(100, score));

    const grade = gradeFor(score);
    const hits = rubric.filter((c) => c.state === 'hit');
    const partials = rubric.filter((c) => c.state === 'partial');
    const misses = rubric.filter((c) => c.state === 'miss');
    const criticalMisses = misses.filter((c) => c.weight === 'high');

    const agents = ['sa', 'arch'].map((agentId) => {
      const own = agentCriteria(rubric, agentId);
      const ownCoverage = coverageOf(own);
      const persona = AGENTS[agentId];
      return {
        id: agentId,
        name: persona.name,
        role: persona.role,
        initials: persona.initials,
        checks: persona.checks,
        score: Math.round(10 * (0.85 * ownCoverage + 0.15 * structure)),
        coverage: Math.round(ownCoverage * 100),
        covered: buildCovered(own, solution, signals, agentId),
        missed: buildMissed(own, signals, agentId, solution),
        narrative: buildNarrative(own, signals, agentId, ownCoverage, task),
        improve: buildImprove(own, signals, agentId, task),
        questions: buildQuestions(own, task, agentId)
      };
    });

    const why = [];
    if (signals.empty) {
      why.push('Решение пустое или содержит несколько слов — оценивать нечего, поэтому оценка минимальная.');
    } else {
      why.push(`Покрыто ${hits.length} из ${rubric.length} критериев рубрики${partials.length ? `, ещё ${partials.length} затронуты частично` : ''}${criticalMisses.length ? `, из них ${criticalMisses.length} ключевых не раскрыто` : ''}.`);
      if (criticalMisses.length) {
        why.push(`Критичные пробелы: ${criticalMisses.slice(0, 3).map((c) => '«' + shortTitle(c.title, 55) + '»').join(', ')}. Пока они не закрыты, решение не выдержит реального собеседования.`);
      }
      if (hits.length) {
        why.push(`Учтено: ${hits.slice(0, 3).map((c) => '«' + shortTitle(c.title, 55) + '»').join(', ')}.`);
      }
      why.push(signals.diagram
        ? 'Есть визуализация — поток читается, а не угадывается.'
        : 'Схемы нет: текст приходится достраивать в голове, на собеседовании за это снижают оценку.');
      why.push(`Объём документа — около ${solution.words} слов; для уровня «${(window.SA_DATA.levels.find((l) => l.id === task.level) || {}).name || task.level}» этого ${solution.words >= 250 ? 'достаточно' : solution.words >= 120 ? 'впритык' : 'мало'}.`);
    }

    return {
      id: 'rev_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      taskId: task.id,
      submittedAt: new Date().toISOString(),
      engine: 'mock-agents/v1',
      grade: {
        code: grade.code,
        label: grade.label,
        headline: grade.headline,
        tone: grade.tone,
        score
      },
      summary: buildSummary(grade, coverage, hits, misses, criticalMisses, rubric.length),
      why,
      criteria: rubric,
      agents,
      signals,
      stats: {
        words: solution.words,
        tabs: solution.tabs.length,
        diagramTabs: solution.diagramTabs,
        criteriaTotal: rubric.length,
        criteriaHit: hits.length,
        criteriaPartial: partials.length,
        criteriaMiss: misses.length
      },
      recommendations: buildRecommendations(task)
    };
  }

  function buildSummary(grade, coverage, hits, misses, criticalMisses, criteriaTotal) {
    if (coverage < 0.12) {
      return 'Решение почти не отвечает на поставленную задачу: условия задачи не разобраны, ключевые критерии не затронуты. Это не «неправильно» — это «не про то». Стоит вернуться к условию и пройти по списку того, что должно быть в ответе.';
    }
    if (grade.code >= 4) {
      return `Задача решена на хорошем уровне: закрыто ${hits.length} из ${criteriaTotal} критериев, ответ читается как рабочая позиция, а не как рассуждение. ${criticalMisses.length ? 'Остаются пробелы по ключевым пунктам — они перечислены ниже.' : 'Ключевых пробелов нет: с таким ответом можно идти на технический экран.'}`;
    }
    if (grade.code === 3) {
      return 'Направление мысли верное, но решение половинчатое: часть критериев названа без проработки, часть не затронута. На собеседовании такой ответ вытянут уточняющими вопросами — и именно на них обычно всё и ломается.';
    }
    return 'Решение не закрывает задачу: затронуты отдельные аспекты, но системного ответа нет. Разберитесь с критериями ниже — это ровно то, что спрашивают на реальном интервью по этой теме.';
  }

  /* ---------- процесс ревью (имитация работы агентов) ---------- */

  const STAGES = [
    {
      id: 'system',
      label: 'Подготовка',
      steps: ['Собираю решение из всех вкладок', 'Сверяю текст с рубрикой задачи']
    },
    {
      id: 'sa',
      label: 'Системный аналитик',
      steps: [
        'Читаю документ и сценарии',
        'Проверяю полноту и граничные случаи',
        'Ищу измеримость и критерии приёмки',
        'Формулирую замечания'
      ]
    },
    {
      id: 'arch',
      label: 'Архитектор',
      steps: [
        'Разбираю техническую часть и схемы',
        'Проверяю данные и согласованность',
        'Оцениваю надёжность и эксплуатацию',
        'Готовлю вердикт'
      ]
    }
  ];

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Запускает ревью. onEvent получает события прогресса:
   * { stageId, stageLabel, stepIndex, stepLabel, state: 'active'|'done', progress }
   */
  async function runReview({ task, tabs, onEvent, fast }) {
    const totalSteps = STAGES.reduce((sum, stage) => sum + stage.steps.length, 0);
    let done = 0;
    const emit = (payload) => { if (typeof onEvent === 'function') onEvent(payload); };
    const stepMs = fast ? 70 : 620 + Math.round(Math.random() * 260);

    let review = null;
    for (const stage of STAGES) {
      for (let i = 0; i < stage.steps.length; i += 1) {
        emit({
          stageId: stage.id,
          stageLabel: stage.label,
          stepIndex: i,
          stepLabel: stage.steps[i],
          state: 'active',
          progress: Math.round((done / totalSteps) * 100)
        });
        await delay(stepMs);
        if (stage.id === 'arch' && i === stage.steps.length - 1 && !review) {
          review = buildReview(task, tabs);
        }
        done += 1;
        emit({
          stageId: stage.id,
          stageLabel: stage.label,
          stepIndex: i,
          stepLabel: stage.steps[i],
          state: 'done',
          progress: Math.round((done / totalSteps) * 100)
        });
      }
    }

    if (!review) review = buildReview(task, tabs);
    await delay(fast ? 60 : 420);
    emit({ stageId: 'done', progress: 100 });
    return review;
  }

  window.ReviewEngine = window.ReviewEngine || {};
  Object.assign(window.ReviewEngine, {
    stages: STAGES,
    grades: GRADES,
    agents: AGENTS,
    buildReview,
    runReview
  });
  window.ReviewEngine.__internals = {
    normalize, plainFromHtml, collectSolution, evaluateCriterion, coverageOf, collectSignals, pick, truncate
  };
})();
