/* ============================================================
   assessment.js — диагностика уровня: прохождение теста
   Состояние (ответы, текущий вопрос, отметки) сохраняется,
   поэтому тест можно прервать и продолжить.
   ============================================================ */

(function () {

  let questions = [];
  let answers = {};
  let flags = {};
  let index = 0;
  let startedAt = null;
  let timerId = null;
  let finished = false;

  const el = {};

  document.addEventListener('DOMContentLoaded', () => {
    AppUI.mountHeader('assessment');
    AppUI.mountFooter();

    ['introScreen', 'quizScreen', 'competencyGrid', 'introCount', 'previousResult',
      'quizCounter', 'quizProgress', 'quizTimer', 'quizDots', 'quizMeta',
      'quizQuestion', 'quizOptions', 'prevBtn', 'nextBtn', 'flagBtn', 'startBtn', 'quitBtn']
      .forEach((id) => { el[id] = document.getElementById(id); });

    questions = (SA_DATA.questions || []).slice();
    el.introCount.textContent = `${questions.length} вопросов`;

    renderIntro();

    const saved = Store.assessment();
    if (saved && !saved.finishedAt && saved.answers && Object.keys(saved.answers).length) {
      resume(saved);
    } else if (saved && saved.finishedAt) {
      renderPreviousResult(saved);
    }

    el.startBtn.addEventListener('click', () => start(false));
    el.quitBtn.addEventListener('click', quit);
    el.prevBtn.addEventListener('click', () => go(index - 1));
    el.nextBtn.addEventListener('click', () => {
      if (index === questions.length - 1) finish();
      else go(index + 1);
    });
    el.flagBtn.addEventListener('click', toggleFlag);
    document.addEventListener('keydown', onKey);
  });

  /* ==================== вступительный экран ==================== */

  function renderIntro() {
    const competencies = SA_DATA.competencies || [];
    const counts = {};
    questions.forEach((q) => { counts[q.competency] = (counts[q.competency] || 0) + 1; });

    el.competencyGrid.innerHTML = competencies.map((c) => `
      <div class="competency-item">
        <span class="ci-ico">${AppUI.esc(c.icon || '·')}</span>
        <div>
          <div class="ci-name">${AppUI.esc(c.name)}</div>
          <div class="ci-desc">${AppUI.esc(c.short)}</div>
          <div class="mono dim" style="font-size:10.5px;margin-top:4px">${counts[c.id] || 0} ${AppUI.plural(counts[c.id] || 0, ['вопрос', 'вопроса', 'вопросов'])}</div>
        </div>
      </div>`).join('');
  }

  function renderPreviousResult(saved) {
    const result = saved.result;
    if (!result) return;
    el.previousResult.innerHTML = `
      <div class="info-box mb-24">
        <div class="ib-title">Предыдущая диагностика · ${AppUI.esc(AppUI.dateTime(saved.finishedAt))}</div>
        <div class="row" style="gap:10px;flex-wrap:wrap">
          <span class="badge badge-accent">${AppUI.esc(result.grade.name)} · ${result.scoreRounded}/100</span>
          ${result.weakest ? `<span class="badge badge-warn">зона роста: ${AppUI.esc(result.weakest.name)} (${result.weakest.pct}%)</span>` : ''}
          ${result.strongest ? `<span class="badge badge-ok">опора: ${AppUI.esc(result.strongest.name)} (${result.strongest.pct}%)</span>` : ''}
        </div>
        <div class="row mt-16" style="gap:10px;flex-wrap:wrap">
          <a class="btn btn-ghost btn-sm" href="results.html">Открыть полный результат</a>
          <span class="mono dim" style="font-size:11.5px;align-self:center">повторное прохождение перезапишет результат</span>
        </div>
      </div>`;
  }

  /* ==================== запуск ==================== */

  function start(resumeMode) {
    if (!resumeMode) {
      answers = {};
      flags = {};
      index = 0;
      startedAt = Date.now();
      finished = false;
      Store.saveAssessment({ startedAt, answers, flags, index, finishedAt: null, result: null });
    }
    el.introScreen.classList.add('hidden');
    el.quizScreen.classList.remove('hidden');
    startTimer();
    paint();
    window.scrollTo({ top: 0 });
  }

  function resume(saved) {
    questions = (SA_DATA.questions || []).slice();
    answers = saved.answers || {};
    flags = saved.flags || {};
    index = Math.min(saved.index || 0, questions.length - 1);
    startedAt = saved.startedAt || Date.now();
    finished = false;

    const answeredCount = Object.keys(answers).length;
    AppUI.modal({
      title: 'Продолжить диагностику?',
      html: `
        <p>Вы ответили на <strong>${answeredCount}</strong> из <strong>${questions.length}</strong> вопросов и закрыли вкладку.
        Прогресс сохранён в этом браузере.</p>
        <div class="row mt-16" style="gap:10px;flex-wrap:wrap">
          <span class="badge badge-ok">продолжить с вопроса ${index + 1}</span>
          <span class="badge">начато ${AppUI.esc(AppUI.timeAgo(new Date(startedAt).toISOString()))}</span>
        </div>`,
      closeText: 'Продолжить'
    });
    el.introScreen.classList.add('hidden');
    el.quizScreen.classList.remove('hidden');
    startTimer();
    paint();
  }

  function quit() {
    save();
    AppUI.confirm({
      title: 'Выйти из диагностики?',
      text: 'Ответы сохранятся: можно вернуться и продолжить с того же вопроса. Результат появится только после завершения теста.',
      confirmText: 'Выйти',
      cancelText: 'Остаться'
    }).then((ok) => {
      if (!ok) return;
      clearInterval(timerId);
      window.location.href = 'index.html';
    });
  }

  function save() {
    Store.saveAssessment({
      startedAt,
      answers,
      flags,
      index,
      finishedAt: null,
      result: null
    });
  }

  function startTimer() {
    clearInterval(timerId);
    const tick = () => {
      const sec = Math.floor((Date.now() - startedAt) / 1000);
      const mm = String(Math.floor(sec / 60)).padStart(2, '0');
      const ss = String(sec % 60).padStart(2, '0');
      if (el.quizTimer) el.quizTimer.textContent = `${mm}:${ss}`;
    };
    tick();
    timerId = setInterval(tick, 1000);
  }

  /* ==================== отрисовка вопроса ==================== */

  function paint() {
    const q = questions[index];
    if (!q) return;
    const competency = (SA_DATA.competencies || []).find((c) => c.id === q.competency) || { name: q.competency, icon: '·' };
    const difficultyLabel = { 1: 'базовый', 2: 'средний', 3: 'сложный' }[q.difficulty] || '';

    el.quizCounter.textContent = `${index + 1} / ${questions.length}`;
    el.quizProgress.style.width = `${Math.round(((index + 1) / questions.length) * 100)}%`;

    el.quizMeta.innerHTML = `
      <span class="chip chip-accent">${AppUI.esc(competency.icon || '')} ${AppUI.esc(competency.name)}</span>
      <span class="badge">сложность: ${difficultyLabel}</span>
      <span class="badge">вес ×${q.difficulty}</span>
      ${flags[q.id] ? '<span class="badge badge-warn">⚑ отмечен</span>' : ''}
      ${answers[q.id] !== undefined ? '<span class="badge badge-ok">отвечено</span>' : ''}`;

    el.quizQuestion.innerHTML = AppUI.esc(q.question);

    const letters = ['A', 'B', 'C', 'D', 'E'];
    el.quizOptions.innerHTML = q.options.map((option, i) => `
      <button type="button" class="option" data-index="${i}" data-selected="${answers[q.id] === i}">
        <span class="key">${letters[i] || i + 1}</span>
        <span>${AppUI.esc(option)}</span>
      </button>`).join('');

    el.quizOptions.querySelectorAll('.option').forEach((button) => {
      button.addEventListener('click', () => choose(Number(button.dataset.index)));
    });

    el.prevBtn.disabled = index === 0;
    el.nextBtn.textContent = index === questions.length - 1 ? 'Завершить и показать результат' : 'Дальше →';
    el.flagBtn.setAttribute('aria-pressed', String(Boolean(flags[q.id])));
    el.flagBtn.style.color = flags[q.id] ? 'var(--warn)' : '';

    paintDots();
    save();
  }

  function paintDots() {
    el.quizDots.innerHTML = questions.map((q, i) => `
      <button type="button" data-go="${i}" data-answered="${answers[q.id] !== undefined}" data-current="${i === index}"
        title="Вопрос ${i + 1}${flags[q.id] ? ' · отмечен' : ''}">${flags[q.id] ? '⚑' : i + 1}</button>`).join('');
    el.quizDots.querySelectorAll('[data-go]').forEach((button) => {
      button.addEventListener('click', () => go(Number(button.dataset.go)));
    });
  }

  function choose(optionIndex) {
    const q = questions[index];
    answers[q.id] = optionIndex;
    el.quizOptions.querySelectorAll('.option').forEach((button) => {
      button.dataset.selected = String(Number(button.dataset.index) === optionIndex);
    });
    paintDots();
    save();

    /* короткий автопереход: как в Coderun — но только вперёд и не на последнем вопросе */
    if (index < questions.length - 1) {
      setTimeout(() => { if (answers[q.id] === optionIndex) go(index + 1); }, 220);
    }
  }

  function toggleFlag() {
    const q = questions[index];
    flags[q.id] = !flags[q.id];
    paint();
  }

  function go(target) {
    if (target < 0 || target >= questions.length) return;
    index = target;
    paint();
    el.quizScreen.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function onKey(event) {
    if (el.quizScreen.classList.contains('hidden')) return;
    if (event.target && ['INPUT', 'TEXTAREA'].includes(event.target.tagName)) return;

    const q = questions[index];
    if (!q) return;

    if (event.key >= '1' && event.key <= String(Math.min(9, q.options.length))) {
      event.preventDefault();
      choose(Number(event.key) - 1);
      return;
    }
    switch (event.key) {
      case 'ArrowRight':
        event.preventDefault();
        if (index === questions.length - 1) finish(); else go(index + 1);
        break;
      case 'ArrowLeft':
        event.preventDefault();
        go(index - 1);
        break;
      case 'Enter':
        event.preventDefault();
        if (index === questions.length - 1) finish(); else go(index + 1);
        break;
      case 'f':
      case 'F':
      case 'а':
      case 'А':
        event.preventDefault();
        toggleFlag();
        break;
      default:
        break;
    }
  }

  /* ==================== завершение ==================== */

  function finish() {
    if (finished) return;
    const unanswered = questions.filter((q) => answers[q.id] === undefined);
    const flagged = questions.filter((q) => flags[q.id] && answers[q.id] !== undefined);

    const proceed = () => {
      finished = true;
      clearInterval(timerId);
      const result = Scoring.compute(answers);
      const durationSec = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
      Store.saveAssessment({
        startedAt,
        finishedAt: new Date().toISOString(),
        answers,
        flags,
        index,
        durationSec,
        result
      });
      window.location.href = 'results.html';
    };

    if (unanswered.length) {
      AppUI.confirm({
        title: `Без ответа осталось ${unanswered.length}`,
        text: 'Пропущенные вопросы снизят итоговый балл: он считается с учётом доли отвеченных. Можно вернуться и договорить, либо завершить сейчас.',
        checklist: [
          `Отвечено: ${questions.length - unanswered.length} из ${questions.length}`,
          flagged.length ? `Отмечено как сомнительные: ${flagged.length}` : 'Отмеченных вопросов нет',
          'Результат сохранится — диагностику можно пройти заново в любой момент'
        ],
        confirmText: 'Завершить и показать результат',
        cancelText: 'Вернуться к вопросам'
      }).then((ok) => { if (ok) proceed(); });
      return;
    }

    AppUI.confirm({
      title: 'Завершить диагностику?',
      text: 'Ответы отправятся на расчёт профиля. Вы увидите уровень, разбивку по семи компетенциям, сильные зоны, пробелы и план прокачки.',
      confirmText: 'Показать результат',
      cancelText: 'Проверить ответы'
    }).then((ok) => { if (ok) proceed(); });
  }
})();
