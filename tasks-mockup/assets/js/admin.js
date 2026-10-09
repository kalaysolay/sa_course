/* ============================================================
   admin.js — справочники: метки, уровни, подборки, данные макета
   Правки сохраняются в Store и сразу видны в каталоге и подборках.
   ============================================================ */

(function () {

  const SECTIONS = [
    { id: 'tasks', label: 'Задачи', icon: '☰' },
    { id: 'dashboard', label: 'Дашборд', icon: '◈' },
    { id: 'attempts', label: 'Решения', icon: '≣' },
    { id: 'users', label: 'Пользователи', icon: '◉' },
    { id: 'complaints', label: 'Жалобы', icon: '⚑' },
    { id: 'agents', label: 'Агенты', icon: '✦' },
    { id: 'versions', label: 'Версии', icon: '⎇' },
    { id: 'tags', label: 'Метки задач', icon: '#' },
    { id: 'levels', label: 'Уровни сложности', icon: '≡' },
    { id: 'collections', label: 'Подборки', icon: '▤' },
    { id: 'data', label: 'Данные макета', icon: '⛁' }
  ];

  let section = 'tasks';
  let dict = null;
  let tagSearch = '';
  let tagCategory = 'all';
  let tagShowHidden = false;

  document.addEventListener('DOMContentLoaded', () => {
    AppUI.mountHeader('admin');
    AppUI.mountFooter();
    dict = Store.dictionaries();

    const hash = window.location.hash.slice(1);
    if (SECTIONS.some((s) => s.id === hash)) section = hash;

    renderNav();
    renderSection();
    const deepTask = new URLSearchParams(window.location.search).get('task');
    if (deepTask && section === 'tasks' && window.AdminTasks) {
      window.AdminTasks.openTask(deepTask);
      renderSection();
    }
  });

  function save() {
    Store.saveDictionaries(dict);
  }

  function renderNav() {
    const nav = document.getElementById('adminNav');
    const openComplaints = Store.complaints().filter((c) => c.status === 'new').length;
    const attemptCount = Object.values(Store.all().attempts || {}).reduce((s, l) => s + l.length, 0);
    const counts = {
      tasks: Store.tasks().length,
      dashboard: '',
      attempts: attemptCount || '',
      users: (SA_DATA.users || []).length,
      complaints: openComplaints || '',
      agents: '2',
      versions: (SA_DATA.prompts || []).length,
      tags: dict.tags.length,
      levels: dict.levels.length,
      collections: dict.collections.length,
      data: Store.tasks().length
    };
    nav.innerHTML = SECTIONS.map((item) => `
      <button type="button" data-section="${item.id}" aria-current="${item.id === section}">
        <span>${item.icon}</span>
        <span>${AppUI.esc(item.label)}</span>
        <span class="k">${counts[item.id] ?? ''}</span>
      </button>`).join('') + `
      <div class="divider" style="margin:10px 0"></div>
      <a class="btn btn-ghost btn-sm" href="docs/admin-guide.md" style="justify-content:flex-start">Гид по админке</a>
      <a class="btn btn-ghost btn-sm" href="docs/product-spec.md" style="justify-content:flex-start">Спека продукта</a>
      <a class="btn btn-ghost btn-sm" href="catalog.html" style="justify-content:flex-start">← в каталог</a>`;

    nav.querySelectorAll('[data-section]').forEach((button) => {
      button.addEventListener('click', () => {
        section = button.dataset.section;
        window.location.hash = section;
        renderNav();
        renderSection();
      });
    });
  }

  function sectionApi() {
    return {
      getDict: () => dict,
      saveDict: () => save(),
      refresh: () => { renderNav(); renderSection(); },
      gotoSection: (id) => {
        section = id;
        window.location.hash = id;
        renderNav();
        renderSection();
      }
    };
  }

  function renderSection() {
    const host = document.getElementById('adminMain');
    host.dataset.section = section;
    if (section === 'tasks') {
      window.AdminTasks.render(host, sectionApi());
      return;
    }
    if (section === 'dashboard' || section === 'attempts' || section === 'users' || section === 'complaints' || section === 'agents' || section === 'versions') {
      document.getElementById('adminMain').dataset.section = section;
      window.AdminOps.render(host, sectionApi());
      return;
    }
    if (section === 'tags') host.innerHTML = tagsView();
    else if (section === 'levels') host.innerHTML = levelsView();
    else if (section === 'collections') host.innerHTML = collectionsView();
    else host.innerHTML = dataView();
    bindSection();
  }

  /* ==================== МЕТКИ ==================== */

  function tagUsage() {
    const usage = new Map();
    Store.tasks().forEach((task) => (task.tags || []).forEach((id) => usage.set(id, (usage.get(id) || 0) + 1)));
    return usage;
  }

  function slugify(value) {
    const map = {
      а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
      к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
      х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya'
    };
    return String(value).toLowerCase()
      .split('').map((ch) => (map[ch] !== undefined ? map[ch] : ch)).join('')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 32) || 'tag';
  }

  function tagsView() {
    const usage = tagUsage();
    const active = dict.tags.filter((t) => t.active !== false).length;
    const hidden = dict.tags.length - active;
    const unused = dict.tags.filter((t) => !usage.get(t.id)).length;

    const filtered = dict.tags.filter((tag) => {
      if (tagCategory !== 'all' && tag.category !== tagCategory) return false;
      if (!tagShowHidden && tag.active === false) return false;
      if (tagSearch) {
        const q = tagSearch.toLowerCase();
        const hay = [tag.name, tag.id, ...(tag.synonyms || [])].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    return `
      <div class="kpi-row">
        <div class="kpi"><div class="k">Всего меток</div><div class="v">${dict.tags.length}</div></div>
        <div class="kpi"><div class="k">Активных</div><div class="v" style="color:var(--ok)">${active}</div></div>
        <div class="kpi"><div class="k">Скрытых</div><div class="v" style="color:var(--dim)">${hidden}</div></div>
        <div class="kpi"><div class="k">Не используются</div><div class="v" style="color:var(--warn)">${unused}</div></div>
      </div>

      <div class="panel">
        <div class="panel-head" style="flex-wrap:wrap;gap:10px">
          <div class="search" style="flex:1 1 220px">
            <span class="ico">⌕</span>
            <input id="tagSearch" type="search" placeholder="Поиск по названию, id, синонимам…" value="${AppUI.esc(tagSearch)}">
          </div>
          <select class="select" id="tagCategoryFilter">
            <option value="all">Все категории</option>
            ${dict.tagCategories.map((c) => `<option value="${AppUI.esc(c.id)}" ${tagCategory === c.id ? 'selected' : ''}>${AppUI.esc(c.name)}</option>`).join('')}
          </select>
          <label class="row" style="gap:8px;font-size:13px;color:var(--muted);cursor:pointer">
            <input type="checkbox" id="tagShowHidden" ${tagShowHidden ? 'checked' : ''} style="accent-color:var(--accent)">
            показывать скрытые
          </label>
          <button class="btn btn-primary btn-sm" type="button" id="newTagBtn">+ Новая метка</button>
        </div>

        <div style="overflow:auto">
          <table class="data-table">
            <thead>
              <tr>
                <th style="width:26%">Метка</th>
                <th style="width:12%">ID</th>
                <th style="width:18%">Категория</th>
                <th style="width:9%;text-align:right">Задач</th>
                <th style="width:20%">Синонимы</th>
                <th style="width:7%">Вкл.</th>
                <th style="width:8%"></th>
              </tr>
            </thead>
            <tbody>
              ${filtered.length ? filtered.map((tag) => {
                const count = usage.get(tag.id) || 0;
                const category = dict.tagCategories.find((c) => c.id === tag.category);
                return `
                  <tr>
                    <td style="color:var(--text)"><span class="chip ${tag.active === false ? '' : 'chip-accent'}">${AppUI.esc(tag.name)}</span></td>
                    <td class="mono dim" style="font-size:12px">${AppUI.esc(tag.id)}</td>
                    <td>${AppUI.esc(category ? category.name : '—')}</td>
                    <td style="text-align:right" class="mono">${count}${count ? '' : ' <span class="dim">·</span>'}</td>
                    <td class="dim" style="font-size:12px">${AppUI.esc((tag.synonyms || []).join(', ') || '—')}</td>
                    <td>
                      <button class="switch" type="button" role="switch" aria-checked="${tag.active !== false}" data-toggle-tag="${AppUI.esc(tag.id)}" title="${tag.active === false ? 'Скрыта из каталога' : 'Видна в каталоге'}"></button>
                    </td>
                    <td>
                      <div class="cell-actions">
                        <button class="icon-btn" type="button" data-edit-tag="${AppUI.esc(tag.id)}" title="Редактировать">✎</button>
                        <button class="icon-btn" type="button" data-del-tag="${AppUI.esc(tag.id)}" title="Удалить">🗑</button>
                      </div>
                    </td>
                  </tr>`;
              }).join('') : `<tr><td colspan="7" class="center muted" style="padding:32px">Ничего не найдено. Измените фильтр или добавьте метку.</td></tr>`}
            </tbody>
          </table>
        </div>

        <div class="solution-foot">
          <span>Показано ${filtered.length} из ${dict.tags.length}</span>
          <div class="grow"></div>
          <button class="btn btn-ghost btn-sm" type="button" id="resetDictBtn">Вернуть справочники к исходным</button>
        </div>
      </div>

      <div class="info-box mt-16">
        <div class="ib-title">Как это связано с продуктом</div>
        <p style="margin:0;font-size:13.5px;color:var(--text-2)">
          Метка — это способ найти задачу: фильтр в каталоге, чип в списке, признак принадлежности подборке
          и ключ для плана прокачки после диагностики. Скрытая метка (<code>active = false</code>) остаётся
          на задачах, но исчезает из фильтров — так выводят из обращения устаревшие формулировки без правки задач.
          В продукте у меток появятся владелец, описание и статистика кликов.
        </p>
      </div>`;
  }

  function tagForm(tag) {
    const isNew = !tag;
    const value = tag || { id: '', name: '', category: dict.tagCategories[0].id, synonyms: [], active: true };
    const dialog = AppUI.modal({
      title: isNew ? 'Новая метка' : `Метка: ${value.name}`,
      wide: true,
      closeText: isNew ? 'Отмена' : 'Закрыть',
      html: `
        <div class="grid-2" style="gap:14px">
          <div class="field">
            <label for="tagName">Название (видит пользователь)</label>
            <input id="tagName" type="text" value="${AppUI.esc(value.name)}" maxlength="48" placeholder="Например: GraphQL">
          </div>
          <div class="field">
            <label for="tagId">ID (латиницей, неизменяемый)</label>
            <input id="tagId" type="text" value="${AppUI.esc(value.id)}" ${isNew ? '' : 'readonly style="opacity:.6"'} placeholder="graphql">
          </div>
        </div>
        <div class="field">
          <label for="tagCategory">Категория</label>
          <select id="tagCategory">
            ${dict.tagCategories.map((c) => `<option value="${AppUI.esc(c.id)}" ${c.id === value.category ? 'selected' : ''}>${AppUI.esc(c.name)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label for="tagSynonyms">Синонимы (через запятую) — помогают поиску по каталогу</label>
          <input id="tagSynonyms" type="text" value="${AppUI.esc((value.synonyms || []).join(', '))}" placeholder="gql, graph ql">
        </div>
        <label class="row" style="gap:10px;cursor:pointer;margin-top:6px">
          <input id="tagActive" type="checkbox" ${value.active !== false ? 'checked' : ''} style="accent-color:var(--accent);width:16px;height:16px">
          <span style="font-size:13.5px">Показывать метку в фильтрах каталога</span>
        </label>
        ${isNew ? '' : `<p class="mono dim mt-16" style="font-size:11.5px">Меткой помечено задач: ${(tagUsage().get(value.id) || 0)}</p>`}
        <div class="modal-actions">
          <button class="btn btn-primary" type="button" id="saveTagBtn">${isNew ? 'Создать метку' : 'Сохранить'}</button>
        </div>`
    });

    const nameInput = dialog.body.querySelector('#tagName');
    const idInput = dialog.body.querySelector('#tagId');
    nameInput.focus();
    if (isNew) {
      nameInput.addEventListener('input', AppUI.debounce(() => {
        if (!idInput.value.trim() || idInput.dataset.touched !== 'true') {
          idInput.value = slugify(nameInput.value);
        }
      }, 200));
      idInput.addEventListener('input', () => { idInput.dataset.touched = 'true'; });
    }

    dialog.body.querySelector('#saveTagBtn').addEventListener('click', () => {
      const name = nameInput.value.trim();
      const id = (idInput.value || slugify(name)).trim().toLowerCase();
      if (!name) { AppUI.toast('Укажите название метки', 'warn'); nameInput.focus(); return; }
      if (!/^[a-z0-9-]{2,32}$/.test(id)) { AppUI.toast('ID: латиница, цифры и дефис, 2–32 символа', 'warn'); idInput.focus(); return; }
      const exists = dict.tags.some((t) => t.id === id && (!tag || t.id !== tag.id));
      if (exists) { AppUI.toast(`Метка с ID «${id}» уже есть`, 'bad'); return; }

      const record = {
        id,
        name,
        category: dialog.body.querySelector('#tagCategory').value,
        synonyms: dialog.body.querySelector('#tagSynonyms').value.split(',').map((s) => s.trim()).filter(Boolean),
        active: dialog.body.querySelector('#tagActive').checked
      };

      if (isNew) dict.tags.push(record);
      else Object.assign(tag, record);

      save();
      dialog.close();
      renderNav();
      renderSection();
      AppUI.toast(isNew ? `Метка «${name}» добавлена` : `Метка «${name}» сохранена`, 'ok');
    });
  }

  /* ==================== УРОВНИ ==================== */

  function levelsView() {
    const tasks = Store.tasks();
    return `
      <div class="panel">
        <div class="panel-head">
          <p class="panel-title">Уровни сложности</p>
          <span class="badge">влияют на фильтры, сортировку и план прокачки</span>
        </div>
        <div style="overflow:auto">
          <table class="data-table">
            <thead>
              <tr>
                <th style="width:16%">Уровень</th>
                <th style="width:12%">Профиль</th>
                <th style="width:10%">Время</th>
                <th style="width:36%">Описание</th>
                <th style="width:9%;text-align:right">Задач</th>
                <th style="width:7%">Вкл.</th>
                <th style="width:8%"></th>
              </tr>
            </thead>
            <tbody>
              ${dict.levels.map((level) => {
                const count = tasks.filter((t) => t.level === level.id).length;
                return `
                  <tr>
                    <td><span class="level-pill ${AppUI.esc(level.cssClass || '')}">${AppUI.esc(level.name)}</span></td>
                    <td class="mono" style="font-size:12px">${AppUI.esc(level.profile || '—')}</td>
                    <td class="mono" style="font-size:12px">${AppUI.esc(level.timeHint || '—')}</td>
                    <td class="dim" style="font-size:12.5px">${AppUI.esc(level.description || '')}</td>
                    <td style="text-align:right" class="mono">${count}</td>
                    <td><button class="switch" type="button" role="switch" aria-checked="${level.active !== false}" data-toggle-level="${AppUI.esc(level.id)}"></button></td>
                    <td><div class="cell-actions"><button class="icon-btn" type="button" data-edit-level="${AppUI.esc(level.id)}" title="Редактировать">✎</button></div></td>
                  </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
        <div class="solution-foot">
          <span class="dim">Уровни нельзя удалять: на них завязаны задачи, фильтры и план прокачки. Можно переименовать и уточнить описание.</span>
        </div>
      </div>`;
  }

  function levelForm(level) {
    const dialog = AppUI.modal({
      title: `Уровень: ${level.name}`,
      wide: true,
      closeText: 'Закрыть',
      html: `
        <div class="grid-2" style="gap:14px">
          <div class="field"><label for="lvlName">Название</label><input id="lvlName" type="text" value="${AppUI.esc(level.name)}" maxlength="24"></div>
          <div class="field">
            <label for="lvlClass">Цвет</label>
            <select id="lvlClass">
              ${['level-easy', 'level-medium', 'level-hard'].map((c) => `<option value="${c}" ${level.cssClass === c ? 'selected' : ''}>${c}</option>`).join('')}
            </select>
          </div>
          <div class="field"><label for="lvlProfile">Профиль кандидата</label><input id="lvlProfile" type="text" value="${AppUI.esc(level.profile || '')}" maxlength="32"></div>
          <div class="field"><label for="lvlTime">Ориентир по времени</label><input id="lvlTime" type="text" value="${AppUI.esc(level.timeHint || '')}" maxlength="24"></div>
        </div>
        <div class="field"><label for="lvlDesc">Описание (видно в подсказке фильтра)</label><textarea id="lvlDesc">${AppUI.esc(level.description || '')}</textarea></div>
        <label class="row" style="gap:10px;cursor:pointer">
          <input id="lvlActive" type="checkbox" ${level.active !== false ? 'checked' : ''} style="accent-color:var(--accent);width:16px;height:16px">
          <span style="font-size:13.5px">Уровень доступен в каталоге</span>
        </label>
        <div class="modal-actions"><button class="btn btn-primary" type="button" id="saveLvlBtn">Сохранить</button></div>`
    });

    dialog.body.querySelector('#saveLvlBtn').addEventListener('click', () => {
      const name = dialog.body.querySelector('#lvlName').value.trim();
      if (!name) { AppUI.toast('Название не может быть пустым', 'warn'); return; }
      Object.assign(level, {
        name,
        cssClass: dialog.body.querySelector('#lvlClass').value,
        profile: dialog.body.querySelector('#lvlProfile').value.trim(),
        timeHint: dialog.body.querySelector('#lvlTime').value.trim(),
        description: dialog.body.querySelector('#lvlDesc').value.trim(),
        active: dialog.body.querySelector('#lvlActive').checked
      });
      save();
      dialog.close();
      renderSection();
      AppUI.toast(`Уровень «${name}» сохранён`, 'ok');
    });
  }

  /* ==================== ПОДБОРКИ ==================== */

  function collectionsView() {
    const tasks = Store.tasks();
    return `
      <div class="panel">
        <div class="panel-head">
          <p class="panel-title">Подборки по доменам</p>
          <button class="btn btn-primary btn-sm" type="button" id="newCollectionBtn">+ Новая подборка</button>
        </div>
        <div style="overflow:auto">
          <table class="data-table">
            <thead>
              <tr>
                <th style="width:24%">Подборка</th>
                <th style="width:28%">Описание</th>
                <th style="width:14%">Аудитория</th>
                <th style="width:9%;text-align:right">Задач</th>
                <th style="width:12%">Уровни</th>
                <th style="width:6%">Вкл.</th>
                <th style="width:7%"></th>
              </tr>
            </thead>
            <tbody>
              ${dict.collections.map((collection) => {
                const items = (collection.taskIds || []).map((id) => tasks.find((t) => t.id === id)).filter(Boolean);
                const levels = ['easy', 'medium', 'hard'].map((lvl) => items.filter((t) => t.level === lvl).length);
                return `
                  <tr>
                    <td style="color:var(--text)"><span style="margin-right:8px">${AppUI.esc(collection.icon || '◈')}</span>${AppUI.esc(collection.name)}</td>
                    <td class="dim" style="font-size:12.5px">${AppUI.esc((collection.description || '').slice(0, 110))}${(collection.description || '').length > 110 ? '…' : ''}</td>
                    <td class="dim" style="font-size:12.5px">${AppUI.esc(collection.audience || '—')}</td>
                    <td style="text-align:right" class="mono">${items.length}</td>
                    <td>
                      <span class="row" style="gap:6px">
                        <span class="level level-easy">${levels[0]}</span>
                        <span class="level level-medium">${levels[1]}</span>
                        <span class="level level-hard">${levels[2]}</span>
                      </span>
                    </td>
                    <td><button class="switch" type="button" role="switch" aria-checked="${collection.active !== false}" data-toggle-collection="${AppUI.esc(collection.id)}"></button></td>
                    <td>
                      <div class="cell-actions">
                        <a class="icon-btn" href="collections.html#${AppUI.esc(collection.id)}" title="Открыть в продукте">↗</a>
                        <button class="icon-btn" type="button" data-edit-collection="${AppUI.esc(collection.id)}" title="Редактировать">✎</button>
                        <button class="icon-btn" type="button" data-del-collection="${AppUI.esc(collection.id)}" title="Удалить">🗑</button>
                      </div>
                    </td>
                  </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
        <div class="solution-foot">
          <span class="dim">Подборка — это не папка, а набор ссылок на задачи: одна задача может входить в несколько подборок (например, «Финтех» и «Интеграции»).</span>
        </div>
      </div>`;
  }

  function collectionForm(collection) {
    const isNew = !collection;
    const value = collection || { id: '', name: '', icon: '◈', tagline: '', description: '', audience: '', taskIds: [], active: true };
    const tasks = Store.tasks();

    const dialog = AppUI.modal({
      title: isNew ? 'Новая подборка' : `Подборка: ${value.name}`,
      wide: true,
      closeText: isNew ? 'Отмена' : 'Закрыть',
      html: `
        <div class="grid-2" style="gap:14px">
          <div class="field"><label for="colName">Название</label><input id="colName" type="text" value="${AppUI.esc(value.name)}" maxlength="60"></div>
          <div class="field"><label for="colId">ID</label><input id="colId" type="text" value="${AppUI.esc(value.id)}" ${isNew ? '' : 'readonly style="opacity:.6"'} placeholder="integrations"></div>
          <div class="field"><label for="colIcon">Иконка (один символ)</label><input id="colIcon" type="text" value="${AppUI.esc(value.icon || '')}" maxlength="2"></div>
          <div class="field"><label for="colAudience">Аудитория</label><input id="colAudience" type="text" value="${AppUI.esc(value.audience || '')}" placeholder="SA / BA, Middle+"></div>
        </div>
        <div class="field"><label for="colTagline">Краткий подзаголовок (строка под названием)</label><input id="colTagline" type="text" value="${AppUI.esc(value.tagline || '')}" maxlength="70"></div>
        <div class="field"><label for="colDesc">Описание</label><textarea id="colDesc">${AppUI.esc(value.description || '')}</textarea></div>
        <div class="field">
          <label>Задачи в подборке · <span id="colCount">${(value.taskIds || []).length}</span></label>
          <div style="max-height:260px;overflow:auto;border:1px solid var(--line);border-radius:8px;padding:8px;background:var(--bg-soft)">
            ${tasks.map((task) => `
              <label class="filter-option" style="padding:6px 8px">
                <input type="checkbox" data-task="${AppUI.esc(task.id)}" ${(value.taskIds || []).includes(task.id) ? 'checked' : ''}>
                <span>${AppUI.esc(task.title)}</span>
                <span class="count">${AppUI.esc(Store.level(task.level).name)}</span>
              </label>`).join('')}
          </div>
        </div>
        <label class="row" style="gap:10px;cursor:pointer">
          <input id="colActive" type="checkbox" ${value.active !== false ? 'checked' : ''} style="accent-color:var(--accent);width:16px;height:16px">
          <span style="font-size:13.5px">Показывать подборку пользователям</span>
        </label>
        <div class="modal-actions"><button class="btn btn-primary" type="button" id="saveColBtn">${isNew ? 'Создать подборку' : 'Сохранить'}</button></div>`
    });

    const nameInput = dialog.body.querySelector('#colName');
    const idInput = dialog.body.querySelector('#colId');
    const counter = dialog.body.querySelector('#colCount');
    nameInput.focus();

    if (isNew) {
      nameInput.addEventListener('input', AppUI.debounce(() => {
        if (idInput.dataset.touched !== 'true') idInput.value = slugify(nameInput.value);
      }, 200));
      idInput.addEventListener('input', () => { idInput.dataset.touched = 'true'; });
    }
    dialog.body.querySelectorAll('[data-task]').forEach((input) => {
      input.addEventListener('change', () => {
        counter.textContent = String(dialog.body.querySelectorAll('[data-task]:checked').length);
      });
    });

    dialog.body.querySelector('#saveColBtn').addEventListener('click', () => {
      const name = nameInput.value.trim();
      const id = (idInput.value || slugify(name)).trim().toLowerCase();
      if (!name) { AppUI.toast('Укажите название подборки', 'warn'); return; }
      if (!/^[a-z0-9-]{2,40}$/.test(id)) { AppUI.toast('ID: латиница, цифры и дефис', 'warn'); return; }
      if (dict.collections.some((c) => c.id === id && (!collection || c.id !== collection.id))) {
        AppUI.toast(`Подборка с ID «${id}» уже есть`, 'bad');
        return;
      }
      const taskIds = [...dialog.body.querySelectorAll('[data-task]:checked')].map((i) => i.dataset.task);
      if (!taskIds.length) { AppUI.toast('Добавьте хотя бы одну задачу', 'warn'); return; }

      const record = {
        id,
        name,
        icon: dialog.body.querySelector('#colIcon').value.trim() || '◈',
        tagline: dialog.body.querySelector('#colTagline').value.trim(),
        description: dialog.body.querySelector('#colDesc').value.trim(),
        audience: dialog.body.querySelector('#colAudience').value.trim(),
        taskIds,
        active: dialog.body.querySelector('#colActive').checked
      };

      if (isNew) dict.collections.push(record);
      else Object.assign(collection, record);

      save();
      dialog.close();
      renderNav();
      renderSection();
      AppUI.toast(isNew ? `Подборка «${name}» создана` : `Подборка «${name}» сохранена`, 'ok');
    });
  }

  /* ==================== ДАННЫЕ МАКЕТА ==================== */

  function dataView() {
    const stats = Store.stats();
    const raw = Store.exportJson();
    const solutions = Object.keys(Store.all().solutions || {}).length;
    const attempts = Object.values(Store.all().attempts || {}).reduce((s, l) => s + l.length, 0);

    return `
      <div class="kpi-row">
        <div class="kpi"><div class="k">Задач в каталоге</div><div class="v">${stats.total}</div></div>
        <div class="kpi"><div class="k">Черновиков решений</div><div class="v">${solutions}</div></div>
        <div class="kpi"><div class="k">Отправок на ревью</div><div class="v">${attempts}</div></div>
        <div class="kpi"><div class="k">Средний балл ревью</div><div class="v">${stats.avgScore ?? '—'}</div></div>
      </div>

      <div class="grid-2" style="align-items:start">
        <div class="panel">
          <div class="panel-head"><p class="panel-title">Состояние макета</p><span class="badge">хранилище: ${AppUI.esc(Store.backend)}</span></div>
          <div class="panel-body">
            <p style="font-size:13.5px;color:var(--text-2)">
              Всё, что вы написали и отправили, живёт в <code>localStorage</code> этого браузера.
              Сервера нет: макет проверяет UX, а не данные.
              ${stats.assessment ? `Диагностика пройдена: <strong>${AppUI.esc(stats.assessment.grade.name)} · ${stats.assessment.scoreRounded}/100</strong>.` : 'Диагностика ещё не пройдена.'}
            </p>
            <div class="row mt-16" style="gap:8px;flex-wrap:wrap">
              <a class="btn btn-ghost btn-sm" href="results.html">Результат диагностики</a>
              <a class="btn btn-ghost btn-sm" href="catalog.html?status=reviewed">Задачи с ревью</a>
              <button class="btn btn-ghost btn-sm" type="button" id="exportBtn">Скачать JSON</button>
              <button class="btn btn-danger btn-sm" type="button" id="wipeBtn">Очистить всё</button>
            </div>
            <div class="info-box mt-16">
              <div class="ib-title">Что в продукте будет вместо этого</div>
              <p style="margin:0;font-size:13px;color:var(--text-2)">
                Пользовательские решения и ревью — в БД с историей версий; справочники — таблицы
                с правами ролей (контент-менеджер, методист, админ); отправка на ревью — очередь
                и вызов LLM-агентов с ролями. Структура ответа ревью уже зафиксирована в макете,
                поэтому замена движка не меняет интерфейс.
              </p>
            </div>
          </div>
        </div>

        <div class="panel">
          <div class="panel-head"><p class="panel-title">JSON состояния</p><span class="badge mono">${Math.round(raw.length / 1024)} КБ</span></div>
          <div class="panel-body" style="padding:0">
            <textarea class="code-area" id="stateJson" style="min-height:340px;border:0;border-radius:0">${AppUI.esc(raw.slice(0, 60000))}</textarea>
          </div>
          <div class="solution-foot"><span class="dim">только для просмотра · первые 60 КБ</span></div>
        </div>
      </div>

      <div class="panel mt-16">
        <div class="panel-head"><p class="panel-title">Состав контента</p></div>
        <div style="overflow:auto">
          <table class="data-table">
            <thead><tr><th>Раздел</th><th style="text-align:right">Количество</th><th>Где используется</th></tr></thead>
            <tbody>
              <tr><td>Задачи</td><td style="text-align:right" class="mono">${Store.tasks().length}</td><td class="dim">каталог, подборки, рабочее место</td></tr>
              <tr><td>Критериев в рубриках</td><td style="text-align:right" class="mono">${Store.tasks().reduce((s, t) => s + (t.rubric || []).length, 0)}</td><td class="dim">движок ревью двух агентов</td></tr>
              <tr><td>Метки</td><td style="text-align:right" class="mono">${dict.tags.length}</td><td class="dim">фильтры каталога, план прокачки</td></tr>
              <tr><td>Подборки</td><td style="text-align:right" class="mono">${dict.collections.length}</td><td class="dim">раздел «Подборки», лендинг</td></tr>
              <tr><td>Вопросов диагностики</td><td style="text-align:right" class="mono">${(SA_DATA.questions || []).length}</td><td class="dim">тест уровня, профиль компетенций</td></tr>
              <tr><td>Эталонных решений</td><td style="text-align:right" class="mono">${Store.tasks().filter((t) => t.authorSolution).length}</td><td class="dim">спойлер после ревью</td></tr>
            </tbody>
          </table>
        </div>
      </div>`;
  }

  /* ==================== события раздела ==================== */

  function bindSection() {
    const host = document.getElementById('adminMain');

    if (section === 'tags') {
      const search = host.querySelector('#tagSearch');
      search.addEventListener('input', AppUI.debounce(() => { tagSearch = search.value.trim(); renderSection(); focusSearch(); }, 220));
      host.querySelector('#tagCategoryFilter').addEventListener('change', (e) => { tagCategory = e.target.value; renderSection(); });
      host.querySelector('#tagShowHidden').addEventListener('change', (e) => { tagShowHidden = e.target.checked; renderSection(); });
      host.querySelector('#newTagBtn').addEventListener('click', () => tagForm(null));
      host.querySelector('#resetDictBtn').addEventListener('click', resetDictionaries);

      host.querySelectorAll('[data-toggle-tag]').forEach((button) => {
        button.addEventListener('click', () => {
          const tag = dict.tags.find((t) => t.id === button.dataset.toggleTag);
          if (!tag) return;
          tag.active = tag.active === false;
          save();
          renderSection();
          AppUI.toast(tag.active ? `Метка «${tag.name}» видна в каталоге` : `Метка «${tag.name}» скрыта из фильтров`, tag.active ? 'ok' : 'warn');
        });
      });

      host.querySelectorAll('[data-edit-tag]').forEach((button) => {
        button.addEventListener('click', () => tagForm(dict.tags.find((t) => t.id === button.dataset.editTag)));
      });

      host.querySelectorAll('[data-del-tag]').forEach((button) => {
        button.addEventListener('click', () => {
          const tag = dict.tags.find((t) => t.id === button.dataset.delTag);
          if (!tag) return;
          const used = tagUsage().get(tag.id) || 0;
          if (used) {
            AppUI.modal({
              title: 'Метку нельзя удалить',
              html: `<p>Меткой <strong>${AppUI.esc(tag.name)}</strong> помечено задач: <strong>${used}</strong>. Удаление сломает фильтры каталога и план прокачки.</p>
                     <p class="muted" style="font-size:13.5px">Правильный ход — снять метку с задач или скрыть её переключателем «Вкл.»: она исчезнет из фильтров, но данные останутся целыми.</p>`
            });
            return;
          }
          AppUI.confirm({
            title: `Удалить метку «${tag.name}»?`,
            text: 'Метка не используется ни в одной задаче, удаление безопасно.',
            confirmText: 'Удалить',
            danger: true
          }).then((ok) => {
            if (!ok) return;
            dict.tags = dict.tags.filter((t) => t.id !== tag.id);
            save();
            renderNav();
            renderSection();
            AppUI.toast('Метка удалена', 'ok');
          });
        });
      });
    }

    if (section === 'levels') {
      host.querySelectorAll('[data-toggle-level]').forEach((button) => {
        button.addEventListener('click', () => {
          const level = dict.levels.find((l) => l.id === button.dataset.toggleLevel);
          if (!level) return;
          level.active = level.active === false;
          save();
          renderSection();
        });
      });
      host.querySelectorAll('[data-edit-level]').forEach((button) => {
        button.addEventListener('click', () => levelForm(dict.levels.find((l) => l.id === button.dataset.editLevel)));
      });
    }

    if (section === 'collections') {
      host.querySelector('#newCollectionBtn').addEventListener('click', () => collectionForm(null));
      host.querySelectorAll('[data-toggle-collection]').forEach((button) => {
        button.addEventListener('click', () => {
          const collection = dict.collections.find((c) => c.id === button.dataset.toggleCollection);
          if (!collection) return;
          collection.active = collection.active === false;
          save();
          renderSection();
        });
      });
      host.querySelectorAll('[data-edit-collection]').forEach((button) => {
        button.addEventListener('click', () => collectionForm(dict.collections.find((c) => c.id === button.dataset.editCollection)));
      });
      host.querySelectorAll('[data-del-collection]').forEach((button) => {
        button.addEventListener('click', () => {
          const collection = dict.collections.find((c) => c.id === button.dataset.delCollection);
          if (!collection) return;
          AppUI.confirm({
            title: `Удалить подборку «${collection.name}»?`,
            text: 'Задачи останутся в каталоге — удалится только группировка.',
            confirmText: 'Удалить',
            danger: true
          }).then((ok) => {
            if (!ok) return;
            dict.collections = dict.collections.filter((c) => c.id !== collection.id);
            save();
            renderNav();
            renderSection();
            AppUI.toast('Подборка удалена', 'ok');
          });
        });
      });
    }

    if (section === 'data') {
      host.querySelector('#exportBtn').addEventListener('click', () => {
        const blob = new Blob([Store.exportJson()], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'analystgym-mockup-state.json';
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        AppUI.toast('Файл состояния скачан', 'ok');
      });
      host.querySelector('#wipeBtn').addEventListener('click', () => {
        AppUI.confirm({
          title: 'Очистить все данные макета?',
          text: 'Удалятся черновики решений, история ревью, результат диагностики и правки справочников.',
          confirmText: 'Очистить',
          danger: true
        }).then((ok) => {
          if (!ok) return;
          Store.reset();
          dict = Store.dictionaries();
          renderNav();
          renderSection();
          AppUI.toast('Данные макета очищены', 'ok');
        });
      });
    }
  }

  function focusSearch() {
    const input = document.getElementById('tagSearch');
    if (!input) return;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }

  function resetDictionaries() {
    AppUI.confirm({
      title: 'Вернуть справочники к исходным?',
      text: 'Все правки меток, уровней и подборок в этом браузере будут отменены. Задачи и диагностика не пострадают.',
      confirmText: 'Вернуть',
      danger: true
    }).then((ok) => {
      if (!ok) return;
      Store.resetDictionaries();
      dict = Store.dictionaries();
      renderNav();
      renderSection();
      AppUI.toast('Справочники возвращены к исходным', 'ok');
    });
  }
})();
