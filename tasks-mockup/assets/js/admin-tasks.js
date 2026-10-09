/* ============================================================
   admin-tasks.js — раздел «Задачи»: список, карточка задачи,
   редактор рубрики (веса 1–10), симулятор скоринга.
   Правки живут в Store.taskEdits и сразу влияют на движок
   ревью (в макете сохранение = публикация ревизии).
   ============================================================ */

window.AdminTasks = (function () {

  const state = {
    q: '',
    level: 'all',
    status: 'all',
    openTaskId: null
  };

  let api = null;

  const STATUS_STYLE = {
    draft: 'badge',
    review: 'badge-info',
    published: 'badge-ok',
    archived: 'badge-bad'
  };

  function statusName(id) {
    const found = Store.taskStatuses().find((s) => s.id === id);
    return found ? found.name : id;
  }

  function statusBadge(status) {
    return `<span class="badge ${STATUS_STYLE[status] || 'badge'}">${AppUI.esc(statusName(status))}</span>`;
  }

  /* Детерминированная «дата создания» для задач из данных
     (у статики дат нет; у правок — реальная updatedAt) */
  function pseudoCreated(taskId) {
    let hash = 0;
    String(taskId).split('').forEach((ch) => { hash = ((hash * 31) + ch.charCodeAt(0)) >>> 0; });
    const date = new Date(Date.UTC(2026, 0, 3) + (hash % 240) * 86400000);
    return date.toLocaleDateString('ru-RU');
  }

  function attemptsStats(taskId) {
    const list = Store.attempts(taskId);
    const scores = list
      .filter((a) => a.review && a.review.grade)
      .map((a) => a.review.grade.score);
    return {
      count: list.length,
      avg: scores.length ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length) : null
    };
  }

  function blankTask() {
    return {
      __created: true,
      id: '',
      title: '',
      level: 'easy',
      status: 'draft',
      tags: [],
      timeMin: 30,
      solvedRate: 0,
      attempts: 0,
      statement: { brief: '', context: [], goal: '', inputs: [], deliverables: [], constraints: [], interview: '' },
      starterTabs: [{ type: 'doc', title: 'Решение', content: '' }],
      rubric: [],
      hints: [],
      interviewQuestions: [],
      authorSolution: { doc: '' }
    };
  }

  function currentTask() {
    if (state.openTaskId === '__new__') return blankTask();
    return Store.task(state.openTaskId);
  }

  function isEdited(taskId) {
    return Boolean((Store.all().taskEdits || {})[taskId]);
  }

  /* ==================== вход ==================== */

  function render(host, adminApi) {
    api = adminApi;
    if (state.openTaskId) renderCard(host);
    else renderList(host);
  }

  /* ==================== список ==================== */

  function filteredTasks() {
    const q = state.q.trim().toLowerCase();
    return Store.tasks().filter((task) => {
      if (state.level !== 'all' && task.level !== state.level) return false;
      if (state.status !== 'all' && Store.taskStatus(task.id) !== state.status) return false;
      if (q) {
        const hay = [task.title, task.id, (task.tags || []).map((id) => (Store.tag(id).name || '')).join(' ')].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function renderList(host) {
    const all = Store.tasks();
    const levels = Store.dictionaries().levels;
    const statuses = Store.taskStatuses();
    const published = all.filter((t) => Store.taskStatus(t.id) === 'published').length;
    const inWork = all.filter((t) => ['draft', 'review'].includes(Store.taskStatus(t.id))).length;
    const attemptsTotal = all.reduce((sum, t) => sum + Store.attempts(t.id).length, 0);
    const list = filteredTasks();

    host.innerHTML = `
      <div class="kpi-row">
        <div class="kpi"><div class="k">Всего задач</div><div class="v">${all.length}</div></div>
        <div class="kpi"><div class="k">Опубликовано</div><div class="v" style="color:var(--ok)">${published}</div></div>
        <div class="kpi"><div class="k">В работе</div><div class="v" style="color:var(--info)">${inWork}</div></div>
        <div class="kpi"><div class="k">Попыток студентов</div><div class="v">${attemptsTotal}</div></div>
      </div>

      <div class="panel">
        <div class="panel-head" style="flex-wrap:wrap;gap:10px">
          <div class="search" style="flex:1 1 220px">
            <span class="ico">⌕</span>
            <input id="taskSearch" type="search" placeholder="Название, id, метка…" value="${AppUI.esc(state.q)}">
          </div>
          <select class="select" id="taskLevelFilter">
            <option value="all">Все уровни</option>
            ${levels.map((l) => `<option value="${AppUI.esc(l.id)}" ${state.level === l.id ? 'selected' : ''}>${AppUI.esc(l.name)}</option>`).join('')}
          </select>
          <select class="select" id="taskStatusFilter">
            <option value="all">Все статусы</option>
            ${statuses.map((s) => `<option value="${s.id}" ${state.status === s.id ? 'selected' : ''}>${s.name}</option>`).join('')}
          </select>
          <button class="btn btn-primary btn-sm" type="button" id="newTaskBtn">+ Новая задача</button>
        </div>

        <div style="overflow:auto">
          <table class="data-table">
            <thead>
              <tr>
                <th style="width:30%">Задача</th>
                <th style="width:10%">Уровень</th>
                <th style="width:10%">Статус</th>
                <th style="width:8%;text-align:right">Попыток</th>
                <th style="width:9%;text-align:right">Ср. балл</th>
                <th style="width:12%">Обновлена</th>
                <th style="width:11%"></th>
              </tr>
            </thead>
            <tbody>
              ${list.length ? list.map((task) => {
                const st = attemptsStats(task.id);
                const edited = isEdited(task.id);
                const updated = ((Store.all().taskEdits || {})[task.id] || {}).updatedAt;
                return `
                  <tr>
                    <td>
                      <div style="color:var(--text);font-weight:550">${AppUI.esc(task.title || '(без названия)')}</div>
                      <div class="mono dim" style="font-size:11px">${AppUI.esc(task.id)}${edited ? ' · <span style="color:var(--warn)">есть правки</span>' : ''}</div>
                    </td>
                    <td>${AppUI.levelBadge(task.level)}</td>
                    <td>
                      <select class="select" data-status-task="${AppUI.esc(task.id)}" style="padding:6px 8px;font-size:12px">
                        ${statuses.map((s) => `<option value="${s.id}" ${Store.taskStatus(task.id) === s.id ? 'selected' : ''}>${s.name}</option>`).join('')}
                      </select>
                    </td>
                    <td style="text-align:right" class="mono">${st.count}</td>
                    <td style="text-align:right" class="mono">${st.avg === null ? '—' : st.avg}</td>
                    <td class="dim" style="font-size:12px">${updated ? AppUI.dateTime(updated) : pseudoCreated(task.id)}</td>
                    <td>
                      <div class="cell-actions">
                        <a class="icon-btn" href="task.html?id=${AppUI.esc(task.id)}" title="Открыть глазами студента">↗</a>
                        <button class="icon-btn" type="button" data-open-task="${AppUI.esc(task.id)}" title="Редактировать">✎</button>
                      </div>
                    </td>
                  </tr>`;
              }).join('') : `<tr><td colspan="7" class="center muted" style="padding:32px">Ничего не найдено. Измените фильтры или создайте задачу.</td></tr>`}
            </tbody>
          </table>
        </div>

        <div class="solution-foot">
          <span>Показано ${list.length} из ${all.length}</span>
          <div class="grow"></div>
          <span class="dim">Сохранение в карточке сразу влияет на движок ревью (в макете сохранение = публикация)</span>
        </div>
      </div>

      <div class="info-box mt-16">
        <div class="ib-title">Внутренний workflow</div>
        <p style="margin:0;font-size:13.5px;color:var(--text-2)">
          Черновик → На ревью → Опубликована → Архив. Студентам видна только опубликованная задача.
          Правка опубликованной считается новой ревизией рубрики/эталона: в продукте здесь будет
          журнал версий и связка «попытка → версия рубрики», чтобы тюнить промпты не вслепую.
        </p>
      </div>`;

    const search = host.querySelector('#taskSearch');
    search.addEventListener('input', AppUI.debounce(() => {
      state.q = search.value;
      const pos = search.selectionStart;
      renderList(host);
      const again = host.querySelector('#taskSearch');
      again.focus();
      again.setSelectionRange(pos, pos);
    }, 250));
    host.querySelector('#taskLevelFilter').addEventListener('change', (e) => { state.level = e.target.value; renderList(host); });
    host.querySelector('#taskStatusFilter').addEventListener('change', (e) => { state.status = e.target.value; renderList(host); });
    host.querySelector('#newTaskBtn').addEventListener('click', () => { state.openTaskId = '__new__'; renderCard(host); });
    host.querySelectorAll('[data-status-task]').forEach((select) => {
      select.addEventListener('change', () => {
        Store.setTaskStatus(select.dataset.statusTask, select.value);
        AppUI.toast(`Статус: ${statusName(select.value)}`, 'ok');
        api.refresh();
      });
    });
    host.querySelectorAll('[data-open-task]').forEach((button) => {
      button.addEventListener('click', () => { state.openTaskId = button.dataset.openTask; renderCard(host); });
    });
  }

  /* ==================== карточка ==================== */

  let tagQuery = '';

  function slugify(value) {
    const map = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
    return String(value || '').toLowerCase()
      .split('').map((ch) => (map[ch] !== undefined ? map[ch] : ch)).join('')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  }

  function tagLabel(tag, checked) {
    return `
      <label class="tag-filter" style="cursor:pointer">
        <input type="checkbox" data-f="tags" value="${AppUI.esc(tag.id)}" ${checked ? 'checked' : ''} style="accent-color:var(--accent)">
        ${AppUI.esc(tag.name)}
      </label>`;
  }

  /* Облако меток: выбранные всегда первые, остальные — по поисковому запросу */
  function paintTagCloud() {
    const wrap = document.getElementById('tagCloudWrap');
    if (!wrap) return;
    const checked = new Set([...wrap.querySelectorAll('input:checked')].map((i) => i.value));
    const tags = Store.dictionaries().tags.filter((t) => t.active !== false);
    const q = tagQuery.trim().toLowerCase();
    const sel = tags.filter((t) => checked.has(t.id));
    const rest = tags.filter((t) => !checked.has(t.id) && (!q || t.name.toLowerCase().includes(q) || t.id.includes(q)));
    const count = document.getElementById('tagCount');
    if (count) count.textContent = `выбрано: ${sel.length}`;
    wrap.innerHTML = sel.concat(rest).map((t) => tagLabel(t, checked.has(t.id))).join('')
      || '<span class="muted" style="font-size:12.5px">Ничего не найдено — измените запрос.</span>';
  }

  function tagCheckboxes(task) {
    const tags = Store.dictionaries().tags.filter((t) => t.active !== false);
    const selected = new Set(task.tags || []);
    return `
      <div class="search mb-16" style="flex:none;max-width:320px">
        <span class="ico">⌕</span>
        <input id="tagSearchInput" type="search" placeholder="Найти метку…" autocomplete="off">
      </div>
      <div class="tag-cloud" id="tagCloudWrap" style="max-height:180px">${tags.map((tag) => tagLabel(tag, selected.has(tag.id))).join('')}</div>`;
  }

  function collectionCheckboxes(task) {
    const collections = Store.dictionaries().collections;
    return collections.map((collection) => {
      const has = (collection.taskIds || []).includes(task.id);
      return `
        <label class="filter-option">
          <input type="checkbox" data-f="collections" value="${AppUI.esc(collection.id)}" ${has ? 'checked' : ''}>
          <span>${AppUI.esc(collection.icon || '◈')} ${AppUI.esc(collection.name)}</span>
          <span class="count">${(collection.taskIds || []).length}</span>
        </label>`;
    }).join('');
  }

  function lines(value) {
    return (value || []).join('\n');
  }

  function field(label, inner) {
    return `<div class="field"><label>${label}</label>${inner}</div>`;
  }

  function renderCard(host) {
    const task = currentTask();
    if (!task) {
      state.openTaskId = null;
      renderList(host);
      return;
    }
    const isNew = state.openTaskId === '__new__';
    const edited = !isNew && isEdited(task.id);
    const levels = Store.dictionaries().levels;
    const statuses = Store.taskStatuses();
    const st = isNew ? { count: 0, avg: null } : attemptsStats(task.id);

    host.innerHTML = `
      <div class="row mb-16" style="gap:10px;flex-wrap:wrap">
        <button class="btn btn-ghost btn-sm" type="button" id="backToList">← К задачам</button>
        <div class="grow"></div>
        ${statusBadge(Store.taskStatus(task.id))}
        ${edited ? '<span class="badge badge-warn">есть правки из админки</span>' : ''}
        <a class="btn btn-ghost btn-sm" href="task.html?id=${AppUI.esc(task.id)}" ${isNew ? 'style="display:none"' : ''}>Глазами студента ↗</a>
        ${!isNew ? `<button class="btn btn-ghost btn-sm" type="button" id="resetTaskBtn">Сбросить правки</button>` : ''}
        <button class="btn btn-primary btn-sm" type="button" id="saveTaskBtn">Сохранить и опубликовать</button>
      </div>

      <div class="panel acc mb-16" data-acc="open">
        <div class="panel-head"><p class="panel-title">Основное · ${AppUI.esc(task.id || 'новая задача')}</p>
          <span class="badge">попыток: ${st.count}${st.avg !== null ? ` · средний балл ${st.avg}` : ''}</span>
        </div>
        <div class="panel-body" style="max-width:860px">
          ${field('Название', `<input type="text" data-f="title" value="${AppUI.esc(task.title || '')}" maxlength="120" placeholder="Например: Идемпотентное списание в платёжном API">`)}
          ${isNew
            ? '<p class="mono dim" style="font-size:11.5px;margin:-6px 0 14px">ID сгенерируется из названия при сохранении (латиница, например: idempotent-payment)</p>'
            : `<p class="mono dim" style="font-size:11.5px;margin:-6px 0 14px">ID: ${AppUI.esc(task.id)} · создана: ${pseudoCreated(task.id)}${edited ? ` · изменена: ${AppUI.dateTime(((Store.all().taskEdits || {})[task.id] || {}).updatedAt)}` : ''}</p>`}
          ${field('Уровень', `<select data-f="level">${levels.map((l) => `<option value="${l.id}" ${task.level === l.id ? 'selected' : ''}>${AppUI.esc(l.name)}</option>`).join('')}</select>`)}
          ${field('Статус', `<select data-f="status">${statuses.map((s) => `<option value="${s.id}" ${Store.taskStatus(task.id) === s.id ? 'selected' : ''}>${s.name}</option>`).join('')}</select>`)}
          <div class="field">
            <label>Метки <span class="mono dim" id="tagCount" style="font-size:10.5px"></span></label>
            ${tagCheckboxes(task)}
          </div>
          ${field('Подборки', `<div class="filter-list">${collectionCheckboxes(task)}</div>`)}
          <div class="info-box" style="margin-top:6px">
            <div class="ib-title">Как это работает в макете</div>
            <p style="margin:0;font-size:13px">Сохранение сразу меняет задачу везде: каталог, страница задачи и движок ревью. Отдельной кнопки «публиковать» нет — в продукте здесь будет ревизия + changelog.</p>
          </div>
        </div>
      </div>

      <div class="panel acc mb-16" data-acc="closed">
        <div class="panel-head"><p class="panel-title">Условие задачи</p><span class="badge">структура условия</span></div>
        <div class="panel-body" style="max-width:860px">
          ${field('Коротко (1–2 предложения)', `<textarea data-f="statement.brief" rows="2" placeholder="Например: Спроектировать операцию списания так, чтобы повтор запроса не снимал деньги дважды">${AppUI.esc(task.statement.brief || '')}</textarea>`)}
          ${field('Контекст (по абзацу на строку)', `<textarea data-f="statement.context" data-kind="lines" rows="4" placeholder="Например: Мобильное приложение шлёт POST /v1/payments…">${AppUI.esc(lines(task.statement.context))}</textarea>`)}
          ${field('Что нужно сделать', `<textarea data-f="statement.goal" rows="2" placeholder="Например: Описать контракт и поведение, при котором любой повтор безопасен">${AppUI.esc(task.statement.goal || '')}</textarea>`)}
          ${field('Входные данные (по пункту на строку)', `<textarea data-f="statement.inputs" data-kind="lines" rows="5" placeholder="Например: сумма, валюта, токен карты, ID заказа">${AppUI.esc(lines(task.statement.inputs))}</textarea>`)}
          ${field('Что должно быть в решении (по пункту)', `<textarea data-f="statement.deliverables" data-kind="lines" rows="5" placeholder="Например: контракт запроса и ответа, модель состояний, граничные случаи">${AppUI.esc(lines(task.statement.deliverables))}</textarea>`)}
          ${field('Ограничения (по пункту на строку)', `<textarea data-f="statement.constraints" data-kind="lines" rows="5" placeholder="Например: эквайринг менять нельзя, ответ клиенту — до 3 секунд">${AppUI.esc(lines(task.statement.constraints))}</textarea>`)}
          ${field('Как звучит на собеседовании', `<textarea data-f="statement.interview" rows="2" placeholder="Например: «Что будет, если клиент отправит запрос дважды?»">${AppUI.esc(task.statement.interview || '')}</textarea>`)}
        </div>
      </div>

      <div class="panel acc mb-16" data-acc="open">
        <div class="panel-head">
          <p class="panel-title">Рубрика · за что даём баллы</p>
          <span class="badge">вес 1–10 · critical = потолок оценки</span>
        </div>
        <div class="panel-body">
          <p class="muted" style="font-size:13px;margin-bottom:14px">
            Каждый критерий: сколько баллов даёт (1–10), чья зона проверки, ключевые маркеры для поиска
            в тексте решения и объяснение «почему без этого не работает» (показываем студенту при miss).
            Флаг <strong>critical</strong> — зарезервирован под будущие штрафы (см. TODO.md): miss по такому
            критерию не даст подняться выше 3/5.
          </p>
          <div id="rubricRows" class="stack" style="gap:10px"></div>
          <button class="btn btn-ghost btn-sm mt-16" type="button" id="addCriterionBtn">+ Добавить критерий</button>
        </div>
      </div>

      <div class="panel acc mb-16" data-acc="closed">
        <div class="panel-head"><p class="panel-title">Контент и эталон</p></div>
        <div class="panel-body" style="max-width:860px">
          ${field('Подсказки (по одной на строку)', `<textarea data-f="hints" data-kind="lines" rows="4" placeholder="Например: Разделите повтор клиента и молчание эквайринга — это разные механизмы">${AppUI.esc(lines(task.hints))}</textarea>`)}
          ${field('Вопросы интервьюера (по одному на строку)', `<textarea data-f="interviewQuestions" data-kind="lines" rows="4" placeholder="Например: Где храните ключ и какой у него TTL?">${AppUI.esc(lines(task.interviewQuestions))}</textarea>`)}
          ${field('Эталонное решение (HTML)', `<textarea data-f="authorSolution.doc" rows="9" style="font-size:12px" placeholder="Например: <h3>1. Контракт</h3><p>Ключ генерирует клиент…</p>">${AppUI.esc((task.authorSolution || {}).doc || '')}</textarea>`)}
          <p class="mono dim" style="font-size:11px">Диаграммы эталона (plantuml/mermaid) пока только для чтения — редактируются в данных.</p>
        </div>
      </div>

      <div class="panel acc mb-16" data-acc="closed">
        <div class="panel-head"><p class="panel-title">Симулятор скоринга</p><span class="badge badge-violet">отладка рубрики</span></div>
        <div class="panel-body">
          <p class="muted" style="font-size:13px;margin-bottom:12px">Вставьте текст пробного решения — движок посчитает балл по текущей рубрике (с учётом несохранённых правок из формы).</p>
          <div class="field"><label>Текст решения</label><textarea id="simText" rows="6" placeholder="Вставьте сюда решение студента…"></textarea></div>
          <div class="row" style="gap:8px;flex-wrap:wrap">
            <button class="btn btn-primary btn-sm" type="button" id="simRunBtn">Проверить</button>
            <button class="btn btn-ghost btn-sm" type="button" id="simFillBtn">Подставить эталон</button>
          </div>
          <div id="simResult" class="mt-16"></div>
        </div>
      </div>`;

    paintRubric(task.rubric || []);
    bindCard(host, task, isNew);
  }

  /* ==================== редактор рубрики ==================== */

  function paintRubric(criteria) {
    const host = document.getElementById('rubricRows');
    host.innerHTML = criteria.map((criterion, index) => `
      <div class="card" style="padding:14px" data-criterion="${index}">
        <div class="grid-2" style="gap:10px">
          <div class="field" style="margin:0"><label>Критерий</label>
            <input type="text" data-rf="title" value="${AppUI.esc(criterion.title || '')}" placeholder="Например: Ключ идемпотентности генерирует клиент">
          </div>
          <div class="row" style="gap:10px;align-items:flex-end">
            <div class="field" style="margin:0;flex:0 0 76px"><label>Вес 1–10</label>
              <input type="number" data-rf="weight" value="${criterion.weight === undefined ? 5 : criterion.weight}" min="1" max="10" step="1">
            </div>
            <div class="field" style="margin:0;flex:1"><label>Зона</label>
              <select data-rf="focus">
                <option value="sa" ${criterion.focus === 'sa' ? 'selected' : ''}>Аналитик</option>
                <option value="arch" ${criterion.focus === 'arch' ? 'selected' : ''}>Архитектор</option>
              </select>
            </div>
            <label class="row" style="gap:7px;font-size:12.5px;color:var(--muted);cursor:pointer;padding-bottom:9px" title="Зарезервировано под штрафы (TODO.md)">
              <input type="checkbox" data-rf="critical" ${criterion.critical ? 'checked' : ''} style="accent-color:var(--accent)"> critical
            </label>
            <button class="icon-btn" type="button" data-del-criterion="${index}" title="Удалить критерий">🗑</button>
          </div>
        </div>
        <div class="grid-2 mt-16" style="gap:10px">
          <div class="field" style="margin:0"><label>Ключевые маркеры (через запятую)</label>
            <input type="text" data-rf="keywords" value="${AppUI.esc((criterion.keywords || []).join(', '))}" placeholder="идемпотент, дубль, ключ">
          </div>
          <div class="field" style="margin:0"><label>Почему без этого не работает (покажем студенту)</label>
            <input type="text" data-rf="why" value="${AppUI.esc(criterion.why || '')}" placeholder="Например: без этого повтор спишет деньги дважды">
          </div>
        </div>
      </div>`).join('') || '<p class="muted" style="font-size:13px">Критериев пока нет — добавьте первый.</p>';

    host.querySelectorAll('[data-del-criterion]').forEach((button) => {
      button.addEventListener('click', () => {
        const rows = collectRubric();
        rows.splice(Number(button.dataset.delCriterion), 1);
        paintRubric(rows);
      });
    });
  }

  function collectRubric() {
    const host = document.getElementById('rubricRows');
    return [...host.querySelectorAll('[data-criterion]')].map((row) => {
      const get = (name) => {
        const input = row.querySelector(`[data-rf="${name}"]`);
        if (!input) return '';
        if (input.type === 'checkbox') return input.checked;
        return input.value.trim();
      };
      const weight = Math.max(1, Math.min(10, Number(get('weight')) || 5));
      return {
        id: `c_${Math.random().toString(36).slice(2, 8)}`,
        title: get('title'),
        weight: 'high',
        weightValue: weight,
        focus: get('focus') || 'sa',
        critical: Boolean(get('critical')),
        keywords: String(get('keywords')).split(',').map((s) => s.trim()).filter(Boolean),
        why: get('why')
      };
    }).filter((c) => c.title);
  }

  /* ==================== сбор, сохранение, симулятор ==================== */

  function setPath(target, path, value) {
    const parts = path.split('.');
    let node = target;
    for (let i = 0; i < parts.length - 1; i += 1) {
      if (!node[parts[i]] || typeof node[parts[i]] !== 'object') node[parts[i]] = {};
      node = node[parts[i]];
    }
    node[parts[parts.length - 1]] = value;
  }

  function collectForm(task, isNew) {
    const patch = {};
    const host = document.getElementById('adminMain');

    if (isNew) {
      const title = String(host.querySelector('[data-f="title"]').value || '').trim();
      if (!title) {
        AppUI.toast('Укажите название задачи', 'warn');
        return null;
      }
      const base = slugify(title) || 'task';
      let candidate = base;
      let counter = 0;
      while (Store.task(candidate)) {
        counter += 1;
        candidate = `${base}-${counter}`;
      }
      patch.__created = true;
      patch.id = candidate;
    }

    host.querySelectorAll('[data-f]').forEach((input) => {
      const path = input.dataset.f;
      if (path === 'id' || path === 'tags' || path === 'collections') return;
      let value = input.value;
      if (input.type === 'number') value = Number(value);
      else if (input.type === 'checkbox') value = input.checked;
      else value = String(value).trim();
      if (input.dataset.kind === 'lines') {
        value = String(input.value).split('\n').map((s) => s.trim()).filter(Boolean);
      }
      setPath(patch, path, value);
    });

    patch.tags = [...host.querySelectorAll('[data-f="tags"]:checked')].map((i) => i.value);
    patch.rubric = collectRubric();

    const authorDoc = host.querySelector('[data-f="authorSolution.doc"]');
    if (authorDoc) patch.authorSolution = { doc: authorDoc.value };

    if (!patch.title && !isNew) patch.title = task.title;
    if (isNew && !patch.title) {
      AppUI.toast('Укажите название задачи', 'warn');
      return null;
    }
    return patch;
  }

  function syncCollections(taskId) {
    const dict = Store.dictionaries();
    let changed = false;
    document.querySelectorAll('[data-f="collections"]').forEach((input) => {
      const collection = dict.collections.find((c) => c.id === input.value);
      if (!collection) return;
      collection.taskIds = collection.taskIds || [];
      const has = collection.taskIds.includes(taskId);
      if (input.checked && !has) { collection.taskIds.push(taskId); changed = true; }
      if (!input.checked && has) {
        collection.taskIds = collection.taskIds.filter((id) => id !== taskId);
        changed = true;
      }
    });
    if (changed) Store.saveDictionaries(dict);
  }

  function stripTags(html) {
    const div = document.createElement('div');
    div.innerHTML = String(html || '');
    return (div.textContent || '').replace(/\s+\n/g, '\n').trim();
  }

  function runSimulator(host, task) {
    const text = host.querySelector('#simText').value.trim();
    const result = host.querySelector('#simResult');
    if (!text) {
      AppUI.toast('Вставьте текст решения для проверки', 'warn');
      return;
    }
    const draft = collectForm(task, false);
    const effective = draft
      ? Object.assign({}, task, draft, { rubric: draft.rubric })
      : task;
    let review;
    try {
      review = ReviewEngine.buildReview(effective, [{ type: 'doc', title: 'Проверка', content: text }]);
    } catch (error) {
      result.innerHTML = `<div class="preview-error">Не удалось посчитать: ${AppUI.esc(error.message)}</div>`;
      return;
    }
    const grade = review.grade;
    result.innerHTML = `
      <div class="row mb-16" style="gap:10px;flex-wrap:wrap">
        <span class="badge badge-${grade.tone === 'accent' ? 'accent' : grade.tone === 'ok' ? 'ok' : grade.tone === 'warn' ? 'warn' : 'bad'}">${AppUI.esc(grade.label)}</span>
        <span class="badge badge-accent">${grade.score}/100</span>
        <span class="badge">критериев: ${review.stats.criteriaTotal} · закрыто ${review.stats.criteriaHit} · частично ${review.stats.criteriaPartial}</span>
      </div>
      <div style="overflow:auto">
        <table class="data-table">
          <thead><tr><th>Критерий</th><th style="width:8%;text-align:right">Вес</th><th style="width:13%">Итог</th><th style="width:34%">Найденные маркеры / почему важно</th></tr></thead>
          <tbody>
            ${review.criteria.map((c) => `
              <tr>
                <td style="color:var(--text)">${AppUI.esc(c.title)}${c.critical ? ' <span class="badge badge-bad">critical</span>' : ''}</td>
                <td style="text-align:right" class="mono">${c.weightValue || c.weight}</td>
                <td>${c.state === 'hit' ? '<span class="badge badge-ok">учтено</span>' : c.state === 'partial' ? '<span class="badge badge-warn">частично</span>' : '<span class="badge badge-bad">не учтено</span>'}</td>
                <td class="dim" style="font-size:12px">${c.state === 'hit' ? AppUI.esc((c.matched || []).join(', ') || '—') : AppUI.esc(c.why || '—')}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <p class="mono dim mt-16" style="font-size:11px">Агенты: аналитик ${review.agents[0].score}/10 · архитектор ${review.agents[1].score}/10 · движок ${AppUI.esc(review.engine)}</p>`;
  }

  function bindCard(host, task, isNew) {
    host.querySelectorAll('.acc > .panel-head').forEach((head) => {
      head.addEventListener('click', () => {
        const panel = head.closest('.acc');
        panel.dataset.acc = panel.dataset.acc === 'open' ? 'closed' : 'open';
      });
    });

    const tagSearch = host.querySelector('#tagSearchInput');
    if (tagSearch) {
      tagSearch.addEventListener('input', AppUI.debounce(() => {
        tagQuery = tagSearch.value;
        paintTagCloud();
        const again = host.querySelector('#tagSearchInput');
        again.focus();
        again.setSelectionRange(again.value.length, again.value.length);
      }, 200));
    }
    paintTagCloud();
    const cloudWrap = host.querySelector('#tagCloudWrap');
    if (cloudWrap) cloudWrap.addEventListener('change', () => paintTagCloud());
    const tagCount = host.querySelector('#tagCount');
    if (tagCount) {
      const sel = host.querySelectorAll('#tagCloudWrap input:checked').length;
      tagCount.textContent = `выбрано: ${sel}`;
    }

    host.querySelector('#backToList').addEventListener('click', () => {
      state.openTaskId = null;
      render(host, api);
    });

    host.querySelector('#addCriterionBtn').addEventListener('click', () => {
      const rows = collectRubric();
      rows.push({ id: '', title: '', weight: 5, weightValue: 5, focus: 'sa', critical: false, keywords: [], why: '' });
      paintRubric(rows);
    });

    const resetBtn = host.querySelector('#resetTaskBtn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        AppUI.confirm({
          title: isNew ? 'Удалить черновик?' : 'Сбросить правки задачи?',
          text: isNew
            ? 'Новая задача существует только в этом браузере и будет удалена.'
            : 'Все правки из админки будут отменены, вернутся исходные данные.',
          confirmText: isNew ? 'Удалить' : 'Сбросить',
          danger: true
        }).then((ok) => {
          if (!ok) return;
          Store.resetTaskEdit(task.id);
          state.openTaskId = null;
          api.refresh();
          AppUI.toast(isNew ? 'Черновик удалён' : 'Правки сброшены', 'ok');
        });
      });
    }

    host.querySelector('#saveTaskBtn').addEventListener('click', () => {
      const patch = collectForm(task, isNew);
      if (!patch) return;
      const id = isNew ? patch.id : task.id;
      Store.saveTaskEdit(id, patch);
      syncCollections(id);
      AppUI.toast(`Задача «${patch.title || task.title}» сохранена и уже влияет на движок`, 'ok');
      if (isNew) {
        state.openTaskId = id;
        api.refresh();
      } else {
        api.refresh();
      }
    });

    host.querySelector('#simRunBtn').addEventListener('click', () => runSimulator(host, Store.task(isNew ? null : task.id) || task));
    host.querySelector('#simFillBtn').addEventListener('click', () => {
      const draft = collectForm(task, false);
      const doc = (draft && draft.authorSolution && draft.authorSolution.doc) || (task.authorSolution || {}).doc || '';
      host.querySelector('#simText').value = stripTags(doc).slice(0, 12000);
      AppUI.toast('Эталон подставлен в симулятор', 'ok');
    });
  }

  window.AdminTasks = { render };
  function openTask(taskId) {
    state.openTaskId = taskId;
  }
  window.AdminTasks.openTask = openTask;
  return { render, openTask };
})();
