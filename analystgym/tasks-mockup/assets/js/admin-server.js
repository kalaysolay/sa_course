/* Серверная админка: права и данные берутся из API, формы не пишут в localStorage. */
window.AdminServer = (function () {
  const esc = value => AppUI.esc(String(value ?? ''));
  const enc = encodeURIComponent;
  const root = '/api/admin/';
  let host, section, allowed, generation = 0;
  let content = { tasks: [], tags: [], levels: [], collections: [], attemptsTotal: '—' };
  const sections = [
    ['tasks', 'Задачи', 'content'], ['tags', 'Метки задач', 'content'],
    ['levels', 'Уровни сложности', 'content'], ['collections', 'Подборки', 'content'],
    ['dashboard', 'Дашборд', 'quality'], ['attempts', 'Решения', 'quality'],
    ['students', 'Студенты', 'quality'], ['complaints', 'Жалобы', 'quality'],
    ['providers', 'Провайдеры', 'llm'], ['agents', 'Агенты', 'llm'], ['versions', 'Версии промптов', 'llm'],
    ['users', 'Роли пользователей', 'super'], ['audit', 'Журнал действий', 'super']
  ];

  function errorText(error) {
    if (error.status === 409) return 'Данные изменились после открытия формы. Ваши поля сохранены на экране. Скопируйте правки, обновите данные и повторите сохранение.';
    if (error.status === 401) return 'Сессия завершилась. Войдите снова, затем обновите страницу.';
    if (error.status === 403) return 'Недостаточно прав. Доступ определяется ролью аккаунта на сервере.';
    if (error.status === 404) return 'Запись не найдена. Обновите данные.';
    if (error.status === 400) return error.body?.message || 'Сервер отклонил данные. Проверьте поля, допустимый переход статуса и обязательный итог разбора.';
    return 'Не удалось выполнить запрос. Проверьте соединение и повторите. ' + (error instanceof SyntaxError ? 'Некорректный JSON в форме.' : '');
  }

  function showError(error) {
    let notice = document.getElementById('adminError');
    if (!notice) {
      notice = document.createElement('div');
      notice.id = 'adminError';
      notice.className = 'info-box mb-16';
      notice.setAttribute('role', 'alert');
      host.prepend(notice);
    }
    notice.innerHTML = `<p>${esc(errorText(error))}</p><button class="btn btn-ghost btn-sm" id="adminRetry">Обновить данные</button>`;
    notice.querySelector('button').onclick = () => render();
    notice.scrollIntoView({ block: 'nearest' });
  }

  async function run(button, action) {
    if (button?.disabled) return false;
    if (button) button.disabled = true;
    document.getElementById('adminError')?.remove();
    try { await action(); return true; }
    catch (error) { showError(error); return false; }
    finally { if (button) button.disabled = false; }
  }

  function table(headers, rows) {
    return `<div class="panel" style="overflow:auto"><table class="data-table"><thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.length
      ? rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')
      : `<tr><td colspan="${headers.length}">Записей нет</td></tr>`}</tbody></table></div>`;
  }

  function json(value) { return `<pre style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(JSON.stringify(value, null, 2))}</pre>`; }
  function button(text, attribute, value) { return `<button class="btn btn-ghost btn-sm" ${attribute}="${esc(value)}">${esc(text)}</button>`; }

  /** Поля формы сохраняют снимок версии записи; при 409 DOM с правками остаётся. */
  function form(title, item, fields, save) {
    const panel = document.createElement('div');
    panel.className = 'panel mb-16';
    panel.innerHTML = `<div class="panel-body"><h3>${esc(title)}</h3><form>${fields.map(([key, label, type = 'text', options]) => {
      const value = item[key] ?? (type === 'checkbox' ? true : '');
      let control;
      if (type === 'select') control = `<select name="${key}">${options.map(v => `<option value="${esc(v)}" ${v === value ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>`;
      else if (type === 'checkbox') control = `<input name="${key}" type="checkbox" ${value ? 'checked' : ''}>`;
      else if (type === 'lines' || type === 'textarea') control = `<textarea name="${key}" rows="${key === 'text' ? 16 : 4}">${esc(type === 'lines' ? (Array.isArray(value) ? value.join('\n') : value) : value)}</textarea>`;
      else control = `<input name="${key}" type="${type}" value="${esc(value)}" ${key === 'id' && item.id ? 'readonly' : ''}>`;
      return `<label class="field"><span>${esc(label)}</span>${control}</label>`;
    }).join('')}<div class="row" style="gap:8px"><button class="btn btn-primary" type="submit">Сохранить на сервере</button><button class="btn btn-ghost" type="button" data-cancel>Закрыть форму</button></div></form></div>`;
    host.querySelector('[data-editor]')?.remove();
    panel.dataset.editor = '';
    host.prepend(panel);
    panel.querySelector('[data-cancel]').onclick = () => panel.remove();
    panel.querySelector('form').onsubmit = event => {
      event.preventDefault();
      run(panel.querySelector('[type="submit"]'), async () => {
        const body = { ...item };
        for (const [key, , type] of fields) {
          const input = panel.querySelector(`[name="${key}"]`);
          body[key] = type === 'checkbox' ? input.checked : type === 'number' ? Number(input.value)
            : type === 'lines' ? input.value.split('\n').map(s => s.trim()).filter(Boolean) : input.value;
        }
        await save(body);
        AppUI.toast('Сохранено на сервере', 'ok');
        await render();
      });
    };
    panel.scrollIntoView({ block: 'start' });
  }

  async function loadContent() {
    const [tasks, tags, levels, collections, dashboard] = await Promise.all([
      Api.get(root + 'tasks'), Api.get(root + 'tags'), Api.get(root + 'levels'),
      Api.get(root + 'collections'), Api.get(root + 'quality/dashboard')
    ]);
    content = { tasks, tags, levels, collections: collections.map(c => ({ ...c, name: c.title })), attemptsTotal: dashboard.kpi.attempts };
  }

  const store = Object.assign(Object.create(window.Store), {
    tasks: () => content.tasks,
    task: id => content.tasks.find(t => t.id === id),
    taskStatus: id => content.tasks.find(t => t.id === id)?.status || 'draft',
    dictionaries: () => ({ ...content, tagCategories: SA_DATA.tagCategories || [] }),
    all: () => ({ taskEdits: {} })
  });

  const taskApi = {
    server: true, store, run, showError,
    get attemptsTotal() { return content.attemptsTotal; },
    refresh: render,
    async loadTask(id) {
      const task = await Api.get(root + 'tasks/' + enc(id));
      content.tasks = content.tasks.map(t => t.id === id ? task : t);
      return task;
    },
    async saveTask(task, patch, isNew) {
      const saved = isNew ? await Api.post(root + 'tasks', { title: patch.title, content: patch })
        : await Api.put(root + 'tasks/' + enc(task.id), { ...patch, version: task.version });
      content.tasks = content.tasks.filter(t => t.id !== saved.id).concat(saved);
      return saved;
    },
    async saveStatus(id, status, version) {
      await Api.put(root + 'tasks/' + enc(id), { status, version });
      await render();
    },
    async history(id) {
      const [revisions, exported] = await Promise.all([
        Api.get(root + 'tasks/' + enc(id) + '/revisions'), Api.get(root + 'tasks/' + enc(id) + '/export')
      ]);
      const view = AppUI.modal({ title: 'Ревизии задачи', html: `${button('Скачать JSON задачи', 'data-export', '')}${table(['Ревизия', 'Автор', 'Дата'], revisions.map(r => [esc(r.rev), esc(r.authorId), esc(r.createdAt)]))}<details><summary>Снимки ревизий</summary>${json(revisions)}</details>`, wide: true });
      view.body.querySelector('[data-export]').onclick = () => {
        const url = URL.createObjectURL(new Blob([JSON.stringify(exported, null, 2)], { type: 'application/json' }));
        const link = document.createElement('a'); link.href = url; link.download = id + '.json'; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      };
    }
  };

  function nav() {
    document.getElementById('adminNav').innerHTML = allowed.map(([id, label]) =>
      `<a class="btn btn-ghost" href="#${id}" ${section === id ? 'aria-current="page"' : ''}>${esc(label)}</a>`).join('') +
      '<a class="btn btn-ghost" href="docs/admin-guide.md">Гид по админке</a>';
  }

  async function render() {
    const current = ++generation;
    document.getElementById('adminError')?.remove();
    host.dataset.section = section;
    host.innerHTML = '<p role="status">Загрузка серверных данных…</p>';
    nav();
    try {
      if (sections.find(s => s[0] === section)?.[2] === 'content') await loadContent();
      else {
        const route = { dashboard: 'quality/dashboard', versions: 'llm/prompts', providers: 'llm/providers', agents: 'llm/agents', audit: 'audit?limit=100', complaints: 'complaints?status=all', attempts: 'attempts?limit=100' }[section] || section;
        const data = await Api.get(root + route);
        if (current !== generation) return;
        if (section === 'dashboard') return dashboardView(data);
        if (['providers', 'agents'].includes(section)) return llmView(data);
        if (section === 'versions') return promptsView(data);
        if (section === 'complaints') return complaintsView(data);
        if (section === 'attempts') return attemptsView(data);
        if (section === 'students') return studentsView(data);
        if (section === 'users') return usersView(data);
        if (section === 'audit') { host.innerHTML = '<h2>Последние 100 действий</h2>' + table(['Дата', 'Пользователь', 'Действие', 'Объект'], data.map(d => [esc(d.createdAt), esc(d.userId), esc(d.action), esc(d.target)])); return; }
      }
      if (current !== generation) return;
      if (section === 'tasks') {
        AdminTasks.render(host, taskApi);
        // Импорт — отдельная операция, существующую задачу он не перезаписывает.
        const importButton = document.createElement('button');
        importButton.className = 'btn btn-ghost mb-16'; importButton.textContent = 'Импорт задачи из JSON';
        importButton.onclick = () => form('Импорт новой задачи', { task: '' }, [['task', 'JSON задачи', 'textarea']], async body => {
          await Api.post(root + 'tasks/import', { task: JSON.parse(body.task) });
        });
        host.append(importButton);
      } else referencesView();
    } catch (error) {
      if (current !== generation) return;
      host.innerHTML = '<p>Раздел не загружен.</p>';
      showError(error);
    }
  }

  function referencesView() {
    const kind = section, rows = content[kind];
    const fields = kind === 'tags' ? [['name', 'Название'], ['category', 'Категория (id)'], ['synonyms', 'Синонимы, по строке', 'lines'], ['active', 'Видна в каталоге', 'checkbox']]
      : kind === 'levels' ? [['name', 'Название'], ['description', 'Описание', 'textarea'], ['profile', 'Профиль', 'textarea'], ['timeHint', 'Подсказка времени']]
      : [['title', 'Название'], ['tagline', 'Кратко'], ['description', 'Описание', 'textarea'], ['icon', 'Иконка'], ['audience', 'Для кого'], ['taskIds', 'ID задач в нужном порядке, по строке', 'lines'], ['active', 'Видна в каталоге', 'checkbox']];
    const edit = item => form('Редактирование', item, fields, body => kind === 'levels' ? Api.put(root + kind + '/' + enc(item.id), body) : Api.post(root + kind, body));
    host.innerHTML = `<h2>${esc(allowed.find(s => s[0] === kind)[1])}</h2>${kind !== 'levels' ? button('Добавить', 'data-new', '') : ''}${table(['ID', 'Название', 'Состояние', 'Версия', ''], rows.map(r => [esc(r.id), esc(r.name || r.title), esc(r.active === false ? 'Скрыта' : 'Активна'), esc(r.version), button('Редактировать', 'data-edit', r.id) + (kind !== 'levels' ? button('Удалить', 'data-delete', r.id) : '')]))}`;
    host.querySelector('[data-new]')?.addEventListener('click', () => edit({ active: true }));
    host.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => edit(rows.find(r => r.id === b.dataset.edit)));
    host.querySelectorAll('[data-delete]').forEach(b => b.onclick = () => run(b, async () => {
      const item = rows.find(r => r.id === b.dataset.delete);
      if (!await AppUI.confirm({ title: 'Удалить запись?', text: item.name || item.title, confirmText: 'Удалить', danger: true })) return;
      await Api.delete(root + kind + '/' + enc(item.id) + '?version=' + enc(item.version));
      await render();
    }));
    if (kind === 'collections') host.insertAdjacentHTML('beforeend', '<h3>Доступные ID задач</h3>' + table(['ID', 'Задача', 'Статус'], content.tasks.map(t => [esc(t.id), esc(t.title), esc(t.status)])));
  }

  function dashboardView(data) {
    const k = data.kpi;
    host.innerHTML = '<h2>Качество ревью</h2><div class="kpi-row">' + [
      ['Задач опубликовано / всего', `${k.tasksPublished} / ${k.tasksTotal}`], ['Попыток', k.attempts],
      ['Средний балл', k.avgScore == null ? '—' : Number(k.avgScore).toFixed(1)], ['Новых жалоб', k.complaintsNew]
    ].map(([label, value]) => `<div class="kpi"><div class="k">${esc(label)}</div><div class="v">${esc(value)}</div></div>`).join('') + '</div><h3>Требуют внимания</h3>' +
      table(['Задача', 'Жалоб', 'Средний балл'], data.attention.map(r => [esc(r.taskTitle), esc(r.complaints), esc(r.avgScore ?? '—')])) +
      '<h3>Часто пропускаемые критерии</h3>' + table(['Критерий', 'Задача', 'Пропусков'], data.topMiss.map(r => [esc(r.title), esc(r.taskId), esc(r.count)]));
  }

  function attemptsView(rows) {
    host.innerHTML = '<h2>Последние 100 решений</h2>' + table(['Студент', 'Задача', 'Статус', 'Балл', 'Дата', ''], rows.map(r => [esc(r.userName), esc(r.taskTitle), esc(r.status), esc(r.score ?? '—'), esc(r.submittedAt), button('Решение и ревью', 'data-attempt', r.attemptId)]));
    host.querySelectorAll('[data-attempt]').forEach(b => b.onclick = () => run(b, async () => {
      const data = await Api.get(root + 'attempts/' + enc(b.dataset.attempt));
      const review = data.review;
      const states = { hit: 'Учтено', partial: 'Частично', miss: 'Не учтено' };
      const view = AppUI.modal({ title: data.taskTitle + ' · ' + data.userName,
        html: '<h3>Решение</h3>' + (data.tabs || []).map(t => `<h4>${esc(t.title)}</h4>${t.type === 'doc' ? AppUI.safeHtml(t.content) : `<pre style="white-space:pre-wrap">${esc(t.content)}</pre>`}`).join('') +
          (review ? `<h3>${esc(review.grade?.label)} · ${esc(review.grade?.score ?? '—')}/100</h3><p>${esc(review.summary)}</p><ul>${(review.why || []).map(w => `<li>${esc(w)}</li>`).join('')}</ul>` +
            table(['Критерий', 'Вес', 'Результат', 'Подтверждение / объяснение'], (review.criteria || []).map(c => [esc(c.title), esc(c.weightValue ?? c.weight), esc(states[c.state] || c.state), esc(c.evidence || c.why)])) +
            (review.agents || []).map(a => `<h3>${esc(a.name)} · ${esc(a.score)}/10</h3><p>${esc(a.narrative)}</p><ul>${(a.improve || []).map(i => `<li><b>${esc(i.title)}</b>: ${esc(i.detail)}</li>`).join('')}</ul>`).join('')
            : '<p>Ревью ещё не готово.</p>'), wide: true });
      // В разборе показываем исходник встроенной диаграммы без обращения к внешним сервисам.
      view.body.querySelectorAll('.diagram-embed').forEach(node => {
        const pre = document.createElement('pre'); pre.style.whiteSpace = 'pre-wrap';
        pre.textContent = decodeURIComponent(node.dataset.source || ''); node.replaceWith(pre);
      });
    }));
  }

  function studentsView(rows) {
    host.innerHTML = '<h2>Студенты</h2>' + table(['Имя', 'Email', 'Попыток', 'Средний балл', 'Активность', ''], rows.map(r => [esc(r.name), esc(r.email), esc(r.attempts), esc(r.avgScore ?? '—'), esc(r.lastActive ?? '—'), button('Карточка', 'data-student', r.id)]));
    host.querySelectorAll('[data-student]').forEach(b => b.onclick = () => run(b, async () => {
      const data = await Api.get(root + 'students/' + enc(b.dataset.student)), s = data.student;
      AppUI.modal({ title: s.name, html: `<p>${esc(s.email)}</p><p>Попыток: ${esc(s.attempts)} · средний балл: ${esc(s.avgScore ?? '—')}</p><h3>Последние 5 попыток</h3>` +
        table(['Задача', 'Статус', 'Балл', 'Дата'], data.recent.map(r => [esc(r.taskTitle), esc(r.status), esc(r.score ?? '—'), esc(r.submittedAt)])), wide: true });
    }));
  }

  function complaintsView(rows) {
    host.innerHTML = '<h2>Жалобы</h2>' + table(['Студент / задача', 'Причина', 'Статус', 'Решение', ''], rows.map(r => [esc(r.userName + ' · ' + r.taskTitle), esc(r.reason), esc(r.status), esc(r.resolution || '—'), ['resolved', 'rejected'].includes(r.status) ? 'Закрыта' : button('Разобрать', 'data-complaint', r.id)]));
    host.querySelectorAll('[data-complaint]').forEach(b => b.onclick = () => {
      const item = rows.find(r => r.id === b.dataset.complaint);
      form('Разбор жалобы · ' + item.taskTitle, item, [['status', 'Статус', 'select', ['review', 'resolved', 'rejected']], ['resolution', 'Итог разбора', 'textarea']], body => Api.patch(root + 'complaints/' + enc(item.id), body));
    });
  }

  function llmView(rows) {
    const providers = section === 'providers';
    const fields = providers ? [['id', 'ID'], ['name', 'Название'], ['baseUrl', 'Базовый URL'], ['model', 'Модель'], ['keyEnv', 'Имя переменной окружения с ключом'], ['timeoutSec', 'Таймаут, секунд', 'number'], ['enabled', 'Включён', 'checkbox']]
      : [['name', 'Название'], ['role', 'Роль'], ['checks', 'Зоны проверки, по строке', 'lines'], ['model', 'Модель'], ['enabled', 'Включён', 'checkbox']];
    const edit = item => form(providers ? 'Провайдер (ключ задаётся на сервере через env)' : 'Агент', item, fields, body => providers ? Api.post(root + 'llm/providers', body) : Api.put(root + 'llm/agents/' + enc(item.id), body));
    host.innerHTML = `<h2>${providers ? 'Провайдеры' : 'Агенты'}</h2>${providers ? button('Добавить провайдера', 'data-new', '') : ''}` + table(['ID', 'Название', 'Модель', 'Состояние', ''], rows.map(r => [esc(r.id), esc(r.name), esc(r.model || 'По умолчанию'), esc(r.enabled ? 'Включён' : 'Выключен'), button('Редактировать', 'data-edit', r.id) + (providers ? button('Проверить соединение', 'data-check', r.id) : '')]));
    host.querySelector('[data-new]')?.addEventListener('click', () => edit({ timeoutSec: 90, enabled: true }));
    host.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => edit(rows.find(r => r.id === b.dataset.edit)));
    host.querySelectorAll('[data-check]').forEach(b => b.onclick = () => run(b, async () => {
      const result = await Api.post(root + 'llm/providers/' + enc(b.dataset.check) + '/check', {});
      AppUI.toast(result.keyPresent ? 'Провайдер ответил успешно' : 'Нет ключа или провайдер недоступен', result.keyPresent ? 'ok' : 'warn');
    }));
  }

  function promptsView(prompts) {
    host.innerHTML = '<h2>Версии промптов</h2>' + table(['Промпт', 'Агент', ''], prompts.map(p => [esc(p.name), esc(p.agent), button('Открыть версии', 'data-prompt', p.key)]));
    const slot = document.createElement('div'); host.append(slot);
    let selection = 0;
    host.querySelectorAll('[data-prompt]').forEach(b => b.onclick = () => run(b, async () => {
      const key = b.dataset.prompt, current = generation, selected = ++selection;
      const rows = await Api.get(root + 'llm/prompts/' + enc(key) + '/versions');
      if (current !== generation || selected !== selection) return;
      slot.innerHTML = `<h3>${esc(key)}</h3>${button('Новая версия', 'data-create-version', '')}` + table(['Версия', 'Статус', 'Трафик, %', 'Изменения', ''], rows.map(r => [esc(r.v), esc(r.status), esc(r.traffic), esc(r.changelog), button('Текст / правка', 'data-version', r.id) + button('Копировать в новую', 'data-copy-version', r.id) + button('Назначить 100%', 'data-promote', r.id) + button('Трафик', 'data-traffic', r.id)]));
      const edit = (item, create) => form(create ? 'Новая версия (сначала без трафика)' : 'Правка версии без трафика', { ...item, traffic: 0 }, [['text', 'Текст', 'textarea'], ['changelog', 'Что изменилось'], ['model', 'Модель']], body => create ? Api.post(root + 'llm/prompts/' + enc(key) + '/versions', body) : Api.put(root + 'llm/versions/' + enc(item.id), body));
      slot.querySelector('[data-create-version]').onclick = () => edit({}, true);
      slot.querySelectorAll('[data-copy-version]').forEach(btn => btn.onclick = () => edit({ ...rows.find(r => r.id === btn.dataset.copyVersion), version: null, changelog: '' }, true));
      slot.querySelectorAll('[data-version]').forEach(btn => btn.onclick = () => {
        const item = rows.find(r => r.id === btn.dataset.version);
        if (item.traffic > 0) AppUI.modal({ title: 'Рабочая версия: создайте новую для изменений',
          html: `<p>Версия ${esc(item.v)} · трафик ${esc(item.traffic)}% · модель ${esc(item.model || 'По умолчанию')}</p><p>${esc(item.changelog)}</p><pre style="white-space:pre-wrap">${esc(item.text)}</pre>`, wide: true });
        else edit(item, false);
      });
      slot.querySelectorAll('[data-promote]').forEach(btn => btn.onclick = () => run(btn, async () => {
        const item = rows.find(r => r.id === btn.dataset.promote);
        if (!await AppUI.confirm({ title: 'Назначить версию рабочей?', text: 'Все новые ревью будут использовать эту версию. Остальные версии получат 0% трафика.', confirmText: 'Назначить' })) return;
        await Api.post(root + 'llm/versions/' + enc(item.id) + '/promote', { version: item.version });
        await render();
      }));
      slot.querySelectorAll('[data-traffic]').forEach(btn => btn.onclick = () => {
        const item = rows.find(r => r.id === btn.dataset.traffic);
        form('Доля версии; остаток получает активная версия', item, [['traffic', 'Трафик, 0–100%', 'number']], body => Api.post(root + 'llm/versions/' + enc(item.id) + '/traffic', body));
      });
    }));
  }

  function usersView(rows) {
    host.innerHTML = '<h2>Роли пользователей</h2>' + table(['Имя', 'Email', 'Роль', ''], rows.map(r => [esc(r.name), esc(r.email), esc(r.role), r.id === Api.user.id ? 'Ваш аккаунт' : button('Изменить роль', 'data-user', r.id)]));
    host.querySelectorAll('[data-user]').forEach(b => b.onclick = () => {
      const item = rows.find(r => r.id === b.dataset.user);
      form('Роль · ' + item.email, item, [['role', 'Роль', 'select', ['STUDENT', 'METHODIST', 'REVIEWER', 'LLM_ADMIN', 'SUPERADMIN']]], body => Api.put(root + 'users/' + enc(item.id) + '/role', { role: body.role, expectedRole: item.role }));
    });
  }

  async function start() {
    host = document.getElementById('adminMain');
    if (Api.mode !== 'server' || !Api.user) {
      host.innerHTML = '<h2>Войдите в аккаунт сотрудника</h2><a class="btn btn-primary" href="login.html?next=admin.html">Войти</a>';
      return;
    }
    const role = Api.user.role, superadmin = role === 'SUPERADMIN';
    const groups = { content: superadmin || role === 'METHODIST', quality: superadmin || ['METHODIST', 'REVIEWER'].includes(role), llm: superadmin || role === 'LLM_ADMIN', super: superadmin };
    allowed = sections.filter(s => groups[s[2]]);
    if (!allowed.length) { host.innerHTML = '<h2>Нет доступа к админке</h2><p>Нужна роль сотрудника. Права проверяются сервером.</p>'; return; }
    const updateRoute = () => {
      const hash = location.hash.slice(1);
      section = allowed.some(s => s[0] === hash) ? hash : allowed[0][0];
      render();
    };
    const deepTask = new URLSearchParams(location.search).get('task');
    if (deepTask && groups.content) AdminTasks.openTask(deepTask);
    window.addEventListener('hashchange', updateRoute);
    updateRoute();
  }

  return { start };
})();
