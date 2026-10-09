/* ============================================================
   collections.js — подборки задач по доменам
   ============================================================ */

(function () {

  function collectionTasks(collection) {
    const tasks = Store.tasks();
    return (collection.taskIds || [])
      .map((id) => tasks.find((t) => t.id === id))
      .filter(Boolean);
  }

  function levelCounts(items) {
    return ['easy', 'medium', 'hard'].map((lvl) => items.filter((t) => t.level === lvl).length);
  }

  function progressOf(items) {
    const reviewed = items.filter((t) => Store.status(t.id) === 'reviewed').length;
    const started = items.filter((t) => ['draft', 'review', 'reviewed'].includes(Store.status(t.id))).length;
    return {
      reviewed,
      started,
      total: items.length,
      pct: items.length ? Math.round((reviewed / items.length) * 100) : 0
    };
  }

  function nextTask(items) {
    return items.find((t) => Store.status(t.id) !== 'reviewed') || items[0] || null;
  }

  function taskRow(task) {
    const status = Store.status(task.id);
    const meta = AppUI.statusMeta[status] || AppUI.statusMeta.new;
    const grade = Store.bestGrade(task.id);
    return `
      <a class="collection-task" href="task.html?id=${AppUI.esc(task.id)}">
        <span class="task-status" data-state="${meta.state}" title="${AppUI.esc(meta.label)}">${meta.icon || ''}</span>
        <span>${AppUI.esc(task.title)}</span>
        ${grade ? `<span class="badge badge-accent">${grade}/100</span>` : ''}
        <span class="lvl">${AppUI.levelBadge(task.level)}</span>
      </a>`;
  }

  function renderCollection(collection) {
    const items = collectionTasks(collection);
    if (!items.length) return '';
    const progress = progressOf(items);
    const levels = levelCounts(items);
    const totalTime = items.reduce((sum, t) => sum + (t.timeMin || 0), 0);
    const avgSolved = Math.round(items.reduce((sum, t) => sum + (t.solvedRate || 0), 0) / items.length);
    const next = nextTask(items);
    const tagSet = new Set();
    items.forEach((t) => (t.tags || []).forEach((tag) => tagSet.add(tag)));

    return `
      <article class="panel collection-card" id="${AppUI.esc(collection.id)}">
        <div class="collection-top">
          <span class="collection-ico">${AppUI.esc(collection.icon || '◈')}</span>
          <div class="grow">
            <h3>${AppUI.esc(collection.name)}</h3>
            <p class="desc">${AppUI.esc(collection.description || '')}</p>
            <div class="row mt-16" style="gap:6px;flex-wrap:wrap">
              ${AppUI.tagChips([...tagSet], 6)}
              ${tagSet.size > 6 ? `<span class="chip">+${tagSet.size - 6}</span>` : ''}
            </div>
          </div>
        </div>

        <div class="collection-meta" style="flex-wrap:wrap;gap:10px 20px">
          <span><b>${items.length}</b> ${AppUI.plural(items.length, ['задача', 'задачи', 'задач'])}</span>
          <span class="level level-easy">лёгких ${levels[0]}</span>
          <span class="level level-medium">средних ${levels[1]}</span>
          <span class="level level-hard">сложных ${levels[2]}</span>
          <span>≈ <b>${Math.round(totalTime / 60 * 10) / 10}</b> ч</span>
          <span>решили в среднем <b>${avgSolved}%</b></span>
          <span>для: <b>${AppUI.esc(collection.audience || '—')}</b></span>
        </div>

        <div style="padding:0 24px 16px">
          <div class="row-between" style="margin-bottom:6px">
            <span class="mono" style="font-size:10.5px;letter-spacing:.1em;color:var(--dim)">МОЙ ПРОГРЕСС</span>
            <span class="mono" style="font-size:11.5px;color:var(--text-2)">${progress.reviewed} / ${progress.total} с ревью</span>
          </div>
          <div class="progress-bar"><i style="width:${progress.pct}%"></i></div>
        </div>

        <div class="collection-tasks">
          ${items.map(taskRow).join('')}
        </div>

        <div class="collection-foot row" style="gap:10px">
          ${next ? `<a class="btn btn-primary btn-sm" href="task.html?id=${AppUI.esc(next.id)}">
              ${progress.reviewed ? 'Продолжить подборку' : 'Начать подборку'} → ${AppUI.esc(next.title.slice(0, 42))}${next.title.length > 42 ? '…' : ''}
            </a>` : ''}
          <a class="btn btn-ghost btn-sm" href="catalog.html?collection=${AppUI.esc(collection.id)}">Открыть в каталоге</a>
          ${progress.pct === 100 ? '<span class="badge badge-ok">подборка закрыта</span>' : ''}
        </div>
      </article>`;
  }

  function render() {
    const dict = Store.dictionaries();
    const collections = dict.collections.filter((c) => c.active !== false);
    const host = document.getElementById('collectionsHost');

    const allItems = new Set();
    collections.forEach((c) => (c.taskIds || []).forEach((id) => allItems.add(id)));

    const reviewedTotal = [...allItems].filter((id) => Store.status(id) === 'reviewed').length;
    const statsHost = document.getElementById('collectionStats');
    statsHost.innerHTML = `
      <span class="badge">${collections.length} подборок</span>
      <span class="badge">${allItems.size} ${AppUI.plural(allItems.size, ['задача', 'задачи', 'задач'])} в подборках</span>
      <span class="badge badge-ok">с ревью: ${reviewedTotal}</span>
      <a class="badge" href="catalog.html" style="cursor:pointer">весь каталог →</a>
    `;

    host.innerHTML = `<div class="collections-grid">${collections.map(renderCollection).join('')}</div>`;

    /* подсветка подборки из хэша ссылки */
    const hash = window.location.hash.slice(1);
    if (hash) {
      const target = document.getElementById(hash);
      if (target) {
        target.scrollIntoView({ block: 'start' });
        target.style.transition = 'border-color .3s';
        target.style.borderColor = 'rgba(211,242,106,.5)';
        setTimeout(() => { target.style.borderColor = ''; }, 2200);
      }
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    AppUI.mountHeader('collections');
    AppUI.mountFooter();
    render();
  });
})();
