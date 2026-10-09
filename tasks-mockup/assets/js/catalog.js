/* ============================================================
   catalog.js — каталог задач: фильтры, поиск, сортировка
   Состояние фильтров синхронизируется с URL, чтобы на каталог
   можно было ссылаться (например, из результата диагностики).
   ============================================================ */

(function () {
  const STATUS_LIST = [
    { id: 'new', label: 'Не начато' },
    { id: 'draft', label: 'Есть черновик' },
    { id: 'review', label: 'Отправлено на ревью' },
    { id: 'reviewed', label: 'Ревью получено' }
  ];

  const LEVEL_ORDER = { easy: 1, medium: 2, hard: 3 };

  const state = {
    q: '',
    levels: new Set(),
    tags: new Set(),
    collections: new Set(),
    statuses: new Set(),
    sort: 'recommended',
    openCategory: null
  };

  function readUrl() {
    const params = new URLSearchParams(window.location.search);
    state.q = params.get('q') || '';
    state.sort = params.get('sort') || 'recommended';
    (params.get('level') || '').split(',').filter(Boolean).forEach((v) => state.levels.add(v));
    (params.get('tag') || '').split(',').filter(Boolean).forEach((v) => state.tags.add(v));
    (params.get('collection') || '').split(',').filter(Boolean).forEach((v) => state.collections.add(v));
    (params.get('status') || '').split(',').filter(Boolean).forEach((v) => state.statuses.add(v));
  }

  function writeUrl() {
    const params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.levels.size) params.set('level', [...state.levels].join(','));
    if (state.tags.size) params.set('tag', [...state.tags].join(','));
    if (state.collections.size) params.set('collection', [...state.collections].join(','));
    if (state.statuses.size) params.set('status', [...state.statuses].join(','));
    if (state.sort !== 'recommended') params.set('sort', state.sort);
    const query = params.toString();
    const url = window.location.pathname + (query ? '?' + query : '');
    window.history.replaceState(null, '', url);
  }

  /* ---------- наборы задач по критериям ---------- */

  function tagUsage() {
    const usage = new Map();
    Store.tasks().forEach((task) => {
      (task.tags || []).forEach((tag) => usage.set(tag, (usage.get(tag) || 0) + 1));
    });
    return usage;
  }

  function collectionCount(id) {
    const collection = Store.collection(id);
    return collection ? (collection.taskIds || []).length : 0;
  }

  function matches(task) {
    const dict = Store.dictionaries();
    const activeTags = new Set(dict.tags.filter((t) => t.active !== false).map((t) => t.id));

    if (state.levels.size && !state.levels.has(task.level)) return false;

    if (state.tags.size) {
      const taskTags = (task.tags || []).filter((t) => activeTags.has(t));
      const has = [...state.tags].some((tag) => taskTags.includes(tag));
      if (!has) return false;
    }

    if (state.collections.size) {
      const inAny = [...state.collections].some((id) => {
        const collection = Store.collection(id);
        return collection && (collection.taskIds || []).includes(task.id);
      });
      if (!inAny) return false;
    }

    if (state.statuses.size && !state.statuses.has(Store.status(task.id))) return false;

    if (state.q) {
      const q = state.q.toLowerCase();
      const tagNames = (task.tags || []).map((id) => (Store.tag(id).name || '').toLowerCase());
      const collectionNames = Store.collectionsOfTask(task.id).map((c) => c.name.toLowerCase());
      const haystack = [task.title, task.statement.brief, ...tagNames, ...collectionNames]
        .join(' ').toLowerCase();
      if (!haystack.includes(q)) return false;
    }

    return true;
  }

  function sortTasks(list) {
    const sorted = list.slice();
    switch (state.sort) {
      case 'level-asc':
        sorted.sort((a, b) => (LEVEL_ORDER[a.level] || 9) - (LEVEL_ORDER[b.level] || 9));
        break;
      case 'level-desc':
        sorted.sort((a, b) => (LEVEL_ORDER[b.level] || 0) - (LEVEL_ORDER[a.level] || 0));
        break;
      case 'popular':
        sorted.sort((a, b) => (b.attempts || 0) - (a.attempts || 0));
        break;
      case 'solved':
        sorted.sort((a, b) => (b.solvedRate || 0) - (a.solvedRate || 0));
        break;
      case 'title':
        sorted.sort((a, b) => a.title.localeCompare(b.title, 'ru'));
        break;
      default: {
        const statusRank = { new: 0, draft: 1, review: 2, reviewed: 3 };
        sorted.sort((a, b) => {
          const sa = statusRank[Store.status(a.id)] ?? 9;
          const sb = statusRank[Store.status(b.id)] ?? 9;
          if (sa !== sb) return sa - sb;
          const la = LEVEL_ORDER[a.level] || 9;
          const lb = LEVEL_ORDER[b.level] || 9;
          if (la !== lb) return la - lb;
          return (b.solvedRate || 0) - (a.solvedRate || 0);
        });
      }
    }
    return sorted;
  }

  /* ---------- рендер фильтров ---------- */

  function renderLevelFilters() {
    const host = document.getElementById('levelFilters');
    const levels = Store.dictionaries().levels.filter((l) => l.active !== false);
    const tasks = Store.tasks();
    host.innerHTML = levels.map((level) => {
      const count = tasks.filter((t) => t.level === level.id).length;
      const checked = state.levels.has(level.id);
      return `
        <label class="filter-option" data-on="${checked}">
          <input type="checkbox" data-level="${AppUI.esc(level.id)}" ${checked ? 'checked' : ''}>
          <span class="level ${AppUI.esc(level.cssClass || '')}">${AppUI.esc(level.name)}</span>
          <span class="count">${count}</span>
        </label>
        <div class="muted" style="font-size:11.5px;padding:0 9px 6px 34px;margin-top:-4px">${AppUI.esc(level.timeHint || '')}</div>`;
    }).join('');

    host.querySelectorAll('input[data-level]').forEach((input) => {
      input.addEventListener('change', () => {
        const id = input.dataset.level;
        if (input.checked) state.levels.add(id); else state.levels.delete(id);
        update();
      });
    });
  }

  function renderCollectionFilters() {
    const host = document.getElementById('collectionFilters');
    const collections = Store.dictionaries().collections.filter((c) => c.active !== false);
    host.innerHTML = collections.map((collection) => {
      const checked = state.collections.has(collection.id);
      return `
        <label class="filter-option" data-on="${checked}">
          <input type="checkbox" data-collection="${AppUI.esc(collection.id)}" ${checked ? 'checked' : ''}>
          <span>${AppUI.esc(collection.icon || '◈')} ${AppUI.esc(collection.name)}</span>
          <span class="count">${collectionCount(collection.id)}</span>
        </label>`;
    }).join('');

    host.querySelectorAll('input[data-collection]').forEach((input) => {
      input.addEventListener('change', () => {
        const id = input.dataset.collection;
        if (input.checked) state.collections.add(id); else state.collections.delete(id);
        update();
      });
    });
  }

  function renderStatusFilters() {
    const host = document.getElementById('statusFilters');
    host.innerHTML = STATUS_LIST.map((item) => {
      const count = Store.tasks().filter((t) => Store.status(t.id) === item.id).length;
      const checked = state.statuses.has(item.id);
      return `
        <label class="filter-option" data-on="${checked}">
          <input type="checkbox" data-status="${AppUI.esc(item.id)}" ${checked ? 'checked' : ''}>
          <span>${AppUI.esc(item.label)}</span>
          <span class="count">${count}</span>
        </label>`;
    }).join('');

    host.querySelectorAll('input[data-status]').forEach((input) => {
      input.addEventListener('change', () => {
        const id = input.dataset.status;
        if (input.checked) state.statuses.add(id); else state.statuses.delete(id);
        update();
      });
    });
  }

  function renderTagFilters() {
    const dict = Store.dictionaries();
    const usage = tagUsage();
    const catHost = document.getElementById('tagCategories');
    const cloudHost = document.getElementById('tagCloud');

    const activeTags = dict.tags.filter((t) => t.active !== false);
    const categories = dict.tagCategories.filter((cat) => activeTags.some((t) => t.category === cat.id));

    catHost.innerHTML = categories.map((cat) => {
      const open = state.openCategory === cat.id;
      const tags = activeTags.filter((t) => t.category === cat.id);
      const selectedInCat = tags.filter((t) => state.tags.has(t.id)).length;
      return `
        <details class="fold" ${open ? 'open' : ''} data-category="${AppUI.esc(cat.id)}" style="margin-top:6px">
          <summary style="padding:8px 10px;font-size:12.5px">
            ${AppUI.esc(cat.name)}
            ${selectedInCat ? `<span class="badge badge-accent" style="margin-left:auto">${selectedInCat}</span>` : ''}
          </summary>
          <div class="fold-body" style="padding:6px 10px 12px">
            <div class="tag-cloud">
              ${tags.map((tag) => `
                <button type="button" class="tag-filter" data-tag="${AppUI.esc(tag.id)}" aria-pressed="${state.tags.has(tag.id)}">
                  ${AppUI.esc(tag.name)}
                  <span class="count">${usage.get(tag.id) || 0}</span>
                </button>`).join('')}
            </div>
          </div>
        </details>`;
    }).join('');

    /* все выбранные метки показываем отдельным облаком, даже если категория свёрнута */
    const selected = activeTags.filter((t) => state.tags.has(t.id));
    cloudHost.innerHTML = selected.length
      ? `<div class="mono" style="font-size:10.5px;color:var(--dim);width:100%;margin-bottom:2px">ВЫБРАНО: ${selected.length}</div>` +
        selected.map((tag) => `
          <button type="button" class="tag-filter" data-tag="${AppUI.esc(tag.id)}" aria-pressed="true">
            ${AppUI.esc(tag.name)}<span class="count">×</span>
          </button>`).join('')
      : `<span class="muted" style="font-size:12px">Раскройте категорию и отметьте метки — например «REST API» и «Идемпотентность».</span>`;

    document.querySelectorAll('[data-tag]').forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.dataset.tag;
        if (state.tags.has(id)) state.tags.delete(id); else state.tags.add(id);
        update();
      });
    });

    document.querySelectorAll('details[data-category]').forEach((details) => {
      details.addEventListener('toggle', () => {
        state.openCategory = details.open ? details.dataset.category : null;
      });
    });
  }

  function renderActiveFilters() {
    const host = document.getElementById('activeFilters');
    const chips = [];

    if (state.q) chips.push({ label: `поиск: «${state.q}»`, clear: () => { state.q = ''; document.getElementById('searchInput').value = ''; } });
    state.levels.forEach((id) => chips.push({ label: Store.level(id).name, clear: () => state.levels.delete(id) }));
    state.tags.forEach((id) => chips.push({ label: Store.tag(id).name, clear: () => state.tags.delete(id) }));
    state.collections.forEach((id) => {
      const collection = Store.collection(id);
      chips.push({ label: `подборка: ${collection ? collection.name : id}`, clear: () => state.collections.delete(id) });
    });
    state.statuses.forEach((id) => {
      const item = STATUS_LIST.find((s) => s.id === id);
      chips.push({ label: item ? item.label : id, clear: () => state.statuses.delete(id) });
    });

    host.innerHTML = chips.map((chip, index) => `<button type="button" class="tag-filter" data-chip="${index}" aria-pressed="true">${AppUI.esc(chip.label)} <span class="count">×</span></button>`).join('');
    host.querySelectorAll('[data-chip]').forEach((button) => {
      button.addEventListener('click', () => {
        chips[Number(button.dataset.chip)].clear();
        update();
      });
    });
  }

  /* ---------- рендер списка ---------- */

  function statusCell(taskId) {
    const status = Store.status(taskId);
    const meta = AppUI.statusMeta[status] || AppUI.statusMeta.new;
    const grade = Store.bestGrade(taskId);
    const title = meta.label + (grade ? ` · лучший балл ${grade}/100` : '');
    return `<span class="task-status" data-state="${meta.state}" title="${AppUI.esc(title)}">${meta.icon || ''}</span>`;
  }

  function renderList() {
    const all = Store.tasks();
    const filtered = sortTasks(all.filter(matches));
    const host = document.getElementById('taskRows');
    const empty = document.getElementById('emptyState');
    const table = document.getElementById('taskList');

    document.getElementById('resultCount').textContent =
      `${filtered.length} ${AppUI.plural(filtered.length, ['задача', 'задачи', 'задач'])} из ${all.length}`;

    if (!filtered.length) {
      table.classList.add('hidden');
      empty.innerHTML = `
        <div class="empty-state">
          <h3>Под фильтры ничего не подошло</h3>
          <p class="muted" style="margin-bottom:16px">Попробуйте убрать часть меток или выбрать другой уровень.</p>
          <button class="btn btn-ghost" type="button" id="emptyReset">Сбросить фильтры</button>
        </div>`;
      document.getElementById('emptyReset').addEventListener('click', resetAll);
      return;
    }

    table.classList.remove('hidden');
    empty.innerHTML = '';

    host.innerHTML = filtered.map((task) => {
      const collections = Store.collectionsOfTask(task.id);
      const grade = Store.bestGrade(task.id);
      return `
        <a class="task-row" href="task.html?id=${AppUI.esc(task.id)}">
          ${statusCell(task.id)}
          <div>
            <div class="task-title">${AppUI.esc(task.title)}</div>
            <div class="task-meta">
              ${AppUI.levelBadge(task.level)}
              ${collections.length ? `<span class="chip">${AppUI.esc(collections[0].icon || '')} ${AppUI.esc(collections[0].name)}</span>` : ''}
              ${grade ? `<span class="chip chip-accent">ревью: ${grade}/100</span>` : ''}
            </div>
          </div>
          <div class="task-tags">${AppUI.tagChips(task.tags, 3)}${(task.tags || []).length > 3 ? `<span class="chip">+${task.tags.length - 3}</span>` : ''}</div>
          <div class="task-rate">${task.solvedRate}%</div>
          <div class="task-time">${task.timeMin} мин</div>
        </a>`;
    }).join('');
  }

  function renderQuickStats() {
    const host = document.getElementById('quickStats');
    const stats = Store.stats();
    const tasks = Store.tasks();
    host.innerHTML = `
      <span class="badge">${tasks.length} задач</span>
      <span class="badge badge-ok">с ревью: ${stats.reviewed}</span>
      <span class="badge badge-info">в работе: ${stats.inProgress}</span>
      ${stats.avgScore ? `<span class="badge badge-accent">средний балл ревью: ${stats.avgScore}/100</span>` : ''}
      ${stats.assessment ? `<span class="badge badge-violet">уровень: ${AppUI.esc(stats.assessment.grade.name)}</span>` : '<a class="badge" href="assessment.html" style="cursor:pointer">определить уровень →</a>'}
    `;
  }

  /* ---------- общий цикл ---------- */

  function update() {
    writeUrl();
    renderLevelFilters();
    renderCollectionFilters();
    renderStatusFilters();
    renderTagFilters();
    renderActiveFilters();
    renderList();
    renderQuickStats();
  }

  function resetAll() {
    state.q = '';
    state.levels.clear();
    state.tags.clear();
    state.collections.clear();
    state.statuses.clear();
    state.sort = 'recommended';
    const search = document.getElementById('searchInput');
    if (search) search.value = '';
    const sort = document.getElementById('sortSelect');
    if (sort) sort.value = 'recommended';
    update();
  }

  document.addEventListener('DOMContentLoaded', () => {
    AppUI.mountHeader('catalog');
    AppUI.mountFooter();
    readUrl();

    const search = document.getElementById('searchInput');
    search.value = state.q;
    search.addEventListener('input', AppUI.debounce(() => {
      state.q = search.value.trim();
      update();
    }, 220));

    const sort = document.getElementById('sortSelect');
    sort.value = state.sort;
    sort.addEventListener('change', () => {
      state.sort = sort.value;
      update();
    });

    document.getElementById('resetFilters').addEventListener('click', resetAll);
    document.getElementById('clearTags').addEventListener('click', () => {
      state.tags.clear();
      update();
    });

    update();
  });
})();
