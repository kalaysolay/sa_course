/* ============================================================
   admin-ops.js — операционные разделы: дашборд, пользователи,
   жалобы, версии. Данные: локальные попытки + демо-сиды
   (жалобы, пользователи, промпты) — в продукте заменяются API.
   ============================================================ */

window.AdminOps = (function () {

  let api = null;
  let complaintFilter = 'all';
  let openComplaintId = null;

  const COMPLAINT_STYLE = { new: 'badge-bad', review: 'badge-info', resolved: 'badge-ok', rejected: 'badge' };

  function complaintStatusName(id) {
    const found = Store.complaintStatuses().find((s) => s.id === id);
    return found ? found.name : id;
  }

  function taskTitle(taskId) {
    const task = Store.task(taskId);
    return task ? task.title : taskId;
  }

  function initials(name) {
    return String(name || '?').split(/[\s.]+/).filter(Boolean).slice(0, 2)
      .map((part) => part[0].toUpperCase()).join('');
  }

  function localAvg(taskId) {
    const scores = Store.attempts(taskId)
      .filter((a) => a.review && a.review.grade)
      .map((a) => a.review.grade.score);
    if (!scores.length) return null;
    return Math.round(scores.reduce((s, v) => s + v, 0) / scores.length);
  }

  function render(host, adminApi) {
    api = adminApi;
    const section = document.getElementById('adminMain').dataset.section || 'dashboard';
    if (section === 'dashboard') renderDashboard(host);
    else if (section === 'attempts') renderAttempts(host);
    else if (section === 'users') renderUsers(host);
    else if (section === 'complaints') renderComplaints(host);
    else if (section === 'agents') renderAgents(host);
    else if (section === 'versions') renderVersions(host);
  }

  /* ==================== ДАШБОРД ==================== */

  function topMissCriteria() {
    const miss = {};
    Object.values(Store.all().attempts || {}).forEach((list) => {
      list.forEach((attempt) => {
        if (!attempt.review || !attempt.review.criteria) return;
        attempt.review.criteria.forEach((c) => {
          if (c.state === 'miss') {
            miss[c.title] = miss[c.title] || { title: c.title, count: 0, taskId: attempt.taskId };
            miss[c.title].count += 1;
          }
        });
      });
    });
    return Object.values(miss).sort((a, b) => b.count - a.count).slice(0, 5);
  }

  function attentionList() {
    const complaints = Store.complaints().filter((c) => c.status === 'new' || c.status === 'review');
    const byTask = {};
    complaints.forEach((c) => {
      byTask[c.taskId] = byTask[c.taskId] || { taskId: c.taskId, complaints: 0, avg: localAvg(c.taskId) };
      byTask[c.taskId].complaints += 1;
    });
    Store.tasks().forEach((task) => {
      const avg = localAvg(task.id);
      if (avg !== null && avg < 50 && !byTask[task.id]) {
        byTask[task.id] = { taskId: task.id, complaints: 0, avg };
      }
    });
    return Object.values(byTask)
      .sort((a, b) => (b.complaints - a.complaints) || ((a.avg || 99) - (b.avg || 99)))
      .slice(0, 5);
  }

  function renderDashboard(host) {
    const tasks = Store.tasks();
    const published = tasks.filter((t) => Store.taskStatus(t.id) === 'published').length;
    const attempts = Object.values(Store.all().attempts || {}).reduce((s, l) => s + l.length, 0);
    const allScores = [];
    Object.values(Store.all().attempts || {}).forEach((list) => {
      list.forEach((a) => { if (a.review && a.review.grade) allScores.push(a.review.grade.score); });
    });
    const avg = allScores.length ? Math.round(allScores.reduce((s, v) => s + v, 0) / allScores.length) : null;
    const complaints = Store.complaints();
    const openComplaints = complaints.filter((c) => c.status === 'new').length;
    const attention = attentionList();
    const topMiss = topMissCriteria();
    const recent = complaints.slice()
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 4);

    host.innerHTML = `
      <div class="kpi-row">
        <div class="kpi"><div class="k">Задач опубликовано</div><div class="v">${published}<span class="dim" style="font-size:14px">/${tasks.length}</span></div></div>
        <div class="kpi"><div class="k">Попыток студентов</div><div class="v">${attempts}</div></div>
        <div class="kpi"><div class="k">Средний балл</div><div class="v">${avg === null ? '—' : avg}</div></div>
        <div class="kpi"><div class="k">Жалоб новых</div><div class="v" style="color:${openComplaints ? 'var(--bad)' : 'var(--ok)'}">${openComplaints}</div></div>
      </div>

      <div class="grid-2" style="align-items:start">
        <div class="panel">
          <div class="panel-head"><p class="panel-title">Требуют внимания</p><span class="badge">жалобы + низкие баллы</span></div>
          <div class="collection-tasks">
            ${attention.length ? attention.map((item) => `
              <a class="collection-task" href="admin.html?task=${AppUI.esc(item.taskId)}">
                <span class="task-status" data-state="${item.complaints ? 'review' : 'draft'}">${item.complaints ? '!' : '–'}</span>
                <span>${AppUI.esc(taskTitle(item.taskId))}</span>
                <span class="lvl">${item.complaints ? `<span class="badge badge-bad">жалоб: ${item.complaints}</span>` : ''} ${item.avg !== null ? `<span class="badge">ср. ${item.avg}</span>` : ''}</span>
              </a>`).join('') : '<div class="empty-state" style="margin:12px"><h3>Тихо</h3><p class="muted">Жалоб нет, провальных средних баллов нет.</p></div>'}
          </div>
        </div>

        <div class="panel">
          <div class="panel-head"><p class="panel-title">Топ miss-критериев</p><span class="badge">по вашим попыткам</span></div>
          <div class="panel-body">
            ${topMiss.length ? `<div class="competency-bars">${topMiss.map((m) => `
              <div class="cbar" data-tier="bad">
                <div class="top"><span class="name">${AppUI.esc(m.title)}</span><span class="pct">×${m.count}</span></div>
                <div class="track"><i style="width:${Math.min(100, m.count * 25)}%"></i></div>
                <div class="verdict"><a class="link-btn" href="admin.html?task=${AppUI.esc(m.taskId)}">открыть рубрику →</a></div>
              </div>`).join('')}</div>`
              : `<div class="empty-state"><h3>Пока нечего считать</h3><p class="muted" style="margin-bottom:12px">Отправьте пару решений на ревью — здесь появятся критерии, которые валят чаще всего. Это главный сигнал чинить рубрику, а не студентов.</p><a class="btn btn-ghost btn-sm" href="catalog.html">К задачам</a></div>`}
          </div>
        </div>
      </div>

      <div class="panel mt-16">
        <div class="panel-head"><p class="panel-title">Последние жалобы</p><a class="link-btn" href="#" data-goto="complaints">все жалобы →</a></div>
        <div class="collection-tasks">
          ${recent.map((c) => `
            <a class="collection-task" href="#" data-open-complaint="${AppUI.esc(c.id)}">
              <span class="task-status" data-state="${c.status === 'new' ? 'draft' : c.status === 'review' ? 'review' : 'done'}">${c.status === 'resolved' ? '✓' : '!'}</span>
              <span>${AppUI.esc(c.reason.slice(0, 90))}${c.reason.length > 90 ? '…' : ''}</span>
              <span class="lvl"><span class="badge ${COMPLAINT_STYLE[c.status]}">${complaintStatusName(c.status)}</span></span>
            </a>`).join('')}
        </div>
      </div>`;

    bindGoto(host);
    host.querySelectorAll('[data-open-complaint]').forEach((link) => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        openComplaintId = link.dataset.openComplaint;
        api.gotoSection('complaints');
      });
    });
  }

  function bindGoto(host) {
    host.querySelectorAll('[data-goto]').forEach((link) => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        api.gotoSection(link.dataset.goto);
      });
    });
  }

  /* ==================== ПОЛЬЗОВАТЕЛИ ==================== */

  function renderUsers(host) {
    const users = SA_DATA.users || [];
    const avgAll = Math.round(users.reduce((s, u) => s + u.avg, 0) / Math.max(1, users.length));
    host.innerHTML = `
      <div class="kpi-row">
        <div class="kpi"><div class="k">Студентов</div><div class="v">${users.length}</div></div>
        <div class="kpi"><div class="k">Средний балл</div><div class="v">${avgAll}</div></div>
        <div class="kpi"><div class="k">Активны (7 дней)</div><div class="v">${users.filter((u) => (Date.now() - new Date(u.lastActive).getTime()) < 7 * 864e5).length}</div></div>
        <div class="kpi"><div class="k">Жалоб от них</div><div class="v">${Store.complaints().length}</div></div>
      </div>

      <div class="panel">
        <div class="panel-head"><p class="panel-title">Студенты</p><span class="badge">демо-данные</span></div>
        <div style="overflow:auto">
          <table class="data-table">
            <thead><tr><th>Студент</th><th>Роль</th><th>Уровень</th><th style="text-align:right">Попыток</th><th style="text-align:right">Ср. балл</th><th>Активность</th><th></th></tr></thead>
            <tbody>
              ${users.map((user) => `
                <tr>
                  <td>
                    <div class="row" style="gap:10px">
                      <span class="avatar" style="width:32px;height:32px;font-size:11px">${initials(user.name)}</span>
                      <span style="color:var(--text);font-weight:550">${AppUI.esc(user.name)}</span>
                    </div>
                  </td>
                  <td><span class="chip">${AppUI.esc(user.role)}</span></td>
                  <td class="dim">${AppUI.esc(user.level)}</td>
                  <td style="text-align:right" class="mono">${user.attempts}</td>
                  <td style="text-align:right" class="mono">${user.avg}</td>
                  <td class="dim" style="font-size:12px">${AppUI.timeAgo(user.lastActive)}</td>
                  <td><div class="cell-actions"><button class="icon-btn" type="button" data-user="${AppUI.esc(user.id)}" title="Карточка студента">→</button></div></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <div class="solution-foot"><span class="dim">В продукте здесь живые пользователи с их попытками, уровнями диагностики и жалобами.</span></div>
      </div>`;

    host.querySelectorAll('[data-user]').forEach((button) => {
      button.addEventListener('click', () => {
        const user = users.find((u) => u.id === button.dataset.user);
        if (!user) return;
        AppUI.modal({
          title: user.name,
          wide: true,
          html: `
            <div class="row mb-16" style="gap:8px;flex-wrap:wrap">
              <span class="chip">${AppUI.esc(user.role)}</span>
              <span class="badge">${AppUI.esc(user.level)}</span>
              <span class="badge">попыток: ${user.attempts}</span>
              <span class="badge badge-accent">средний балл: ${user.avg}</span>
            </div>
            <div class="mono dim" style="font-size:10.5px;letter-spacing:.1em;margin-bottom:8px">ПОСЛЕДНИЕ ПОПЫТКИ</div>
            ${(user.recent || []).map((r) => `
              <div class="plan-item" style="margin-bottom:6px">
                <span class="n">${r.score}/100</span>
                <div><div class="t">${AppUI.esc(taskTitle(r.taskId))}</div></div>
                <span class="row" style="gap:8px">
                  <a class="btn btn-ghost btn-sm" href="task.html?id=${AppUI.esc(r.taskId)}">Задача ↗</a>
                </span>
              </div>`).join('')}
            <div class="info-box mt-16"><div class="ib-title">В продукте</div>
            <p style="margin:0;font-size:13px">Здесь же: история диагностики, все попытки с текстами решений, жалобы студента, заметки методиста.</p></div>`
        });
      });
    });
  }

  /* ==================== ЖАЛОБЫ ==================== */

  function complaintBadge(status) {
    return `<span class="badge ${COMPLAINT_STYLE[status] || 'badge'}">${complaintStatusName(status)}</span>`;
  }

  function renderComplaints(host) {
    const all = Store.complaints();
    const statuses = Store.complaintStatuses();
    const counts = {};
    all.forEach((c) => { counts[c.status] = (counts[c.status] || 0) + 1; });
    const list = all.filter((c) => complaintFilter === 'all' || c.status === complaintFilter)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    host.innerHTML = `
      <div class="kpi-row">
        ${statuses.map((s) => `<div class="kpi"><div class="k">${s.name}</div><div class="v">${counts[s.id] || 0}</div></div>`).join('')}
      </div>

      <div class="panel">
        <div class="panel-head">
          <p class="panel-title">Очередь жалоб</p>
          <select class="select" id="complaintFilter">
            <option value="all">Все статусы</option>
            ${statuses.map((s) => `<option value="${s.id}" ${complaintFilter === s.id ? 'selected' : ''}>${s.name} (${counts[s.id] || 0})</option>`).join('')}
          </select>
        </div>
        <div style="overflow:auto">
          <table class="data-table">
            <thead><tr><th style="width:30%">Причина</th><th>Задача</th><th>Студент</th><th style="text-align:right">Балл</th><th>Промпт</th><th>Статус</th><th>Дата</th><th></th></tr></thead>
            <tbody>
              ${list.length ? list.map((c) => `
                <tr>
                  <td style="color:var(--text)">${AppUI.esc(c.reason.slice(0, 80))}${c.reason.length > 80 ? '…' : ''}</td>
                  <td class="dim" style="font-size:12px">${AppUI.esc(taskTitle(c.taskId))}</td>
                  <td>${AppUI.esc(c.user)}</td>
                  <td style="text-align:right" class="mono">${c.score}</td>
                  <td class="mono dim" style="font-size:11px">${AppUI.esc(c.promptVersion || '—')}</td>
                  <td>${complaintBadge(c.status)}</td>
                  <td class="dim" style="font-size:12px">${AppUI.dateTime(c.createdAt)}</td>
                  <td><div class="cell-actions"><button class="btn btn-ghost btn-sm" type="button" data-complaint="${AppUI.esc(c.id)}">Разобрать</button></div></td>
                </tr>`).join('') : `<tr><td colspan="8" class="center muted" style="padding:32px">Очередь пуста. Хороший знак — или сломанная кнопка «Оспорить» у студентов.</td></tr>`}
            </tbody>
          </table>
        </div>
        <div class="solution-foot"><span class="dim">Разбор жалобы заканчивается либо правкой рубрики/промпта, либо ответом студенту. Оба исхода фиксируются.</span></div>
      </div>`;

    host.querySelector('#complaintFilter').addEventListener('change', (e) => {
      complaintFilter = e.target.value;
      renderComplaints(host);
    });
    host.querySelectorAll('[data-complaint]').forEach((button) => {
      button.addEventListener('click', () => openComplaintModal(button.dataset.complaint));
    });

    if (openComplaintId) {
      const id = openComplaintId;
      openComplaintId = null;
      openComplaintModal(id);
    }
  }

  function openComplaintModal(id) {
    const complaint = Store.complaints().find((c) => c.id === id);
    if (!complaint) return;
    const dialog = AppUI.modal({
      title: `Жалоба ${complaint.id}`,
      wide: true,
      html: `
        <div class="row mb-16" style="gap:8px;flex-wrap:wrap">
          ${complaintBadge(complaint.status)}
          <span class="badge">балл: ${complaint.score}/100</span>
          <span class="badge">${AppUI.esc(complaint.promptVersion || 'движок неизвестен')}</span>
          <span class="badge">${AppUI.esc(AppUI.dateTime(complaint.createdAt))}</span>
        </div>
        <div class="grid-2" style="gap:14px">
          <div class="info-box" style="margin:0">
            <div class="ib-title">Текст студента (фрагмент решения)</div>
            <p style="margin:0;font-size:13.5px">«${AppUI.esc(complaint.excerpt)}»</p>
          </div>
          <div class="info-box" style="margin:0">
            <div class="ib-title">Причина спора</div>
            <p style="margin:0;font-size:13.5px">${AppUI.esc(complaint.reason)}</p>
          </div>
        </div>
        ${complaint.resolution ? `<div class="info-box mt-16" style="border-left:2px solid var(--ok)"><div class="ib-title">Решение</div><p style="margin:0;font-size:13.5px">${AppUI.esc(complaint.resolution)}</p></div>` : ''}
        <div class="field mt-16"><label>Итог разбора (сохранится в жалобу)</label>
          <input id="resolutionInput" type="text" placeholder="Например: правка маркеров критерия «outbox» в рубрике" value="${AppUI.esc(complaint.resolution || '')}">
        </div>
        <div class="row mt-16" style="gap:8px;flex-wrap:wrap">
          <a class="btn btn-ghost btn-sm" href="admin.html?task=${AppUI.esc(complaint.taskId)}">Рубрика задачи →</a>
          <a class="btn btn-ghost btn-sm" href="task.html?id=${AppUI.esc(complaint.taskId)}">Задача глазами студента ↗</a>
        </div>
        <div class="modal-actions" style="justify-content:flex-start">
          <button class="btn btn-ghost btn-sm" type="button" data-cstatus="review">Взять в работу</button>
          <button class="btn btn-primary btn-sm" type="button" data-cstatus="resolved">Решена</button>
          <button class="btn btn-danger btn-sm" type="button" data-cstatus="rejected">Отклонить</button>
        </div>`
    });
    dialog.body.querySelectorAll('[data-cstatus]').forEach((button) => {
      button.addEventListener('click', () => {
        const resolution = dialog.body.querySelector('#resolutionInput').value.trim();
        Store.saveComplaint(id, { status: button.dataset.cstatus, resolution });
        dialog.close();
        AppUI.toast(`Жалоба ${id}: ${complaintStatusName(button.dataset.cstatus)}`, 'ok');
        api.refresh();
      });
    });
  }

  /* ==================== ВЕРСИИ ==================== */

  function renderVersions(host) {
    const prompts = Store.prompts();

    host.innerHTML = `
      <div class="panel mb-16">
        <div class="panel-head"><p class="panel-title">Промпты и A/B</p><span class="badge">трафик в % на версию</span></div>
        <div class="panel-body" style="display:grid;gap:18px">
          ${prompts.map((prompt) => `
            <div class="card" style="padding:18px">
              <div class="row-between mb-16" style="flex-wrap:wrap;gap:10px">
                <div>
                  <div style="font-weight:650;font-size:15px">${AppUI.esc(prompt.name)}</div>
                  <div class="mono dim" style="font-size:11px">ключ: ${AppUI.esc(prompt.key)} · ${AppUI.esc(prompt.agent)}</div>
                </div>
                <span class="row" style="gap:8px">
                  <span class="badge badge-violet">версий: ${prompt.versions.length}</span>
                  <button class="btn btn-ghost btn-sm" type="button" data-new-version="${AppUI.esc(prompt.key)}">+ Новая версия</button>
                </span>
              </div>
              <div style="overflow:auto">
                <table class="data-table">
                  <thead><tr><th style="width:8%">v</th><th style="width:12%">Статус</th><th style="width:14%">Трафик, %</th><th style="width:12%">Обновлён</th><th style="width:34%">Changelog</th><th style="width:20%"></th></tr></thead>
                  <tbody>
                    ${prompt.versions.map((v) => `
                      <tr>
                        <td class="mono" style="color:var(--text)">v${v.v}</td>
                        <td>${v.status === 'active' ? '<span class="badge badge-ok">активна</span>' : v.status === 'canary' ? '<span class="badge badge-info">canary</span>' : '<span class="badge">в архиве</span>'}</td>
                        <td>
                          <div class="row" style="gap:6px">
                            <input type="number" min="0" max="100" step="5" value="${v.traffic}" data-traffic="${AppUI.esc(prompt.key)}:${v.v}" style="width:64px;padding:6px 8px;background:var(--bg-soft);border:1px solid var(--line);border-radius:6px;color:var(--text)">
                            <div class="progress-bar" style="flex:1;min-width:60px"><i style="width:${v.traffic}%"></i></div>
                          </div>
                        </td>
                        <td class="dim" style="font-size:12px">${AppUI.esc(v.updatedAt || '—')}</td>
                        <td class="dim" style="font-size:12.5px">${AppUI.esc(v.changelog || '')}<div class="mono" style="font-size:10.5px">${AppUI.esc(v.model || '')}</div></td>
                        <td>
                          <div class="cell-actions">
                            <button class="btn btn-ghost btn-sm" type="button" data-version-text="${AppUI.esc(prompt.key)}:${v.v}">Текст${v.text ? ' •' : ''}</button>
                            ${v.status !== 'active' ? `<button class="btn btn-ghost btn-sm" type="button" data-promote="${AppUI.esc(prompt.key)}:${v.v}">Сделать активной</button>` : '<span class="badge badge-ok">в проде</span>'}
                          </div>
                        </td>
                      </tr>`).join('')}
                  </tbody>
                </table>
              </div>
            </div>`).join('')}
        </div>
        <div class="solution-foot"><span class="dim">Сумма трафика по промпту должна быть 100%. Канарейка → сравнение баллов и жалоб → promote. В продукте переключение без редеплоя.</span></div>
      </div>

      <div class="panel">
        <div class="panel-head"><p class="panel-title">Ревизии рубрик</p><span class="badge">из правок задач</span></div>
        <div style="overflow:auto">
          <table class="data-table">
            <thead><tr><th>Задача</th><th style="text-align:right">Критериев</th><th>Ревизия</th><th>Обновлена</th><th></th></tr></thead>
            <tbody>
              ${Store.tasks().map((task) => {
                const edits = (Store.all().taskEdits || {})[task.id];
                const rubric = Store.task(task.id).rubric || [];
                return `
                  <tr>
                    <td><span style="color:var(--text)">${AppUI.esc(task.title)}</span> <span class="mono dim" style="font-size:11px">${AppUI.esc(task.id)}</span></td>
                    <td style="text-align:right" class="mono">${rubric.length}</td>
                    <td>${edits ? '<span class="badge badge-warn">v2 · есть правки</span>' : '<span class="badge">v1 · исходная</span>'}</td>
                    <td class="dim" style="font-size:12px">${edits && edits.updatedAt ? AppUI.dateTime(edits.updatedAt) : '—'}</td>
                    <td><div class="cell-actions"><a class="btn btn-ghost btn-sm" href="admin.html?task=${AppUI.esc(task.id)}">Рубрика →</a></div></td>
                  </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
        <div class="solution-foot"><span class="dim">Движок ревью: <span class="mono">mock-agents/v1</span> · веса high=3/mid=2/low=1 + числовые 1–10 из админки</span></div>
      </div>`;

    host.querySelectorAll('[data-traffic]').forEach((input) => {
      input.addEventListener('change', () => {
        const [key, version] = input.dataset.traffic.split(':');
        Store.setPromptTraffic(key, Number(version), input.value);
        AppUI.toast(`Трафик ${key} v${version}: ${input.value}%`, 'ok');
        api.refresh();
      });
    });
    host.querySelectorAll('[data-version-text]').forEach((button) => {
      button.addEventListener('click', () => {
        const [key, version] = button.dataset.versionText.split(':');
        const prompt = Store.prompts().find((p) => p.key === key);
        const current = prompt ? prompt.versions.find((v) => v.v === Number(version)) : null;
        const dialog = AppUI.modal({
          title: `Текст: ${key} v${version}`,
          wide: true,
          html: `
            <p class="muted" style="font-size:13px;margin-bottom:12px">Плейсхолдеры: <span class="mono">solution</span>, <span class="mono">rubric</span>, <span class="mono">task_title</span>, <span class="mono">criteria</span> — в фигурных скобках. В макете текст хранится, но mock-движок его не читает (читает рубрику); текст заработает с LLM-пайплайном.</p>
            <div class="field"><label>Текст промпта</label>
              <textarea id="promptText" rows="14" placeholder="Например: Ты — системный аналитик. Разбери решение по рубрике: {{rubric}}…">${AppUI.esc((current && current.text) || '')}</textarea>
            </div>
            <div class="modal-actions"><button class="btn btn-primary" type="button" id="savePromptTextBtn">Сохранить текст</button></div>`
        });
        dialog.body.querySelector('#savePromptTextBtn').addEventListener('click', () => {
          Store.savePromptVersion(key, Number(version), { text: dialog.body.querySelector('#promptText').value });
          dialog.close();
          AppUI.toast(`Текст ${key} v${version} сохранён`, 'ok');
          api.refresh();
        });
      });
    });
    host.querySelectorAll('[data-new-version]').forEach((button) => {
      button.addEventListener('click', () => {
        const key = button.dataset.newVersion;
        const prompt = Store.prompts().find((p) => p.key === key);
        const nextV = prompt ? Math.max(...prompt.versions.map((v) => v.v)) + 1 : 1;
        const dialog = AppUI.modal({
          title: `Новая версия: ${key} v${nextV}`,
          wide: true,
          html: `
            <div class="field"><label>Скопировать текст из</label>
              <select id="newVersionBase">
                ${prompt.versions.map((v) => `<option value="${v.v}" ${v.status === 'active' ? 'selected' : ''}>v${v.v} (${v.status})</option>`).join('')}
                <option value="">с нуля</option>
              </select>
            </div>
            <div class="field"><label>Changelog — что изменилось и зачем</label>
              <textarea id="newVersionLog" rows="3" placeholder="Например: Смягчили проверку UX-текстов: жалобы cmp-1041, cmp-1039"></textarea>
            </div>
            <div class="field"><label>Стартовый трафик, % (0 — в архив, >0 — канарейка)</label>
              <input id="newVersionTraffic" type="number" min="0" max="100" step="5" value="0">
            </div>
            <div class="field"><label>Текст промпта</label>
              <textarea id="newVersionText" rows="10" placeholder="Плейсхолдеры: solution, rubric, task_title, criteria"></textarea>
            </div>
            <div class="modal-actions"><button class="btn btn-primary" type="button" id="createVersionBtn">Создать v${nextV}</button></div>`
        });
        const baseSelect = dialog.body.querySelector('#newVersionBase');
        const textArea = dialog.body.querySelector('#newVersionText');
        const fillBase = () => {
          const base = prompt.versions.find((v) => String(v.v) === baseSelect.value);
          textArea.value = (base && base.text) || '';
        };
        baseSelect.addEventListener('change', fillBase);
        fillBase();
        dialog.body.querySelector('#createVersionBtn').addEventListener('click', () => {
          const changelog = dialog.body.querySelector('#newVersionLog').value.trim();
          if (!changelog) {
            AppUI.toast('Changelog обязателен — иначе версию не отличить', 'warn');
            return;
          }
          Store.addPromptVersion(key, {
            v: nextV,
            changelog,
            traffic: dialog.body.querySelector('#newVersionTraffic').value,
            text: textArea.value
          });
          dialog.close();
          AppUI.toast(`Версия ${key} v${nextV} создана`, 'ok');
          api.refresh();
        });
      });
    });
    host.querySelectorAll('[data-promote]').forEach((button) => {
      button.addEventListener('click', () => {
        const [key, version] = button.dataset.promote.split(':');
        AppUI.confirm({
          title: `Сделать v${version} активной?`,
          text: `Промпт «${key}»: весь трафик (100%) перейдёт на v${version}, остальные версии уйдут в архив.`,
          confirmText: 'Выпустить'
        }).then((ok) => {
          if (!ok) return;
          Store.promotePrompt(key, Number(version));
          AppUI.toast(`Промпт ${key} v${version} в проде`, 'ok');
          api.refresh();
        });
      });
    });
  }

  /* ==================== АГЕНТЫ ==================== */

  /* ==================== USER SOLUTIONS ==================== */

  let attemptTaskFilter = 'all';

  function allAttempts() {
    const out = [];
    Object.entries(Store.all().attempts || {}).forEach(([taskId, list]) => {
      (list || []).forEach((attempt) => out.push(Object.assign({ taskId }, attempt)));
    });
    return out.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
  }

  function gradeBadge(score) {
    if (score === null || score === undefined) return '<span class="badge">—</span>';
    const cls = score >= 85 ? 'badge-accent' : score >= 66 ? 'badge-ok' : score >= 46 ? 'badge-warn' : 'badge-bad';
    return `<span class="badge ${cls}">${score}/100</span>`;
  }

  function renderAttempts(host) {
    const all = allAttempts();
    const tasks = Store.tasks();
    const list = all.filter((a) => attemptTaskFilter === 'all' || a.taskId === attemptTaskFilter);

    host.innerHTML = `
      <div class="kpi-row">
        <div class="kpi"><div class="k">Всего попыток</div><div class="v">${all.length}</div></div>
        <div class="kpi"><div class="k">С ревью</div><div class="v">${all.filter((a) => a.status === 'reviewed').length}</div></div>
        <div class="kpi"><div class="k">В процессе</div><div class="v">${all.filter((a) => a.status === 'in_review').length}</div></div>
        <div class="kpi"><div class="k">Задач затронуто</div><div class="v">${new Set(all.map((a) => a.taskId)).size}</div></div>
      </div>

      <div class="panel">
        <div class="panel-head">
          <p class="panel-title">Попытки студентов</p>
          <select class="select" id="attemptTaskFilter">
            <option value="all">Все задачи</option>
            ${tasks.map((t) => `<option value="${AppUI.esc(t.id)}" ${attemptTaskFilter === t.id ? 'selected' : ''}>${AppUI.esc(t.title.slice(0, 44))}</option>`).join('')}
          </select>
        </div>
        ${list.length ? `
        <div style="overflow:auto">
          <table class="data-table">
            <thead><tr><th>Дата</th><th>Задача</th><th style="text-align:right">Балл</th><th>Критерии</th><th>Агенты</th><th>Статус</th><th></th></tr></thead>
            <tbody>
              ${list.map((a) => {
                const stats = a.review ? a.review.stats : null;
                return `
                <tr>
                  <td class="dim" style="font-size:12px;white-space:nowrap">${AppUI.dateTime(a.submittedAt)}</td>
                  <td style="color:var(--text)">${AppUI.esc(taskTitle(a.taskId))}</td>
                  <td style="text-align:right">${a.review ? gradeBadge(a.review.grade.score) : '<span class="badge badge-info">…</span>'}</td>
                  <td class="dim" style="font-size:12px">${stats ? `${stats.criteriaHit}/${stats.criteriaTotal}` : '—'}</td>
                  <td class="dim" style="font-size:12px">${a.review ? a.review.agents.map((g) => `${g.initials} ${g.score}`).join(' · ') : '—'}</td>
                  <td>${a.status === 'reviewed' ? '<span class="badge badge-ok">ревью готово</span>' : '<span class="badge badge-info">в процессе</span>'}</td>
                  <td><div class="cell-actions">${a.review ? `<button class="btn btn-ghost btn-sm" type="button" data-attempt="${AppUI.esc(a.taskId)}:${AppUI.esc(a.id)}">Разбор</button>` : ''}</div></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
        <div class="solution-foot"><span class="dim">Решение рядом с ревью — видно, где тюнить: рубрику или промпт.</span></div>
        ` : `
        <div class="empty-state" style="margin:12px">
          <h3>Попыток пока нет</h3>
          <p class="muted" style="margin-bottom:12px">Отправьте решение из любой задачи — оно появится здесь вместе с ревью.</p>
          <a class="btn btn-ghost btn-sm" href="catalog.html">К задачам</a>
        </div>`}
      </div>`;

    host.querySelector('#attemptTaskFilter').addEventListener('change', (e) => {
      attemptTaskFilter = e.target.value;
      renderAttempts(host);
    });
    host.querySelectorAll('[data-attempt]').forEach((button) => {
      button.addEventListener('click', () => {
        const [taskId, attemptId] = button.dataset.attempt.split(':');
        openAttemptModal(taskId, attemptId);
      });
    });
  }

  function openAttemptModal(taskId, attemptId) {
    const attempt = (Store.attempts(taskId) || []).find((a) => a.id === attemptId);
    if (!attempt || !attempt.review) return;
    const review = attempt.review;
    const tabs = attempt.tabs || [];
    const doc = tabs.find((t) => t.type === 'doc');
    const diagrams = tabs.filter((t) => t.type !== 'doc');
    AppUI.modal({
      title: taskTitle(taskId),
      wide: true,
      html: `
        <div class="row mb-16" style="gap:8px;flex-wrap:wrap">
          ${gradeBadge(review.grade.score)}
          <span class="badge">${AppUI.esc(review.grade.label)}</span>
          <span class="badge">${AppUI.esc(AppUI.dateTime(attempt.submittedAt))}</span>
          <span class="badge badge-violet">${AppUI.esc(review.engine)}</span>
        </div>
        <div class="grid-2" style="gap:14px;align-items:start">
          <div>
            <div class="mono dim" style="font-size:10.5px;letter-spacing:.1em;margin-bottom:8px">РЕШЕНИЕ СТУДЕНТА</div>
            <div class="info-box" style="margin:0;max-height:380px;overflow:auto">
              ${doc ? doc.content : '<p class="muted">Без текстового документа.</p>'}
            </div>
            ${diagrams.length ? `<div class="mono dim mt-16" style="font-size:10.5px">ДИАГРАММ: ${diagrams.length}</div>` + diagrams.map((d) => `<pre style="max-height:160px;overflow:auto;font-size:11px">${AppUI.esc(String(d.content || '').slice(0, 800))}</pre>`).join('') : ''}
          </div>
          <div>
            <div class="mono dim" style="font-size:10.5px;letter-spacing:.1em;margin-bottom:8px">РЕВЬЮ АГЕНТОВ</div>
            ${review.agents.map((agent) => `
              <div class="card" style="padding:12px;margin-bottom:8px">
                <div class="row-between"><strong style="font-size:13px">${AppUI.esc(agent.name)}</strong><span class="badge">${agent.score}/10</span></div>
                <div class="mono dim" style="font-size:10.5px;margin:4px 0 8px">учтено: ${(agent.covered || []).length} · не учтено: ${(agent.missed || []).length}</div>
                ${(agent.missed || []).slice(0, 3).map((m) => `<div style="font-size:12.5px;color:var(--text-2);margin-bottom:4px">− ${AppUI.esc(m.title)}</div>`).join('')}
              </div>`).join('')}
            <div class="mono dim" style="font-size:10.5px;letter-spacing:.1em;margin:12px 0 8px">КРИТЕРИИ: УЧТЕНО / НЕТ</div>
            ${(review.criteria || []).map((c) => `
              <div class="crit-row" style="font-size:12.5px">
                <span class="state ${c.state === 'hit' ? 'hit' : c.state === 'partial' ? 'miss' : 'crit'}">${c.state === 'hit' ? 'учтено' : c.state === 'partial' ? 'частично' : 'не учтено'}</span>
                <span class="grow">${AppUI.esc(c.title)}</span>
              </div>`).join('')}
          </div>
        </div>
        <div class="row mt-16" style="gap:8px;flex-wrap:wrap">
          <a class="btn btn-ghost btn-sm" href="admin.html?task=${AppUI.esc(taskId)}">Рубрика задачи →</a>
          <a class="btn btn-ghost btn-sm" href="task.html?id=${AppUI.esc(taskId)}">Задача глазами студента ↗</a>
        </div>`
    });
  }

  const PROMPT_BY_AGENT = { sa: 'sa-reviewer', arch: 'arch-reviewer' };

  function renderAgents(host) {
    const agents = Store.agents();

    host.innerHTML = `
      <div class="panel mb-16">
        <div class="panel-head"><p class="panel-title">Агенты ревью</p><span class="badge">${agents.filter((a) => a.enabled).length} из ${agents.length} в пайплайне</span></div>
        <div class="panel-body" style="display:grid;gap:14px">
          ${agents.map((agent) => {
            const promptKey = PROMPT_BY_AGENT[agent.id];
            const prompt = Store.prompts().find((p) => p.key === promptKey);
            const activeV = prompt ? prompt.versions.find((v) => v.status === 'active') : null;
            return `
            <div class="card" style="padding:18px;${agent.enabled ? '' : 'opacity:.65'}">
              <div class="row-between mb-16" style="flex-wrap:wrap;gap:10px">
                <div class="row" style="gap:12px">
                  <span class="ra-avatar ${AppUI.esc(agent.id)}" style="width:38px;height:38px;font-size:12px">${AppUI.esc(agent.initials)}</span>
                  <div>
                    <div style="font-weight:650;font-size:15px">${AppUI.esc(agent.name)}</div>
                    <div class="mono dim" style="font-size:11px">${AppUI.esc(agent.role)}</div>
                  </div>
                </div>
                <div class="row" style="gap:8px">
                  ${agent.enabled ? '<span class="badge badge-ok">в пайплайне</span>' : '<span class="badge">выключен</span>'}
                  <button class="switch" type="button" role="switch" aria-checked="${agent.enabled}" data-agent-toggle="${AppUI.esc(agent.id)}" title="Участие в ревью"></button>
                </div>
              </div>
              <div class="grid-2" style="gap:14px;align-items:start">
                <div>
                  <div class="mono dim" style="font-size:10.5px;letter-spacing:.1em;margin-bottom:8px">ФОКУС ПРОВЕРКИ</div>
                  <ul class="ra-list">
                    ${(agent.checks || []).map((c) => `<li><span class="ico">✓</span><span>${AppUI.esc(c)}</span></li>`).join('')}
                  </ul>
                  <button class="btn btn-ghost btn-sm mt-16" type="button" data-agent-edit="${AppUI.esc(agent.id)}">Настроить фокус</button>
                </div>
                <div>
                  <div class="mono dim" style="font-size:10.5px;letter-spacing:.1em;margin-bottom:8px">МОДЕЛЬ И ПРОМПТ</div>
                  <div class="info-box" style="margin:0">
                    <div class="ib-title">Модель</div>
                    <p class="mono" style="margin:0;font-size:12.5px">mock-agents/v1 (детерминированный)</p>
                  </div>
                  <div class="info-box" style="margin:12px 0 0">
                    <div class="ib-title">Связанный промпт</div>
                    <p style="margin:0;font-size:13px">${prompt ? `${AppUI.esc(prompt.name)} · <span class="mono">${AppUI.esc(prompt.key)} v${activeV ? activeV.v : '?'}</span> <a class="link-btn" href="#" data-goto-versions>versions →</a>` : 'не привязан'}</p>
                  </div>
                  <p class="mono dim mt-16" style="font-size:11px">Выключение убирает агента из пайплайна ревью (в продукте; в макете — флаг состояния).</p>
                </div>
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>`;

    host.querySelectorAll('[data-agent-toggle]').forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.dataset.agentToggle;
        const current = Store.agents().find((a) => a.id === id);
        Store.saveAgent(id, { enabled: !current.enabled });
        AppUI.toast(`Агент ${!current.enabled ? 'включён' : 'выключен'}`, !current.enabled ? 'ok' : 'warn');
        api.refresh();
      });
    });
    host.querySelectorAll('[data-agent-edit]').forEach((button) => {
      button.addEventListener('click', () => {
        const agent = Store.agents().find((a) => a.id === button.dataset.agentEdit);
        const dialog = AppUI.modal({
          title: `Фокус: ${agent.name}`,
          wide: true,
          html: `
            <p class="muted" style="font-size:13.5px">По одной проверке на строку. Именно этот список агент проходит по каждому решению — и именно его видит студент в карточке ревью.</p>
            <div class="field"><label>Проверки (по одной на строку)</label>
              <textarea id="agentChecks" rows="7">${AppUI.esc((agent.checks || []).join('\n'))}</textarea>
            </div>
            <div class="modal-actions"><button class="btn btn-primary" type="button" id="saveAgentBtn">Сохранить</button></div>`
        });
        dialog.body.querySelector('#saveAgentBtn').addEventListener('click', () => {
          const checks = dialog.body.querySelector('#agentChecks').value.split('\n').map((s) => s.trim()).filter(Boolean);
          if (!checks.length) {
            AppUI.toast('Нужна хотя бы одна проверка', 'warn');
            return;
          }
          Store.saveAgent(agent.id, { checks });
          dialog.close();
          AppUI.toast('Фокус агента обновлён', 'ok');
          api.refresh();
        });
      });
    });
    host.querySelectorAll('[data-goto-versions]').forEach((link) => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        api.gotoSection('versions');
      });
    });
  }

  window.AdminOps = { render };
  return { render };
})();
