/* ============================================================
   results.js — результат диагностики уровня
   ============================================================ */

(function () {

  let saved = null;
  let result = null;
  let filterCompetency = 'all';
  let showOnlyWrong = false;

  document.addEventListener('DOMContentLoaded', () => {
    AppUI.mountHeader('assessment');
    AppUI.mountFooter();

    saved = Store.assessment();
    const host = document.getElementById('resultsHost');

    if (!saved || !saved.result) {
      host.innerHTML = `
        <div class="empty-state mt-48">
          <h3>Результата пока нет</h3>
          <p class="muted" style="margin-bottom:16px">Пройдите диагностику — 55 вопросов, 20–25 минут. Результат сохранится в этом браузере.</p>
          <div class="row" style="gap:10px;justify-content:center">
            <a class="btn btn-primary" href="assessment.html">Начать диагностику</a>
            <a class="btn btn-ghost" href="catalog.html">Сначала посмотреть задачи</a>
          </div>
        </div>`;
      return;
    }

    result = saved.result;
    render(host);
  });

  function tierColor(tier) {
    return { strong: 'var(--ok)', ok: 'var(--info)', weak: 'var(--warn)', bad: 'var(--bad)' }[tier] || 'var(--muted)';
  }

  /* Каталог, отфильтрованный под слабые компетенции: теги пробелов в URL */
  function levelCatalogUrl(result) {
    const tags = [];
    (result.gaps || []).slice(0, 2).forEach((gap) => {
      (Scoring.COMPETENCY_TAGS[gap.id] || []).slice(0, 3).forEach((tag) => {
        if (!tags.includes(tag)) tags.push(tag);
      });
    });
    return tags.length ? `catalog.html?tag=${tags.slice(0, 4).join(',')}` : 'catalog.html';
  }

  function render(host) {
    const grade = result.grade;
    const market = Scoring.marketView(result);
    const narrative = Scoring.narrative(result);
    const plan = Scoring.buildPlan(result, 4);
    const durationMin = saved.durationSec ? Math.max(1, Math.round(saved.durationSec / 60)) : null;

    host.innerHTML = `
      <section class="result-hero">
        <p class="eyebrow">Результат диагностики · ${AppUI.esc(AppUI.dateTime(saved.finishedAt))}</p>
        <h1 style="font-size:clamp(26px,3.6vw,40px);margin-bottom:18px">Ваш профиль аналитика</h1>

        <div class="level-card">
          <div class="level-ring" style="--pct:${Math.max(4, Math.min(100, result.scoreRounded))}">
            <div class="val"><b>${result.scoreRounded}</b><span>из 100</span></div>
          </div>
          <div>
            <div class="row" style="gap:10px;flex-wrap:wrap;margin-bottom:10px">
              <span class="badge badge-accent" style="font-size:12px;padding:5px 12px">${AppUI.esc(grade.name)}</span>
              <span class="badge">${AppUI.esc(grade.title)}</span>
              <span class="badge badge-info">верных ${result.correctCount} из ${result.answeredCount}</span>
              ${durationMin ? `<span class="badge">время: ${durationMin} мин</span>` : ''}
            </div>
            <h2 style="font-size:22px;margin-bottom:8px">${AppUI.esc(grade.note)}</h2>
            <p class="muted" style="font-size:14px;margin-bottom:16px;max-width:70ch">
              ${AppUI.esc(market.label)}. ${AppUI.esc(market.note)}
            </p>
            <div class="row" style="gap:10px;flex-wrap:wrap">
              <a class="btn btn-primary" href="${AppUI.esc(levelCatalogUrl(result))}">К задачам по моему уровню</a>
              <a class="btn btn-ghost" href="assessment.html">Пройти заново</a>
              <button class="btn btn-ghost" type="button" id="copyResult">Скопировать результат</button>
            </div>
          </div>
        </div>
      </section>

      <section class="section-tight" style="padding-top:8px">
        <div class="grid-2" style="gap:18px;align-items:start">
          <div class="panel">
            <div class="panel-head">
              <p class="panel-title">Профиль по компетенциям</p>
              <span class="badge">7 осей</span>
            </div>
            <div class="panel-body">
              <div class="competency-bars">
                ${result.byCompetency.map((c) => `
                  <div class="cbar" data-tier="${AppUI.esc(c.tier || 'bad')}">
                    <div class="top">
                      <span class="name">${AppUI.esc(c.icon || '')} ${AppUI.esc(c.name)}</span>
                      <span class="pct">${c.pct === null ? '—' : c.pct + '%'}</span>
                    </div>
                    <div class="track"><i style="width:${c.pct === null ? 0 : c.pct}%"></i></div>
                    <div class="verdict">${AppUI.esc(c.tierLabel)} · верно ${c.correct} из ${c.answered || c.total}</div>
                  </div>`).join('')}
              </div>
            </div>
          </div>

          <div class="stack" style="gap:18px">
            <div class="panel">
              <div class="panel-head">
                <p class="panel-title">Что это значит</p>
                <span class="badge badge-violet">интерпретация</span>
              </div>
              <div class="panel-body">
                ${narrative.map((line) => `<p style="font-size:14px;color:var(--text-2)">${AppUI.esc(line)}</p>`).join('')}
              </div>
            </div>

            <div class="grid-2" style="gap:14px">
              <div class="card" style="padding:18px">
                <div class="mono" style="font-size:10.5px;letter-spacing:.1em;color:var(--ok);margin-bottom:12px">СИЛЬНЫЕ ЗОНЫ</div>
                ${result.strengths.length
                  ? result.strengths.map((c) => `<div style="padding:6px 0;border-bottom:1px dashed var(--line-soft);font-size:13.5px"><strong>${AppUI.esc(c.name)}</strong> <span class="dim">· ${c.pct}%</span></div>`).join('')
                  : '<p class="muted" style="font-size:13px">Пока нет зон выше 70%. Это нормально для первого замера — начните с плана ниже.</p>'}
              </div>
              <div class="card" style="padding:18px">
                <div class="mono" style="font-size:10.5px;letter-spacing:.1em;color:var(--warn);margin-bottom:12px">ЧТО ПОДТЯНУТЬ</div>
                ${result.gaps.length
                  ? result.gaps.map((c) => `<div style="padding:6px 0;border-bottom:1px dashed var(--line-soft);font-size:13.5px"><strong>${AppUI.esc(c.name)}</strong> <span class="dim">· ${c.pct}%</span><div class="muted" style="font-size:12px">${AppUI.esc(c.short)}</div></div>`).join('')
                  : '<p class="muted" style="font-size:13px">Пробелов ниже 70% не нашли. Берите задачи уровня Senior и сложные подборки.</p>'}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="section-tight">
        <div class="row-between mb-16" style="align-items:flex-end">
          <div>
            <p class="eyebrow">План прокачки</p>
            <h2 style="font-size:22px">Задачи под ваши пробелы</h2>
            <p class="muted" style="font-size:14px;margin-top:6px">Подобраны по меткам слабых компетенций и по вашему уровню сложности.</p>
          </div>
          <a class="btn btn-ghost btn-sm" href="collections.html">Все подборки →</a>
        </div>

        ${plan.length ? plan.map((item) => `
          <a class="plan-item" href="task.html?id=${AppUI.esc(item.id)}" style="text-decoration:none;color:inherit">
            <span class="n">${String(item.n).padStart(2, '0')}</span>
            <div>
              <div class="t">${AppUI.esc(item.title)}</div>
              <div class="s">${AppUI.esc(item.reason || 'практика')} · ${AppUI.esc((Store.task(item.id) || {}).statement ? (Store.task(item.id).statement.brief || '').slice(0, 90) : '')}…</div>
            </div>
            <span class="row" style="gap:8px">
              ${item.done ? '<span class="badge badge-ok">решена</span>' : ''}
              ${AppUI.levelPill(item.level)}
            </span>
          </a>`).join('')
          : `<div class="empty-state"><h3>План не построен</h3><p class="muted">Недостаточно ответов. Пройдите тест целиком — тогда подбор будет точным.</p></div>`}
      </section>

      <section class="section-tight" style="padding-bottom:80px">
        <div class="row-between mb-16" style="align-items:flex-end;flex-wrap:wrap;gap:12px">
          <div>
            <p class="eyebrow">Разбор ответов</p>
            <h2 style="font-size:22px">Где именно вы ошиблись и почему</h2>
          </div>
          <div class="row" style="gap:8px;flex-wrap:wrap">
            <select class="select" id="competencyFilter">
              <option value="all">Все компетенции</option>
              ${(SA_DATA.competencies || []).map((c) => `<option value="${AppUI.esc(c.id)}">${AppUI.esc(c.name)}</option>`).join('')}
            </select>
            <button class="btn btn-ghost btn-sm" type="button" id="onlyWrong" aria-pressed="false">Только ошибки</button>
          </div>
        </div>

        <div id="answersHost"></div>
      </section>`;

    document.getElementById('copyResult').addEventListener('click', copyResult);
    document.getElementById('competencyFilter').addEventListener('change', (event) => {
      filterCompetency = event.target.value;
      renderAnswers();
    });
    document.getElementById('onlyWrong').addEventListener('click', (event) => {
      showOnlyWrong = !showOnlyWrong;
      event.currentTarget.setAttribute('aria-pressed', String(showOnlyWrong));
      event.currentTarget.classList.toggle('btn-primary', showOnlyWrong);
      event.currentTarget.classList.toggle('btn-ghost', !showOnlyWrong);
      renderAnswers();
    });

    renderAnswers();
  }

  function renderAnswers() {
    const host = document.getElementById('answersHost');
    const letters = ['A', 'B', 'C', 'D', 'E'];
    const items = result.detail.filter((item) => {
      if (filterCompetency !== 'all' && item.competency !== filterCompetency) return false;
      if (showOnlyWrong && item.correct) return false;
      return true;
    });

    if (!items.length) {
      host.innerHTML = `<div class="empty-state"><h3>Нечего показать</h3><p class="muted">Смените фильтр: ошибок в этой компетенции нет — это хороший знак.</p></div>`;
      return;
    }

    host.innerHTML = items.map((item, i) => {
      const competency = (SA_DATA.competencies || []).find((c) => c.id === item.competency) || { name: item.competency };
      return `
        <details class="fold" style="margin-bottom:8px;background:var(--panel)">
          <summary style="gap:12px">
            <span class="badge ${item.correct ? 'badge-ok' : item.answered ? 'badge-bad' : 'badge-warn'}" style="flex:0 0 auto">
              ${item.correct ? '✓ верно' : item.answered ? '× ошибка' : '— пропуск'}
            </span>
            <span style="flex:1 1 auto">${AppUI.esc(item.question)}</span>
            <span class="chip" style="flex:0 0 auto">${AppUI.esc(competency.name)}</span>
          </summary>
          <div class="fold-body">
            <div class="options" style="margin-bottom:14px">
              ${item.options.map((option, oi) => {
                const isAnswer = oi === item.answer;
                const isChosen = oi === item.chosen;
                let style = '';
                if (isAnswer) style = 'border-color:rgba(61,220,151,.5);background:var(--ok-soft)';
                else if (isChosen) style = 'border-color:rgba(255,107,107,.5);background:var(--bad-soft)';
                return `<div class="option" style="${style};cursor:default">
                  <span class="key">${letters[oi] || oi + 1}</span>
                  <span>${AppUI.esc(option)}${isAnswer ? ' <span class="badge badge-ok">правильный</span>' : ''}${isChosen && !isAnswer ? ' <span class="badge badge-bad">ваш ответ</span>' : ''}</span>
                </div>`;
              }).join('')}
            </div>
            <div class="ra-narrative" style="margin-top:0">
              <span class="lbl">Разбор</span>
              ${AppUI.esc(item.explain)}
            </div>
          </div>
        </details>`;
    }).join('');
  }

  function copyResult() {
    const grade = result.grade;
    const lines = [
      `Диагностика AnalystGym · ${new Date(saved.finishedAt).toLocaleDateString('ru-RU')}`,
      `Уровень: ${grade.name} (${grade.title}) — ${result.scoreRounded}/100`,
      `Верных ответов: ${result.correctCount} из ${result.answeredCount}`,
      '',
      'Компетенции:',
      ...result.byCompetency.map((c) => `  ${c.pct === null ? '—' : c.pct + '%'} · ${c.name}`),
      '',
      result.strongest ? `Опора: ${result.strongest.name}` : '',
      result.weakest ? `Зона роста: ${result.weakest.name}` : ''
    ].filter(Boolean);

    const text = lines.join('\n');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => AppUI.toast('Результат скопирован — можно вставить в резюме или чат', 'ok'))
        .catch(() => fallbackCopy(text));
    } else {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text) {
    const area = document.createElement('textarea');
    area.value = text;
    document.body.append(area);
    area.select();
    try {
      document.execCommand('copy');
      AppUI.toast('Результат скопирован', 'ok');
    } catch (error) {
      AppUI.modal({ title: 'Результат диагностики', html: `<pre style="white-space:pre-wrap;font-size:12.5px">${AppUI.esc(text)}</pre>` });
    }
    area.remove();
  }
})();
