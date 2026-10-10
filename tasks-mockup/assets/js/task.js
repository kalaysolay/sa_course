/* ============================================================
   task.js — рабочее место задачи
   Слева: условие. Справа: вкладки решения (документ / PlantUML / Mermaid).
   Внизу: процесс ревью → ответ двух агентов → история попыток.
   ============================================================ */

(function () {

  const TAB_TYPES = {
    doc: { label: 'Документ', kind: 'doc', icon: '¶' },
    plantuml: { label: 'PlantUML', kind: 'puml', icon: '◩' },
    mermaid: { label: 'Mermaid', kind: 'mmd', icon: '◭' }
  };

  let task = null;
  let solution = null;          // { tabs, activeTabId, updatedAt }
  let activeAttempt = null;     // попытка, которую сейчас показываем
  let saveTimer = null;
  let startedAt = Date.now();
  let timerId = null;
  let reviewRunning = false;

  const el = {};

  /* ==================== инициализация ==================== */

  document.addEventListener('DOMContentLoaded', async () => {
    AppUI.mountHeader('catalog');
    AppUI.mountFooter();

    ['crumbs', 'taskHost', 'reviewProgressSection', 'reviewResultSection', 'attemptsSection', 'relatedSection']
      .forEach((id) => { el[id] = document.getElementById(id); });

    const id = AppUI.qs('id');
    task = id ? Store.task(id) : null;

    if (!task) {
      el.taskHost.innerHTML = `
        <div class="empty-state">
          <h3>Задача не найдена</h3>
          <p class="muted" style="margin-bottom:16px">Возможно, ссылка устарела. Выберите задачу из каталога.</p>
          <a class="btn btn-primary" href="catalog.html">В каталог</a>
        </div>`;
      return;
    }

    document.title = `${task.title} — AnalystGym`;
    solution = loadSolution();
    // Серверный черновик подтягиваем до отрисовки — но только когда
    // локального нет: локальные правки всегда важнее серверной копии.
    await pullServerDraft();
    activeAttempt = Store.lastAttempt(task.id);

    renderCrumbs();
    renderWorkspace();
    renderRelated();
    bindTabBar();
    mountActiveTab();
    startTimer();

    const last = Store.lastAttempt(task.id);
    if (last && last.status === 'in_review') {
      /* ревью не завершилось (обновление страницы) — перезапускаем на сохранённом снимке */
      if (last.server && window.Api && Api.serverPractice()) startServerPoll(last, { resume: true });
      else startReview(last, { resume: true });
    } else if (last && last.status === 'reviewed') {
      showReview(last);
    }

    renderAttempts();
  });

  function loadSolution() {
    const saved = Store.solution(task.id);
    if (saved && saved.tabs && saved.tabs.length) return saved;
    const tabs = (task.starterTabs || []).map((tab, index) => ({
      id: 'tab_' + index + '_' + Math.random().toString(36).slice(2, 6),
      type: tab.type,
      title: tab.title,
      content: tab.content || ''
    }));
    if (!tabs.length) {
      tabs.push({ id: 'tab_doc_1', type: 'doc', title: 'Решение', content: '' });
    }
    return { tabs, activeTabId: tabs[0].id, updatedAt: null };
  }

  function persist() {
    Store.saveSolution(task.id, solution);
    paintSaved();
    scheduleServerDraft();
  }

  /* Черновик на сервер — best-effort копией: локальный Store первичен,
     сервер нужен для другого устройства. Ошибки глотаем молча, иначе
     каждое движение курсора без сети давало бы тосты. */
  let serverDraftTimer = null;
  function scheduleServerDraft() {
    if (!window.Api || !Api.serverPractice()) return;
    clearTimeout(serverDraftTimer);
    serverDraftTimer = setTimeout(() => {
      Api.saveDraft(task.id, solution.tabs).catch(() => {});
    }, 1500);
  }

  /* Серверный черновик забираем только когда локального нет вообще. */
  async function pullServerDraft() {
    try {
      if (!window.Api) return;
      await Api.ready;
      if (!Api.serverPractice()) return;
      if (Store.solution(task.id)) return;
      const draft = await Api.getDraft(task.id);
      const tabs = draft && Array.isArray(draft.tabs) ? draft.tabs.filter((t) => t && t.type) : [];
      if (!tabs.length) return;
      const activeOk = tabs.some((t) => t.id && (!solution.activeTabId || t.id === solution.activeTabId));
      solution = { tabs, activeTabId: activeOk && solution.activeTabId ? solution.activeTabId : tabs[0].id, updatedAt: null };
      Store.saveSolution(task.id, solution);
    } catch (error) {
      /* сервера нет или черновика нет — остаёмся на стартовых вкладках */
    }
  }

  function schedulePersist() {
    const dot = document.getElementById('saveDot');
    if (dot) dot.classList.add('busy');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 450);
  }

  function paintSaved() {
    const dot = document.getElementById('saveDot');
    const label = document.getElementById('saveLabel');
    if (dot) dot.classList.remove('busy');
    if (label) {
      const saved = Store.solution(task.id);
      label.textContent = saved && saved.updatedAt
        ? `черновик сохранён ${new Date(saved.updatedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`
        : 'черновик не сохранён';
    }
    const words = document.getElementById('wordCount');
    if (words) {
      const text = solution.tabs
        .filter((t) => t.type === 'doc')
        .map((t) => String(t.content || '').replace(/<[^>]*>/g, ' '))
        .join(' ');
      const count = text.trim() ? text.trim().split(/\s+/).length : 0;
      words.textContent = `${count} ${AppUI.plural(count, ['слово', 'слова', 'слов'])} · ${solution.tabs.length} ${AppUI.plural(solution.tabs.length, ['вкладка', 'вкладки', 'вкладок'])}`;
    }
  }

  function startTimer() {
    const node = document.getElementById('taskTimer');
    if (!node) return;
    timerId = setInterval(() => {
      const sec = Math.floor((Date.now() - startedAt) / 1000);
      const mm = String(Math.floor(sec / 60)).padStart(2, '0');
      const ss = String(sec % 60).padStart(2, '0');
      node.textContent = `${mm}:${ss}`;
    }, 1000);
  }

  /* ==================== крошки и навигация ==================== */

  function renderCrumbs() {
    const all = Store.tasks();
    const index = all.findIndex((t) => t.id === task.id);
    const prev = index > 0 ? all[index - 1] : null;
    const next = index >= 0 && index < all.length - 1 ? all[index + 1] : null;
    const collections = Store.collectionsOfTask(task.id);

    el.crumbs.innerHTML = `
      <a href="catalog.html">Каталог</a>
      ${collections.length ? `<span class="sep">/</span><a href="collections.html#${AppUI.esc(collections[0].id)}">${AppUI.esc(collections[0].name)}</a>` : ''}
      <span class="sep">/</span>
      <span style="color:var(--text-2)">${AppUI.esc(task.title.slice(0, 60))}${task.title.length > 60 ? '…' : ''}</span>
      <div class="grow"></div>
      ${prev ? `<a href="task.html?id=${AppUI.esc(prev.id)}" title="${AppUI.esc(prev.title)}">← предыдущая</a>` : ''}
      ${next ? `<a href="task.html?id=${AppUI.esc(next.id)}" title="${AppUI.esc(next.title)}">следующая →</a>` : ''}
    `;
  }

  /* ==================== рабочая область ==================== */

  function renderWorkspace() {
    const collections = Store.collectionsOfTask(task.id);
    el.taskHost.innerHTML = `
      <div class="workspace">
        <!-- ---------- УСЛОВИЕ ---------- -->
        <section class="pane" aria-label="Условие задачи">
          <div class="pane-head">
            <div>
              <div class="title">${AppUI.esc(task.title)}</div>
              <div class="row mt-8" style="gap:8px;flex-wrap:wrap">
                ${AppUI.levelPill(task.level)}
                <span class="badge">${task.timeMin} мин</span>
                <span class="badge">решили ${task.solvedRate}%</span>
                <span class="badge badge-info">${task.attempts} ${AppUI.plural(task.attempts, ['попытка', 'попытки', 'попыток'])}</span>
                ${collections.map((c) => `<span class="badge">${AppUI.esc(c.icon || '')} ${AppUI.esc(c.name)}</span>`).join('')}
              </div>
            </div>
          </div>
          <div class="pane-scroll">
            <div class="statement">
              <div class="info-box" style="margin-top:0">
                <div class="ib-title">Коротко</div>
                <p style="margin:0">${task.statement.brief}</p>
              </div>
              ${renderStatement()}
              ${renderRubric()}
              ${renderHints()}
              ${renderAuthorSolution()}
            </div>
          </div>
        </section>

        <!-- ---------- РЕШЕНИЕ ---------- -->
        <section class="pane" aria-label="Ваше решение">
          <div class="pane-head">
            <span class="panel-title">Ваше решение</span>
            <span class="badge" id="taskTimerWrap">на задаче <b id="taskTimer" style="margin-left:4px">00:00</b></span>
            <div class="actions">
              <button class="btn btn-ghost btn-sm" type="button" id="resetSolution" title="Вернуть стартовые вкладки">Сбросить</button>
              <button class="btn btn-primary btn-sm" type="button" id="submitBtn">Отправить решение</button>
            </div>
          </div>
          <div class="tabs-bar" id="tabsBar" role="tablist"></div>
          <div class="tab-panel" id="tabPanel"></div>
          <div class="solution-foot">
            <span class="save-dot" id="saveDot"></span>
            <span id="saveLabel">черновик</span>
            <span class="dim">·</span>
            <span id="wordCount"></span>
            <div class="grow"></div>
            <span class="dim">Ctrl+S — сохранить и отправить</span>
          </div>
        </section>
      </div>`;

    document.getElementById('submitBtn').addEventListener('click', askSubmit);
    document.getElementById('resetSolution').addEventListener('click', resetSolution);
    document.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && String(event.key).toLowerCase() === 's') {
        event.preventDefault();
        askSubmit();
      }
    });
    paintSaved();
  }

  function renderStatement() {
    const s = task.statement;
    const list = (items, ordered) => {
      const tag = ordered ? 'ol' : 'ul';
      return `<${tag}>${items.map((i) => `<li>${i}</li>`).join('')}</${tag}>`;
    };
    return `
      <h2>Контекст</h2>
      ${s.context.map((p) => `<p>${p}</p>`).join('')}
      <h2>Что нужно сделать</h2>
      <p><strong>${s.goal}</strong></p>
      <h2>Входные данные</h2>
      ${list(s.inputs)}
      <h2>Что должно быть в решении</h2>
      ${list(s.deliverables, true)}
      <h2>Ограничения</h2>
      ${list(s.constraints)}
      <blockquote><strong>Как это звучит на собеседовании.</strong><br>${s.interview}</blockquote>
    `;
  }

  function renderRubric() {
    const items = task.rubric || [];
    const weightLabel = { high: 'ключевой', mid: 'важный', low: 'плюс' };
    return `
      <details class="fold">
        <summary>Критерии оценки · ${items.length} ${AppUI.plural(items.length, ['пункт', 'пункта', 'пунктов'])}</summary>
        <div class="fold-body">
          <p class="muted" style="font-size:12.5px;margin-bottom:12px">
            Ревью оценивает не «верно/неверно», а качество решения: агенты идут по этому списку
            и ищут подтверждения в вашем тексте.
          </p>
          <ul class="rubric-list">
            ${items.map((c) => `<li><span class="w ${c.weight === 'high' ? 'high' : c.weight === 'mid' ? 'mid' : ''}">${weightLabel[c.weight] || ''}</span><span>${AppUI.esc(c.title)}</span></li>`).join('')}
          </ul>
        </div>
      </details>`;
  }

  function renderHints() {
    const hints = task.hints || [];
    if (!hints.length) return '';
    return `
      <details class="fold" id="hintsFold">
        <summary>Подсказки · ${hints.length}</summary>
        <div class="fold-body">
          <div id="hintsHost">
            <p class="muted" style="font-size:13px">Подсказки открываются по одной — так полезнее для тренировки.</p>
          </div>
          <button class="btn btn-ghost btn-sm mt-16" type="button" id="hintBtn">Показать подсказку</button>
        </div>
      </details>`;
  }

  function renderAuthorSolution() {
    const author = task.authorSolution || {};
    const hasContent = author.doc || author.plantuml || author.mermaid;
    if (!hasContent) return '';
    return `
      <details class="fold" id="authorFold">
        <summary>Эталонное решение автора</summary>
        <div class="fold-body" id="authorBody">
          <div class="info-box" style="margin-top:0">
            <div class="ib-title">Спойлер</div>
            <p style="margin:0;font-size:13px">Смотреть эталон имеет смысл после собственного решения и ревью — иначе тренировка теряет смысл.</p>
          </div>
        </div>
      </details>`;
  }

  function mountAuthorSolution() {
    const body = document.getElementById('authorBody');
    if (!body || body.dataset.mounted === 'true') return;
    body.dataset.mounted = 'true';
    const author = task.authorSolution || {};
    const parts = [];
    if (author.doc) parts.push(author.doc);
    if (author.plantuml) parts.push(`<h3 style="font-size:14px;margin:18px 0 6px">Схема (PlantUML)</h3>${AppUI.embedDiagram('plantuml', author.plantuml)}`);
    if (author.mermaid) parts.push(`<h3 style="font-size:14px;margin:18px 0 6px">Схема (Mermaid)</h3>${AppUI.embedDiagram('mermaid', author.mermaid)}`);
    body.insertAdjacentHTML('beforeend', `<div class="statement" style="padding:0">${parts.join('')}</div>`);
    AppUI.renderEmbeddedDiagrams(body);
  }

  /* ==================== вкладки ==================== */

  function bindTabBar() {
    const bar = document.getElementById('tabsBar');
    if (!bar) return;

    bar.addEventListener('click', (event) => {
      const addBtn = event.target.closest('#addTabBtn');
      if (addBtn) {
        event.stopPropagation();
        AppUI.menu(addBtn, [
          { id: 'doc', label: 'Документ (WYSIWYG)', hint: '¶', onSelect: () => addTab('doc') },
          { id: 'plantuml', label: 'Диаграмма PlantUML', hint: 'puml', onSelect: () => addTab('plantuml') },
          { id: 'mermaid', label: 'Диаграмма Mermaid', hint: 'mmd', onSelect: () => addTab('mermaid') },
          { separator: true },
          { id: 'rename', label: 'Переименовать активную вкладку', onSelect: renameTab },
          { id: 'duplicate', label: 'Дублировать активную вкладку', onSelect: duplicateTab }
        ]);
        return;
      }

      const closeBtn = event.target.closest('[data-close-tab]');
      if (closeBtn) {
        event.stopPropagation();
        removeTab(closeBtn.dataset.closeTab);
        return;
      }

      const tabBtn = event.target.closest('[data-tab-id]');
      if (tabBtn) {
        solution.activeTabId = tabBtn.dataset.tabId;
        persist();
        mountActiveTab();
      }
    });

    bar.addEventListener('dblclick', (event) => {
      if (event.target.closest('[data-tab-id]')) renameTab();
    });
  }

  function paintTabs() {
    const bar = document.getElementById('tabsBar');
    if (!bar) return;
    bar.innerHTML = solution.tabs.map((tab) => {
      const type = TAB_TYPES[tab.type] || TAB_TYPES.doc;
      const selected = tab.id === solution.activeTabId;
      return `
        <button type="button" class="tab" role="tab" data-tab-id="${AppUI.esc(tab.id)}" aria-selected="${selected}" title="Двойной клик — переименовать">
          <span class="kind">${type.kind}</span>
          <span>${AppUI.esc(tab.title)}</span>
          ${solution.tabs.length > 1 ? `<span class="close" data-close-tab="${AppUI.esc(tab.id)}" title="Закрыть вкладку">×</span>` : ''}
        </button>`;
    }).join('') + `<button type="button" class="tab-add" id="addTabBtn">+ вкладка</button>`;
  }

  function addTab(type) {
    const count = solution.tabs.filter((t) => t.type === type).length + 1;
    const title = type === 'doc' ? `Документ ${count}` : `${TAB_TYPES[type].label} ${count}`;
    const stub = type === 'plantuml'
      ? '@startuml\n\n@enduml\n'
      : type === 'mermaid'
        ? 'flowchart TD\n  A[Начало] --> B[Что дальше?]\n'
        : '<h3>Раздел решения</h3><p></p>';
    const tab = { id: 'tab_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), type, title, content: stub };
    solution.tabs.push(tab);
    solution.activeTabId = tab.id;
    persist();
    mountActiveTab();
  }

  function removeTab(id) {
    const tab = solution.tabs.find((t) => t.id === id);
    if (!tab) return;
    AppUI.confirm({
      title: 'Закрыть вкладку?',
      text: `«${tab.title}» будет удалена вместе с содержимым. Отменить это действие нельзя.`,
      confirmText: 'Закрыть вкладку',
      danger: true
    }).then((ok) => {
      if (!ok) return;
      solution.tabs = solution.tabs.filter((t) => t.id !== id);
      if (solution.activeTabId === id) solution.activeTabId = solution.tabs[0].id;
      persist();
      mountActiveTab();
      AppUI.toast('Вкладка закрыта');
    });
  }

  function renameTab() {
    const tab = solution.tabs.find((t) => t.id === solution.activeTabId);
    if (!tab) return;
    const dialog = AppUI.modal({
      title: 'Название вкладки',
      html: `<div class="field"><label for="tabTitleInput">Как подписать вкладку</label><input id="tabTitleInput" type="text" value="${AppUI.esc(tab.title)}" maxlength="60"></div>`,
      closeText: 'Готово'
    });
    const input = dialog.body.querySelector('#tabTitleInput');
    input.focus();
    input.select();
    const apply = () => {
      const value = input.value.trim();
      if (value) tab.title = value;
      persist();
      paintTabs();
      dialog.close();
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); apply(); } });
    dialog.root.querySelector('[data-role="close"]').addEventListener('click', apply);
  }

  function duplicateTab() {
    const tab = solution.tabs.find((t) => t.id === solution.activeTabId);
    if (!tab) return;
    const copy = Object.assign({}, tab, { id: 'tab_' + Date.now().toString(36), title: tab.title + ' (копия)' });
    solution.tabs.splice(solution.tabs.indexOf(tab) + 1, 0, copy);
    solution.activeTabId = copy.id;
    persist();
    mountActiveTab();
  }

  function resetSolution() {
    AppUI.confirm({
      title: 'Сбросить решение?',
      text: 'Все вкладки вернутся к стартовому состоянию задачи. Написанное будет удалено, но отправленные ранее ревью останутся в истории.',
      confirmText: 'Сбросить',
      danger: true
    }).then((ok) => {
      if (!ok) return;
      Store.clearSolution(task.id);
      solution = loadSolution();
      paintTabs();
      mountActiveTab();
      paintSaved();
      AppUI.toast('Решение сброшено к стартовому', 'warn');
    });
  }

  function activeTab() {
    return solution.tabs.find((t) => t.id === solution.activeTabId) || solution.tabs[0];
  }

  function mountActiveTab() {
    paintTabs();
    const panel = document.getElementById('tabPanel');
    if (!panel) return;
    const tab = activeTab();
    if (!tab) { panel.innerHTML = ''; return; }
    panel.innerHTML = '';
    if (tab.type === 'doc') mountDocEditor(panel, tab);
    else mountDiagramEditor(panel, tab);

    const fold = document.getElementById('authorFold');
    if (fold && !fold.dataset.bound) {
      fold.dataset.bound = 'true';
      fold.addEventListener('toggle', () => { if (fold.open) mountAuthorSolution(); });
    }
    const hintsFold = document.getElementById('hintsFold');
    if (hintsFold && !hintsFold.dataset.bound) {
      hintsFold.dataset.bound = 'true';
      let shown = 0;
      const host = document.getElementById('hintsHost');
      const button = document.getElementById('hintBtn');
      button.addEventListener('click', () => {
        if (shown >= (task.hints || []).length) return;
        const hint = task.hints[shown];
        shown += 1;
        const node = document.createElement('div');
        node.className = 'info-box';
        node.innerHTML = `<div class="ib-title">Подсказка ${shown}</div><p style="margin:0;font-size:13px">${AppUI.esc(hint)}</p>`;
        host.append(node);
        if (shown >= task.hints.length) {
          button.textContent = 'Все подсказки показаны';
          button.disabled = true;
        }
      });
    }
  }

  /* ---------- WYSIWYG ---------- */

  const DOC_TOOLS = [
    { cmd: 'formatBlock', value: 'h2', label: 'H2', title: 'Заголовок раздела' },
    { cmd: 'formatBlock', value: 'h3', label: 'H3', title: 'Подзаголовок' },
    { cmd: 'formatBlock', value: 'p', label: '¶', title: 'Обычный текст' },
    { sep: true },
    { cmd: 'bold', label: 'B', title: 'Жирный (Ctrl+B)', style: 'font-weight:700' },
    { cmd: 'italic', label: 'I', title: 'Курсив (Ctrl+I)', style: 'font-style:italic' },
    { cmd: 'underline', label: 'U', title: 'Подчёркнутый (Ctrl+U)', style: 'text-decoration:underline' },
    { cmd: 'strikeThrough', label: 'S', title: 'Зачёркнутый', style: 'text-decoration:line-through' },
    { sep: true },
    { cmd: 'insertUnorderedList', label: '•—', title: 'Маркированный список' },
    { cmd: 'insertOrderedList', label: '1.', title: 'Нумерованный список' },
    { cmd: 'formatBlock', value: 'blockquote', label: '❝', title: 'Цитата / вывод' },
    { sep: true },
    { action: 'code', label: '</>', title: 'Фрагмент кода' },
    { action: 'pre', label: 'PRE', title: 'Блок кода' },
    { action: 'link', label: '🔗', title: 'Ссылка' },
    { action: 'table', label: '▦', title: 'Таблица' },
    { action: 'hr', label: '—', title: 'Разделитель' },
    { sep: true },
    { cmd: 'removeFormat', label: '⌫', title: 'Очистить форматирование' },
    { cmd: 'undo', label: '↶', title: 'Отменить' },
    { cmd: 'redo', label: '↷', title: 'Повторить' }
  ];

  function mountDocEditor(panel, tab) {
    panel.innerHTML = `
      <div class="editor-toolbar" id="editorToolbar">
        ${DOC_TOOLS.map((tool) => tool.sep
          ? '<span class="sep"></span>'
          : `<button type="button" data-cmd="${AppUI.esc(tool.cmd || '')}" data-value="${AppUI.esc(tool.value || '')}" data-action="${AppUI.esc(tool.action || '')}" title="${AppUI.esc(tool.title || '')}" style="${AppUI.esc(tool.style || '')}">${AppUI.esc(tool.label)}</button>`).join('')}
        <span class="hint">простой WYSIWYG · автосохранение</span>
      </div>
      <div class="wysiwyg" id="docEditor" contenteditable="true" spellcheck="true"
           data-placeholder="Опишите решение: контекст, ваше предложение, альтернативы, цифры. Структурируйте заголовками — ревью читает и её.">${tab.content || ''}</div>`;

    const editor = document.getElementById('docEditor');

    editor.addEventListener('input', () => {
      tab.content = editor.innerHTML;
      schedulePersist();
    });
    editor.addEventListener('blur', () => { tab.content = editor.innerHTML; persist(); });
    editor.addEventListener('paste', (event) => {
      event.preventDefault();
      const text = (event.clipboardData || window.clipboardData).getData('text/plain');
      document.execCommand('insertText', false, text);
    });

    document.getElementById('editorToolbar').addEventListener('mousedown', (event) => {
      const button = event.target.closest('button');
      if (!button) return;
      event.preventDefault();
      editor.focus();

      if (button.dataset.cmd) {
        if (button.dataset.cmd === 'formatBlock') {
          document.execCommand('formatBlock', false, `<${button.dataset.value}>`);
        } else {
          document.execCommand(button.dataset.cmd, false, null);
        }
      }

      switch (button.dataset.action) {
        case 'code': {
          const selection = window.getSelection().toString();
          document.execCommand('insertHTML', false, `<code>${AppUI.esc(selection || 'код')}</code>&nbsp;`);
          break;
        }
        case 'pre': {
          const selection = window.getSelection().toString();
          document.execCommand('insertHTML', false, `<pre><code>${AppUI.esc(selection || '// код')}</code></pre><p><br></p>`);
          break;
        }
        case 'link': {
          const url = window.prompt('Ссылка', 'https://');
          if (url) document.execCommand('createLink', false, url);
          break;
        }
        case 'table': {
          document.execCommand('insertHTML', false,
            '<table><thead><tr><th>Параметр</th><th>Значение</th><th>Комментарий</th></tr></thead><tbody><tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr><tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr></tbody></table><p><br></p>');
          break;
        }
        case 'hr':
          document.execCommand('insertHTML', false, '<hr><p><br></p>');
          break;
        default: break;
      }

      tab.content = editor.innerHTML;
      schedulePersist();
      paintToolbarState(editor);
    });

    if (!document.documentElement.dataset.selectionBound) {
      document.documentElement.dataset.selectionBound = 'true';
      document.addEventListener('selectionchange', () => {
        const editor = document.getElementById('docEditor');
        if (editor && document.activeElement === editor) paintToolbarState(editor);
      });
    }
  }

  function paintToolbarState() {
    const toolbar = document.getElementById('editorToolbar');
    if (!toolbar) return;
    toolbar.querySelectorAll('button[data-cmd]').forEach((button) => {
      const cmd = button.dataset.cmd;
      if (!cmd || cmd === 'formatBlock' || cmd === 'undo' || cmd === 'redo' || cmd === 'removeFormat') return;
      try {
        button.dataset.active = String(document.queryCommandState(cmd));
      } catch (error) {
        button.dataset.active = 'false';
      }
    });
  }

  /* ---------- редактор диаграмм ---------- */

  function mountDiagramEditor(panel, tab) {
    const type = tab.type;
    const snippets = AppUI.diagramSnippets[type] || [];
    panel.innerHTML = `
      <div class="diagram-editor">
        <div class="diagram-toolbar">
          <span>${type === 'plantuml' ? 'PlantUML · рендер в браузере' : 'Mermaid · рендер в браузере'}</span>
          <span class="spacer"></span>
          ${snippets.map((s) => `<button type="button" class="snippet-btn" data-snippet="${AppUI.esc(s.id)}">${AppUI.esc(s.label)}</button>`).join('')}
          <button type="button" class="snippet-btn" data-layout="toggle" title="Код / превью рядом или друг под другом">⇄ раскладка</button>
          <button type="button" class="snippet-btn" data-render="now">▶ обновить</button>
        </div>
        <div class="diagram-split" id="diagramSplit">
          <textarea class="code-area" id="diagramCode" spellcheck="false" placeholder="${type === 'plantuml' ? '@startuml … @enduml' : 'flowchart TD …'}">${AppUI.esc(tab.content || '')}</textarea>
          <div class="preview-area" id="diagramPreview"></div>
        </div>
      </div>`;

    const code = document.getElementById('diagramCode');
    const preview = document.getElementById('diagramPreview');
    let renderTimer = null;

    const scheduleRender = () => {
      clearTimeout(renderTimer);
      renderTimer = setTimeout(() => AppUI.renderDiagram(preview, type, code.value), 700);
    };

    code.addEventListener('input', () => {
      tab.content = code.value;
      schedulePersist();
      scheduleRender();
    });

    /* Tab вставляет пробелы, а не уводит фокус */
    code.addEventListener('keydown', (event) => {
      if (event.key === 'Tab') {
        event.preventDefault();
        const start = code.selectionStart;
        const end = code.selectionEnd;
        code.value = code.value.slice(0, start) + '  ' + code.value.slice(end);
        code.selectionStart = code.selectionEnd = start + 2;
        tab.content = code.value;
        schedulePersist();
        scheduleRender();
      }
    });

    panel.querySelector('.diagram-toolbar').addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (!button) return;
      if (button.dataset.render) {
        AppUI.renderDiagram(preview, type, code.value);
        return;
      }
      if (button.dataset.layout) {
        document.getElementById('diagramSplit').classList.toggle('stacked');
        return;
      }
      const snippet = snippets.find((s) => s.id === button.dataset.snippet);
      if (!snippet) return;
      const isEmpty = !code.value.trim() || /^@(start|end)uml\s*$/i.test(code.value.trim()) || /^flowchart TD\s*A\[.*\]\s*-->.*$/s.test(code.value.trim());
      if (isEmpty || window.confirm('Заменить текущий код диаграммы шаблоном?')) {
        code.value = snippet.code;
        tab.content = snippet.code;
        persist();
        AppUI.renderDiagram(preview, type, code.value);
      }
    });

    AppUI.renderDiagram(preview, type, code.value);
  }

  /* ==================== отправка решения ==================== */

  function solutionStats() {
    const docText = solution.tabs
      .filter((t) => t.type === 'doc')
      .map((t) => String(t.content || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' '))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    const diagrams = solution.tabs.filter((t) => t.type !== 'doc' && String(t.content || '').trim().length > 40);
    return { words: docText ? docText.split(' ').length : 0, diagrams: diagrams.length, tabs: solution.tabs.length };
  }

  function askSubmit() {
    if (reviewRunning) {
      AppUI.toast('Ревью уже идёт — дождитесь результата', 'warn');
      return;
    }
    persist();
    const stats = solutionStats();
    const empty = stats.words < 20 && stats.diagrams === 0;

    AppUI.confirm({
      title: 'Отправить решение на ревью?',
      text: empty
        ? 'Похоже, решение почти пустое. Агенты оценят его минимально — но отправить можно: иногда полезно увидеть, что именно не засчитано.'
        : 'Решение уйдёт двум агентам: системному аналитику и архитектору. Они разберут его по критериям задачи.',
      checklist: [
        `Вкладок в решении: ${stats.tabs}`,
        `Объём документа: ${stats.words} ${AppUI.plural(stats.words, ['слово', 'слова', 'слов'])}`,
        `Диаграмм с содержимым: ${stats.diagrams}`,
        'Результат сохранится в истории — можно отправить повторно и сравнить'
      ],
      confirmText: 'Отправить на ревью',
      cancelText: 'Ещё допишу'
    }).then((ok) => {
      if (!ok) return;
      submit();
    });
  }

  function submit() {
    // Вошли и сервер рядом — решение считает бэк (Фаза 2), иначе как раньше локально.
    if (window.Api && Api.serverPractice()) {
      serverSubmit();
      return;
    }
    const attempt = {
      id: 'att_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      taskId: task.id,
      submittedAt: new Date().toISOString(),
      status: 'in_review',
      tabs: JSON.parse(JSON.stringify(solution.tabs)),
      review: null
    };
    Store.addAttempt(task.id, attempt);
    activeAttempt = attempt;
    renderAttempts();
    startReview(attempt, {});
  }

  /* ==================== отправка через бэк (Фаза 2) ==================== */

  async function serverSubmit() {
    const tabs = JSON.parse(JSON.stringify(solution.tabs));
    const key = 'web_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    let res = null;
    try {
      res = await Api.submitAttempt(task.id, tabs, key);
    } catch (error) {
      // Сессия протухла посреди работы — не теряем решение, считаем локально.
      if (error && error.status === 401) {
        AppUI.toast('Сессия истекла — посчитаем ревью локально', 'warn');
        submitLocalFallback(tabs);
        return;
      }
      AppUI.toast('Не удалось отправить решение: ' + (error && error.message ? error.message : error), 'bad');
      return;
    }
    const attempt = {
      id: res.attemptId,
      taskId: task.id,
      submittedAt: new Date().toISOString(),
      status: 'in_review',
      tabs,
      review: null,
      server: true
    };
    Store.addAttempt(task.id, attempt);
    activeAttempt = attempt;
    renderAttempts();
    startServerPoll(attempt, {});
  }

  function submitLocalFallback(tabs) {
    const attempt = {
      id: 'att_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      taskId: task.id,
      submittedAt: new Date().toISOString(),
      status: 'in_review',
      tabs,
      review: null
    };
    Store.addAttempt(task.id, attempt);
    activeAttempt = attempt;
    renderAttempts();
    startReview(attempt, {});
  }

  const SERVER_STAGE_LABELS = { system: 'Подготовка', sa: 'Системный аналитик', arch: 'Архитектор', grading: 'Вердикт', done: 'Готово' };

  /* Polling статуса попытки: прогресс показывает воркер бэка. */
  function startServerPoll(attempt, options) {
    reviewRunning = true;
    el.reviewProgressSection.classList.remove('hidden');
    el.reviewResultSection.classList.add('hidden');
    el.reviewResultSection.innerHTML = '';
    renderProgressSkeleton();

    const bar = document.getElementById('reviewProgressBar');
    const label = document.getElementById('reviewProgressLabel');
    const submitBtn = document.getElementById('submitBtn');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Идёт ревью…'; }

    if (options && options.resume) {
      AppUI.toast('Ревью не завершилось в прошлый раз — проверяем статус на сервере', 'warn');
    }

    el.reviewProgressSection.scrollIntoView({ behavior: 'smooth', block: 'center' });

    const stepItems = Array.from(document.querySelectorAll('.rp-agent li[data-step]'));
    let failures = 0;
    const pollTimer = setInterval(async () => {
      let state = null;
      try {
        state = await Api.getAttempt(attempt.id);
        failures = 0;
      } catch (error) {
        failures += 1;
        if (failures >= 5) {
          clearInterval(pollTimer);
          reviewRunning = false;
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Отправить решение'; }
          el.reviewProgressSection.classList.add('hidden');
          AppUI.toast('Сервер недоступен — попробуйте отправить ещё раз', 'bad');
        }
        return;
      }
      const progress = Math.max(0, Math.min(100, state.progress || 0));
      bar.style.width = `${progress}%`;
      label.textContent = `${SERVER_STAGE_LABELS[state.stage] || 'Ревью'} · ${progress}%`;
      // Шаги зажигаем пропорционально прогрессу (всего их 10, как в движке).
      const lit = Math.round((progress / 100) * stepItems.length);
      stepItems.forEach((item, index) => {
        const done = index < lit;
        item.dataset.state = done ? 'done' : 'pending';
        item.querySelector('.mark').textContent = done ? '✓' : '·';
      });

      if (state.status === 'reviewed' && state.review) {
        clearInterval(pollTimer);
        reviewRunning = false;
        Store.updateAttempt(task.id, attempt.id, { status: 'reviewed', review: state.review });
        attempt.status = 'reviewed';
        attempt.review = state.review;
        activeAttempt = attempt;
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Отправить ещё раз'; }
        renderAttempts();
        showReview(attempt);
        AppUI.toast(`Ревью готово: ${state.review.grade.label} · ${state.review.grade.score}/100`, state.review.grade.code >= 4 ? 'ok' : 'warn');
      } else if (state.status === 'failed') {
        clearInterval(pollTimer);
        reviewRunning = false;
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Отправить решение'; }
        el.reviewProgressSection.classList.add('hidden');
        AppUI.toast('Ревью не удалось посчитать — попробуйте ещё раз', 'bad');
      }
    }, 1500);
  }

  /* ==================== процесс ревью ==================== */

  function renderProgressSkeleton() {
    const host = document.getElementById('rpAgents');
    const stages = ReviewEngine.stages;
    host.innerHTML = stages.map((stage) => {
      const persona = stage.id === 'sa' || stage.id === 'arch' ? ReviewEngine.agents[stage.id] : null;
      return `
        <div class="rp-agent" data-stage="${AppUI.esc(stage.id)}">
          <div class="rp-agent-head">
            ${persona
              ? `<span class="agent-avatar ${persona.id}">${AppUI.esc(persona.initials)}</span>`
              : '<span class="agent-avatar">⚙</span>'}
            <div>
              <div class="name">${AppUI.esc(persona ? persona.name : 'Подготовка')}</div>
              <div class="role">${AppUI.esc(persona ? persona.role : stage.label)}</div>
            </div>
          </div>
          <ul class="rp-steps">
            ${stage.steps.map((step, index) => `<li data-step="${index}" data-state="pending"><span class="mark">·</span><span>${AppUI.esc(step)}</span></li>`).join('')}
          </ul>
        </div>`;
    }).join('');
  }

  function startReview(attempt, options) {
    reviewRunning = true;
    el.reviewProgressSection.classList.remove('hidden');
    el.reviewResultSection.classList.add('hidden');
    el.reviewResultSection.innerHTML = '';
    renderProgressSkeleton();

    const bar = document.getElementById('reviewProgressBar');
    const label = document.getElementById('reviewProgressLabel');
    const submitBtn = document.getElementById('submitBtn');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Идёт ревью…'; }

    if (options && options.resume) {
      AppUI.toast('Ревью не завершилось в прошлый раз — запускаем снова', 'warn');
    }

    el.reviewProgressSection.scrollIntoView({ behavior: 'smooth', block: 'center' });

    ReviewEngine.runReview({
      task,
      tabs: attempt.tabs,
      fast: Boolean(options && options.fast),
      onEvent: (event) => {
        if (event.stageId === 'done') {
          bar.style.width = '100%';
          label.textContent = 'готово';
          return;
        }
        bar.style.width = `${event.progress}%`;
        label.textContent = `${event.stageLabel}: ${event.stepLabel}`;
        const card = document.querySelector(`.rp-agent[data-stage="${event.stageId}"]`);
        if (!card) return;
        const item = card.querySelector(`li[data-step="${event.stepIndex}"]`);
        if (!item) return;
        item.dataset.state = event.state;
        item.querySelector('.mark').textContent = event.state === 'done' ? '✓' : '·';
      }
    }).then((review) => {
      reviewRunning = false;
      Store.updateAttempt(task.id, attempt.id, { status: 'reviewed', review });
      attempt.status = 'reviewed';
      attempt.review = review;
      activeAttempt = attempt;
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Отправить ещё раз'; }
      renderAttempts();
      showReview(attempt);
      AppUI.toast(`Ревью готово: ${review.grade.label} · ${review.grade.score}/100`, review.grade.code >= 4 ? 'ok' : 'warn');
    }).catch((error) => {
      reviewRunning = false;
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Отправить решение'; }
      el.reviewProgressSection.classList.add('hidden');
      AppUI.toast('Не удалось завершить ревью: ' + (error && error.message ? error.message : error), 'bad');
    });
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('#speedUpBtn');
    if (!button) return;
    button.disabled = true;
    button.textContent = 'Ускоряем…';
    /* перезапускаем с флагом fast: в макете это честнее, чем подделывать события */
    const attempt = Store.lastAttempt(task.id);
    if (attempt && attempt.status === 'in_review') {
      // Серверное ревью и так считается за ~секунду — ускорять нечего.
      if (attempt.server) {
        AppUI.toast('Серверное ревью уже идёт — статус обновится сам', 'warn');
        button.disabled = false;
        button.textContent = 'Ускорить (демо)';
        return;
      }
      Store.removeAttempt(task.id, attempt.id);
      startReview(Store.addAttempt(task.id, Object.assign({}, attempt, { id: 'att_' + Date.now().toString(36) })), { fast: true });
    }
  });

  /* ==================== показ ревью ==================== */

  function showReview(attempt) {
    el.reviewProgressSection.classList.add('hidden');
    activeAttempt = attempt;
    renderReview(attempt);
    renderAttempts();
    requestAnimationFrame(() => {
      el.reviewResultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function gradeMeter(code) {
    return `<div class="grade-meter">${[1, 2, 3, 4, 5].map((n) => `<i class="${n <= code ? 'on-' + code : ''}"></i>`).join('')}</div>`;
  }

  function renderReview(attempt) {
    const review = attempt.review;
    if (!review) return;
    const grade = review.grade;
    const stats = review.stats;

    el.reviewResultSection.classList.remove('hidden');
    el.reviewResultSection.innerHTML = `
      <div class="panel">
        <div class="panel-head">
          <p class="panel-title">Ответ на решение · ${AppUI.esc(attempt.submittedAt ? AppUI.dateTime(attempt.submittedAt) : '')}</p>
          <div class="row" style="gap:8px">
            <span class="badge">агентов: 2</span>
            <span class="badge badge-violet">${AppUI.esc(review.engine)}</span>
          </div>
        </div>

        <!-- вердикт -->
        <div class="verdict-head">
          <div class="verdict-top">
            <div>
              <div class="mono" style="font-size:10.5px;letter-spacing:.12em;color:var(--dim);margin-bottom:6px">ВЕРДИКТ</div>
              <div class="verdict-label">${AppUI.esc(grade.headline)}</div>
              <div class="row" style="gap:10px;flex-wrap:wrap;margin-top:6px">
                <span class="badge badge-${grade.tone === 'accent' ? 'accent' : grade.tone === 'ok' ? 'ok' : grade.tone === 'warn' ? 'warn' : 'bad'}">${AppUI.esc(grade.label)}</span>
                <span class="badge">критериев закрыто: ${stats.criteriaHit} из ${stats.criteriaTotal}</span>
                <span class="badge">частично: ${stats.criteriaPartial}</span>
                <span class="badge">не раскрыто: ${stats.criteriaMiss}</span>
              </div>
            </div>
            <div style="margin-left:auto;text-align:right">
              <div class="verdict-grade" style="color:var(--${grade.tone === 'accent' ? 'accent' : grade.tone === 'ok' ? 'ok' : grade.tone === 'warn' ? 'warn' : 'bad'})">${grade.score}</div>
              <div class="mono" style="font-size:10.5px;color:var(--dim);letter-spacing:.08em">КАЧЕСТВО РЕШЕНИЯ</div>
            </div>
          </div>
          ${gradeMeter(grade.code)}
          <p class="verdict-summary mt-16">${AppUI.esc(review.summary)}</p>

          <div class="crit-card">
            <h5>Почему такая оценка</h5>
            ${review.why.map((line) => `<div class="crit-row" style="border:0;padding:4px 0"><span class="grow">${AppUI.esc(line)}</span></div>`).join('')}
          </div>

          <div class="verdict-stats">
            <div class="vstat"><span class="k">Объём решения</span><span class="v">${stats.words} слов · ${stats.tabs} вкладок</span></div>
            <div class="vstat"><span class="k">Диаграмм</span><span class="v">${stats.diagramTabs}</span></div>
            <div class="vstat"><span class="k">Агенты</span><span class="v">аналитик ${review.agents[0].score}/10 · архитектор ${review.agents[1].score}/10</span></div>
            <div class="vstat"><span class="k">Попытка</span><span class="v">${Store.attempts(task.id).indexOf(attempt) + 1} из ${Store.attempts(task.id).length}</span></div>
          </div>
        </div>

        <!-- агенты -->
        ${review.agents.map(renderAgent).join('')}

        <!-- рубрика -->
        <div class="review-agent">
          <div class="ra-head">
            <span class="ra-avatar" style="color:var(--accent);background:var(--accent-soft);border-color:rgba(211,242,106,.35)">РБ</span>
            <div>
              <div class="ra-name">Разбор по критериям задачи</div>
              <div class="ra-role">что учтено и что нет — с подтверждением из вашего текста</div>
            </div>
          </div>
          <div class="crit-card" style="margin-top:0">
            ${review.criteria.map((c) => {
              const cls = c.state === 'hit' ? 'hit' : c.state === 'partial' ? 'miss' : 'crit';
              const label = c.state === 'hit' ? 'учтено' : c.state === 'partial' ? 'частично' : 'не учтено';
              return `
                <div class="crit-row">
                  <span class="state ${cls}">${label}</span>
                  <span class="grow">
                    <span style="color:var(--text)">${AppUI.esc(c.title)}</span>
                    ${c.state === 'hit' && c.evidence ? `<div class="why">В решении: «${AppUI.esc(c.evidence)}»</div>` : ''}
                    ${c.state !== 'hit' && c.why ? `<div class="why">Почему важно: ${AppUI.esc(c.why)}</div>` : ''}
                  </span>
                  <span class="badge" style="align-self:flex-start">${typeof c.weightValue === 'number' ? `вес ${c.weightValue}` : c.weight === 'high' ? 'ключевой' : c.weight === 'mid' ? 'важный' : 'плюс'}</span>
                </div>`;
            }).join('')}
          </div>
        </div>

        <!-- что дальше -->
        <div class="review-foot">
          ${review.recommendations && review.recommendations.length ? `
            <div class="grow">
              <div class="mono" style="font-size:10.5px;color:var(--dim);letter-spacing:.1em;margin-bottom:8px">ЧТО ПОТРЕНИРОВАТЬ ДАЛЬШЕ</div>
              <div class="row" style="gap:8px;flex-wrap:wrap">
                ${review.recommendations.map((rec) => `<a class="btn btn-ghost btn-sm" href="task.html?id=${AppUI.esc(rec.id)}">${AppUI.esc(rec.title.slice(0, 44))}${rec.title.length > 44 ? '…' : ''} · ${AppUI.esc(Store.level(rec.level).name)}</a>`).join('')}
              </div>
            </div>` : '<div class="grow"></div>'}
          <span class="note">ревью ${AppUI.timeAgo(attempt.submittedAt)}</span>
          <button class="btn btn-outline btn-sm" type="button" id="openAuthorBtn">Смотреть эталон</button>
          <button class="btn btn-primary btn-sm" type="button" id="resubmitBtn">Доработать и отправить снова</button>
        </div>
      </div>`;

    document.getElementById('resubmitBtn').addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setTimeout(() => {
        const panel = document.querySelector('.pane[aria-label="Ваше решение"]');
        if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const editor = document.getElementById('docEditor');
        if (editor) editor.focus();
        AppUI.toast('Поправьте решение по замечаниям и отправьте ещё раз — сравним попытки', 'ok');
      }, 400);
    });

    document.getElementById('openAuthorBtn').addEventListener('click', () => {
      const fold = document.getElementById('authorFold');
      if (!fold) return;
      fold.open = true;
      mountAuthorSolution();
      fold.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  function renderAgent(agent) {
    return `
      <div class="review-agent ${AppUI.esc(agent.id)}">
        <div class="ra-head">
          <span class="ra-avatar ${AppUI.esc(agent.id)}">${AppUI.esc(agent.initials)}</span>
          <div>
            <div class="ra-name">${AppUI.esc(agent.name)}</div>
            <div class="ra-role">Агент · ${AppUI.esc(agent.role)}</div>
          </div>
          <div class="ra-score">
            <div class="num">${agent.score.toFixed(1)}</div>
            <div class="lbl">оценка / 10</div>
          </div>
        </div>

        <div class="row mb-16" style="gap:6px;flex-wrap:wrap">
          <span class="badge">покрыто ${agent.coverage}% моей зоны</span>
          ${agent.checks.map((c) => `<span class="chip">${AppUI.esc(c)}</span>`).join('')}
        </div>

        <div class="ra-cols">
          <div class="ra-block good">
            <h5><span class="dot"></span>Что учтено</h5>
            <ul class="ra-list">
              ${agent.covered.length
                ? agent.covered.map((item) => `<li><span class="ico">✓</span><span><strong>${AppUI.esc(item.title)}.</strong> ${AppUI.esc(item.detail)}</span></li>`).join('')
                : '<li><span class="ico">−</span><span class="muted">Пока не за что зацепиться: решение слишком общее. Начните со структуры ответа.</span></li>'}
            </ul>
          </div>
          <div class="ra-block miss">
            <h5><span class="dot"></span>Что не учтено</h5>
            <ul class="ra-list">
              ${agent.missed.length
                ? agent.missed.map((item) => `<li><span class="ico ${item.critical ? 'crit' : ''}">${item.critical ? '!' : '−'}</span><span><strong>${AppUI.esc(item.title)}.</strong> ${AppUI.esc(item.why || '')}${item.state === 'partial' ? ' <span class="dim">(затронуто, но не раскрыто)</span>' : ''}</span></li>`).join('')
                : '<li><span class="ico">✓</span><span class="muted">Существенных пробелов в моей зоне не нашлось.</span></li>'}
            </ul>
          </div>
        </div>

        <div class="ra-narrative">
          <span class="lbl">${agent.id === 'sa' ? 'Почему решение работает (или нет) с точки зрения аналитики' : 'Почему решение реализуемо (или нет)'}</span>
          ${AppUI.esc(agent.narrative)}
        </div>

        ${agent.improve.length ? `
          <div class="crit-card">
            <h5>Как усилить</h5>
            ${agent.improve.map((item) => `<div class="crit-row"><span class="grow"><span style="color:var(--text)">${AppUI.esc(item.title)}</span><div class="why">${AppUI.esc(item.detail)}</div></span></div>`).join('')}
          </div>` : ''}

        ${agent.questions.length ? `
          <div class="ra-questions crit-card">
            <h5>Что бы вас спросили на собеседовании</h5>
            <ol>${agent.questions.map((q) => `<li>${AppUI.esc(q)}</li>`).join('')}</ol>
          </div>` : ''}
      </div>`;
  }

  /* ==================== история попыток ==================== */

  function renderAttempts() {
    const attempts = Store.attempts(task.id);
    if (!attempts.length) {
      el.attemptsSection.classList.add('hidden');
      el.attemptsSection.innerHTML = '';
      return;
    }
    el.attemptsSection.classList.remove('hidden');
    el.attemptsSection.innerHTML = `
      <div class="panel">
        <div class="panel-head">
          <p class="panel-title">История попыток · ${attempts.length}</p>
          <span class="badge">динамика видна, если отправлять повторно</span>
        </div>
        <div class="panel-body" style="padding:12px">
          ${attempts.slice().reverse().map((attempt) => {
            const isActive = activeAttempt && attempt.id === activeAttempt.id;
            const grade = attempt.review ? attempt.review.grade : null;
            return `
              <div class="plan-item" style="margin-bottom:6px;${isActive ? 'border-color:rgba(211,242,106,.4)' : ''}">
                <span class="n">${AppUI.esc(AppUI.dateTime(attempt.submittedAt))}</span>
                <div>
                  <div class="t">${grade ? AppUI.esc(grade.label) : 'Ревью в процессе…'}</div>
                  <div class="s">${attempt.tabs.length} ${AppUI.plural(attempt.tabs.length, ['вкладка', 'вкладки', 'вкладок'])}${grade ? ` · критериев закрыто ${attempt.review.stats.criteriaHit}/${attempt.review.stats.criteriaTotal}` : ''}${isActive ? ' · сейчас открыта' : ''}</div>
                </div>
                <span class="row" style="gap:8px">
                  ${grade ? `<span class="badge badge-${grade.tone === 'accent' ? 'accent' : grade.tone === 'ok' ? 'ok' : grade.tone === 'warn' ? 'warn' : 'bad'}">${grade.score}/100</span>` : ''}
                  ${attempt.status === 'reviewed' ? `<button class="btn btn-ghost btn-sm" type="button" data-show-attempt="${AppUI.esc(attempt.id)}">Показать</button>` : ''}
                </span>
              </div>`;
          }).join('')}
        </div>
      </div>`;

    el.attemptsSection.querySelectorAll('[data-show-attempt]').forEach((button) => {
      button.addEventListener('click', () => {
        const attempt = Store.attempts(task.id).find((a) => a.id === button.dataset.showAttempt);
        if (attempt) showReview(attempt);
      });
    });
  }

  /* ==================== похожие задачи ==================== */

  function renderRelated() {
    const all = Store.tasks();
    const tags = new Set(task.tags || []);
    const related = all
      .filter((t) => t.id !== task.id)
      .map((t) => ({ t, overlap: (t.tags || []).filter((tag) => tags.has(tag)).length }))
      .filter((item) => item.overlap > 0)
      .sort((a, b) => b.overlap - a.overlap)
      .slice(0, 4);

    if (!related.length) {
      el.relatedSection.innerHTML = '';
      return;
    }

    el.relatedSection.innerHTML = `
      <div class="panel">
        <div class="panel-head">
          <p class="panel-title">Похожие задачи</p>
          <a class="link-btn" href="catalog.html">весь каталог →</a>
        </div>
        <div class="collection-tasks">
          ${related.map(({ t }) => `
            <a class="collection-task" href="task.html?id=${AppUI.esc(t.id)}">
              <span class="task-status" data-state="${AppUI.esc((AppUI.statusMeta[Store.status(t.id)] || {}).state || 'new')}">${(AppUI.statusMeta[Store.status(t.id)] || {}).icon || ''}</span>
              <span>${AppUI.esc(t.title)}</span>
              <span class="lvl">${AppUI.levelBadge(t.level)}</span>
            </a>`).join('')}
        </div>
      </div>`;
  }
})();
