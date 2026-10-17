/* ============================================================
   account.js — личный кабинет (черновик макета).
   Всё тянет с сервера, когда вошли (Api.user); гостю — приглашение войти.
   Эндпоинты профиля/пароля/ленты попыток/Google-статуса — бэк-доработки
   после утверждения макета (см. конец файла). Локальный Store — только
   запасной показ, сервер всегда первичнее.
   ============================================================ */

(function () {
  const FEED_LIMIT = 10;
  const complaintStatus = { new: 'Получена', review: 'В работе', resolved: 'Решена', rejected: 'Отклонена' };
  const complaintOutcome = { corrected: 'Результат исправлен', recheck_pending: 'Назначена повторная проверка', rechecked: 'Результат пересмотрен', recheck_failed: 'Ошибка повторной проверки, разбор продолжается', recheck_conflict: 'Требуется сверка с другим исправлением', rejected: 'Оценка оставлена без изменения' };
  const complaintAction = { review: 'Взята в работу', correct: 'Исправлены критерии', reject: 'Отклонена', recheck: 'Назначена повторная проверка', ...complaintOutcome };

  document.addEventListener('DOMContentLoaded', async () => {
    AppUI.mountHeader('account');
    AppUI.mountFooter();

    const guestBox = document.getElementById('guestBox');
    const accountBox = document.getElementById('accountBox');

    if (window.Api) {
      try { await Api.ready; } catch (e) { /* остаёмся на встроенных данных */ }
    }
    const user = window.Api ? Api.user : null;
    if (!user) {
      guestBox.innerHTML = `
        <div class="empty-state">
          <h3>Кабинет доступен после входа</h3>
          <p class="muted" style="margin-bottom:16px">Войдите, чтобы увидеть профиль, предзапись и историю.</p>
          <div class="row" style="gap:8px;justify-content:center;flex-wrap:wrap">
            <a class="btn btn-primary" href="login.html">Войти</a>
            <a class="btn btn-ghost" href="login.html?mode=register">Регистрация</a>
          </div>
        </div>
        <!-- Гостю тоже даём сменить стиль: раньше кнопка жила в шапке на всех страницах. -->
        <div class="panel filter-group">
          <h4>Оформление</h4>
          <div data-theme-host><p class="muted">Загрузка…</p></div>
        </div>`;
      renderTheme(guestBox.querySelector('[data-theme-host]'));
      return;
    }
    accountBox.classList.remove('hidden');

    renderProfile(user);
    renderTheme(document.getElementById('themeBody'));
    renderPassword();
    renderGoogle();
    await Promise.all([
      loadPro(),
      loadAttempts(),
      loadAssessment(),
      loadComplaints(),
      loadOrders(),
      loadNotifications()
    ]);
  });

  /* ==================== профиль ==================== */

  function renderProfile(user) {
    const host = document.getElementById('profileBody');
    const pro = user.role && user.role !== 'STUDENT'
      ? `<span class="badge badge-accent">${AppUI.esc(user.role)}</span>`
      : '<span class="badge">студент</span>';
    const initials = String(user.name || user.email || '?').trim().split(/\s+/)
      .map((w) => w[0]).join('').slice(0, 2).toUpperCase();
    host.innerHTML = `
      <div class="row" style="gap:12px;align-items:center;margin-bottom:12px">
        <span class="agent-avatar" style="flex:0 0 44px;width:44px;height:44px;font-size:16px">${AppUI.esc(initials)}</span>
        <div>
          <div id="accountName" style="font-weight:600;font-size:16px">${AppUI.esc(user.name || '')}</div>
          <div class="muted" style="font-size:12px">${AppUI.esc(user.email || '')}</div>
        </div>
      </div>
      <div class="row" style="gap:8px;flex-wrap:wrap;margin-bottom:12px">${pro}</div>
      <div id="nameEditBox" class="hidden">
        <div class="field"><label for="profileName">Новое имя</label>
          <input id="profileName" maxlength="100" value="${AppUI.esc(user.name || '')}">
        </div>
        <div class="row mt-16" style="gap:8px">
          <button class="btn btn-primary btn-sm" type="button" id="saveProfileBtn">Сохранить</button>
          <button class="btn btn-ghost btn-sm" type="button" id="cancelNameBtn">Отмена</button>
        </div>
      </div>
      <div class="row" id="profileActions" style="gap:8px;flex-wrap:wrap">
        <button class="btn btn-outline btn-sm" type="button" id="profileEditBtn">Изменить имя</button>
        <button class="btn btn-ghost btn-sm" type="button" id="securityBtn">Безопасность</button>
        <button class="btn btn-ghost btn-sm" type="button" id="logoutBtn">Выйти</button>
      </div>`;

    document.getElementById('profileEditBtn').addEventListener('click', () => {
      document.getElementById('nameEditBox').classList.remove('hidden');
      document.getElementById('profileActions').classList.add('hidden');
      document.getElementById('profileName').focus();
    });

    document.getElementById('cancelNameBtn').addEventListener('click', () => {
      document.getElementById('nameEditBox').classList.add('hidden');
      document.getElementById('profileActions').classList.remove('hidden');
    });

    document.getElementById('saveProfileBtn').addEventListener('click', async () => {
      const name = document.getElementById('profileName').value.trim();
      if (name.length < 2) {
        AppUI.toast('Имя слишком короткое', 'warn');
        return;
      }
      try {
        Api.user = await Api.updateProfile(name);
        AppUI.toast('Имя обновлено', 'ok');
        renderProfile(Api.user);
      } catch (error) {
        AppUI.toast('Не удалось сохранить: ' + (error && error.message ? error.message : error), 'bad');
      }
    });

    document.getElementById('logoutBtn').addEventListener('click', async () => {
      try { await Api.logout(); }
      catch (error) { AppUI.toast('Не удалось завершить сессию. Повторите выход.', 'bad'); return; }
      window.location.href = 'index.html';
    });

    /* Переключение видов правой колонки: профиль <-> безопасность.
       Скроллим ровно к показанному блоку, а не наверх: иначе на узком
       экране (сайдбар сверху) панель оказывается за кадром и кажется,
       что «колонка пропала». */
    function showSecurity() {
      document.getElementById('mainPanels').classList.add('hidden');
      const panel = document.getElementById('securityPanel');
      panel.classList.remove('hidden');
      requestAnimationFrame(() => {
        panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }

    function showMain() {
      document.getElementById('securityPanel').classList.add('hidden');
      const main = document.getElementById('mainPanels');
      main.classList.remove('hidden');
      requestAnimationFrame(() => {
        main.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }

    document.getElementById('securityBtn').addEventListener('click', showSecurity);
    document.getElementById('backToProfileBtn').addEventListener('click', showMain);
  }

  /* ==================== оформление (переехало из шапки) ==================== */

  /**
   * Кнопка «Сменить оформление»: открывает меню тем (Тёмная / Серая IDE /
   * Светлая) через AppUI.themeMenu. Отрисовка в два места — панель для
   * вошедшего (#themeBody) и гостевой блок ([data-theme-host]).
   */
  function renderTheme(host) {
    if (!host) return;
    host.innerHTML = `
      <p class="muted" style="font-size:13px;margin-bottom:10px">Тёмная, «Серая IDE» или светлая — сработает на всём сайте и запомнится.</p>
      <button class="btn btn-outline btn-sm" type="button" data-theme-toggle title="Сменить оформление">
        <span aria-hidden="true">◐</span>&nbsp;<span data-theme-label>Серая · IDE</span>
      </button>`;
    host.querySelector('[data-theme-toggle]').addEventListener('click', (event) => {
      event.stopPropagation();
      AppUI.themeMenu(host.querySelector('[data-theme-toggle]'));
    });
    // Кнопка появилась после mountHeader (тот уже прогнал initTheme) —
    // перечитываем тему, чтобы подпись совпадала с сохранённой.
    AppUI.initTheme();
  }

  /* ==================== предзапись (вместо подписки) ==================== */

  async function loadPro() {
    const host = document.getElementById('proBody');
    if (window.Waitlist) {
      Waitlist.renderInline(host, 'account');
      return;
    }
    host.innerHTML = '<p class="muted">Не удалось загрузить форму предзаписи.</p>';
  }

  /* ==================== безопасность ==================== */

  /* ==================== безопасность (редкий блок в конце колонки) ==================== */

  function renderPassword() {
    document.getElementById('pwBody').innerHTML = `
      <div class="field"><label for="pwCurrent">Текущий пароль</label>
        <input id="pwCurrent" type="password" autocomplete="current-password">
      </div>
      <div class="field"><label for="pwNew">Новый пароль (минимум 8 символов)</label>
        <input id="pwNew" type="password" autocomplete="new-password">
      </div>
      <div class="field"><label for="pwNew2">Новый пароль ещё раз</label>
        <input id="pwNew2" type="password" autocomplete="new-password">
      </div>
      <button class="btn btn-outline btn-sm mt-16" type="button" id="pwBtn">Сменить пароль</button>
      <p class="muted mt-16" style="font-size:12px">После смены все сессии завершатся. Потребуется войти с новым паролем.</p>`;

    document.getElementById('pwBtn').addEventListener('click', async () => {
      const current = document.getElementById('pwCurrent').value;
      const next = document.getElementById('pwNew').value;
      const next2 = document.getElementById('pwNew2').value;
      if (!current || !Api.validPassword(next)) {
        AppUI.toast('Пароль — минимум 8 символов и максимум 72 байта UTF-8', 'warn');
        return;
      }
      if (next !== next2) {
        AppUI.toast('Пароли не совпадают', 'warn');
        return;
      }
      try {
        await Api.changePassword(current, next);
        AppUI.toast('Пароль сменён. Войдите с новым паролем.', 'ok');
        document.getElementById('pwCurrent').value = '';
        document.getElementById('pwNew').value = '';
        document.getElementById('pwNew2').value = '';
        window.location.href = 'login.html?next=account.html';
      } catch (error) {
        const code = error && error.status;
        AppUI.toast(code === 401 ? 'Текущий пароль неверный' : 'Не удалось сменить пароль', 'bad');
      }
    });
  }

  async function renderGoogle() {
    const host = document.getElementById('googleBody');
    let status = null;
    try { status = await Api.oauthStatus(); } catch (e) { status = null; }
    if (status && status.googleEnabled) {
      host.innerHTML = `
        <button class="btn btn-outline btn-sm" type="button" id="googleBtn">Привязать Google-вход</button>
        <p class="muted mt-16" style="font-size:12px">Привязка идёт по подтверждённой почте Google к этому же аккаунту.</p>`;
      document.getElementById('googleBtn').addEventListener('click', () => {
        window.location.href = '/api/auth/oauth2/google';
      });
    } else {
      host.innerHTML = `
        <p class="muted" style="font-size:12px">Вход через Google появится после подключения ключей — кнопка уже заложена здесь.</p>`;
    }
  }

  /* ==================== история ==================== */

  async function loadAttempts() {
    const host = document.getElementById('attemptsBody');
    const count = document.getElementById('attemptsCount');
    let feed = null;
    try { feed = await Api.myAttempts(FEED_LIMIT); } catch (e) { feed = null; }
    if (!feed || !feed.length) {
      host.innerHTML = '<p class="muted">Пока нет попыток — <a href="catalog.html" style="color:var(--accent)">выберите задачу</a>.</p>';
      if (count) count.textContent = '0';
      return;
    }
    if (count) count.textContent = `${feed.length}`;
    host.innerHTML = feed.map((item) => `
      <div class="plan-item" style="margin-bottom:6px">
        <span class="n">${AppUI.esc(AppUI.dateTime(item.submittedAt))}</span>
        <div>
          <div class="t"><a href="task.html?id=${AppUI.esc(item.taskId)}">${AppUI.esc(item.taskTitle || item.taskId)}</a></div>
          <div class="s">${AppUI.esc(item.gradeLabel || item.status)}</div>
        </div>
        <span class="row" style="gap:8px">
          ${item.score !== null && item.score !== undefined ? `<span class="badge">${item.score}/100</span>` : ''}
        </span>
      </div>`).join('');
  }

  async function loadAssessment() {
    const host = document.getElementById('assessmentBody');
    let history = null;
    try { history = await Api.assessmentHistory(); } catch (e) { history = null; }
    if (history === null && Api.mode === 'server') { host.innerHTML = '<p>История диагностики не загружена. Обновите страницу для повтора.</p>'; return; }
    const local = window.Store ? Store.assessment() : null;
    if ((!history || !history.length) && !(local && local.result)) {
      host.innerHTML = '<p class="muted">Замеров пока нет — <a href="assessment.html" style="color:var(--accent)">пройдите диагностику</a>.</p>';
      return;
    }
    const rows = (history && history.length ? history : []).slice(0, 5).map((item) => `
      <div class="plan-item" style="margin-bottom:6px">
        <span class="n">${AppUI.esc(AppUI.dateTime(item.createdAt))}</span>
        <div>
          <div class="t"><a href="results.html?submission=${AppUI.esc(item.submissionId)}">Профиль знаний</a></div>
          <div class="s">верно ${item.correctCount} из ${item.answeredCount}</div>
        </div>
        <span class="badge">${item.scoreRounded}/100</span>
      </div>`).join('');
    const localNote = local && local.result && !local.server
      ? `<p class="muted" style="font-size:12px">Локальный замер в этом браузере: ${local.result.scoreRounded}/100 — серверная история выше.</p>`
      : '';
    host.innerHTML = `${rows}${localNote}<a class="btn btn-ghost btn-sm mt-16" href="results.html">Последний результат</a>`;
  }

  async function loadComplaints() {
    const host = document.getElementById('complaintsBody');
    let list = null;
    try { list = await Api.myComplaints(); } catch (e) { list = null; }
    if (list === null) { host.innerHTML = '<p>Жалобы не загружены. Обновите страницу для повтора.</p>'; return; }
    if (!list || !list.length) {
      host.innerHTML = '<p class="muted">Жалоб нет. Оспорить ревью можно кнопкой «Оспорить» в карточке ревью.</p>';
      return;
    }
    host.innerHTML = list.slice(0, 5).map((item) => `
      <div class="plan-item" style="margin-bottom:6px">
        <span class="n">${AppUI.esc(AppUI.dateTime(item.createdAt))}</span>
        <div>
          <div class="t">${AppUI.esc(item.taskTitle || item.taskId)}</div>
          <div class="s">${AppUI.esc(complaintStatus[item.status] || item.status)} · ревью v${item.reviewRevision}${item.outcome ? ' · ' + AppUI.esc(complaintOutcome[item.outcome] || item.outcome) : ''}${item.resolution ? ' · ' + AppUI.esc(item.resolution) : ''}</div>
          <a href="task.html?id=${AppUI.esc(item.taskId)}&amp;attempt=${AppUI.esc(item.attemptId)}">Открыть актуальное ревью и историю</a>
          <details><summary>История разбора</summary>${(item.decisions || []).map(d => `<p>${AppUI.esc(complaintAction[d.action] || d.action)} · ${AppUI.esc(d.actorName || 'Система')}: ${AppUI.esc(d.resolution || '')}</p>`).join('')}</details>
        </div>
        <span class="badge">${item.score}/100</span>
      </div>`).join('');
  }

  async function loadOrders() {
    const host = document.getElementById('ordersBody');
    let orders = null;
    try { orders = await Api.myOrders(); } catch (e) { orders = null; }
    if (!orders) {
      host.innerHTML = '<p class="muted">Не удалось загрузить заказы.</p>';
      return;
    }
    if (!orders.length) {
      host.innerHTML = '<p class="muted">Заказов пока нет.</p>';
      return;
    }
    host.innerHTML = orders.slice(0, 10).map((order) => `
      <div class="plan-item" style="margin-bottom:6px">
        <span class="n">${AppUI.esc(AppUI.dateTime(order.createdAt))}</span>
        <div>
          <div class="t">${AppUI.esc(order.plan)}</div>
          <div class="s">${AppUI.esc(order.status)}</div>
        </div>
        <span class="badge">${order.amount} ₽</span>
      </div>`).join('');
  }

  async function loadNotifications() {
    const host = document.getElementById('notificationsBody');
    try {
      const list = await Api.notifications();
      host.innerHTML = list.length ? list.map(n => `<article><h4>${AppUI.esc(n.subject)}</h4><p>${AppUI.esc(n.body)}</p><a href="${AppUI.esc(n.link)}">Открыть результат</a></article>`).join('') : '<p>Уведомлений пока нет.</p>';
    } catch (error) { host.textContent = 'Не удалось загрузить уведомления. Повторите загрузку страницы.'; }
  }
})();

/* Бэк под макет: готово — PUT /api/auth/profile, POST /api/auth/password/change,
   GET /api/attempts/mine, GET /api/auth/oauth2/status (googleEnabled из конфига).
   Остался сам Google-флоу (после ключей):
   GET /api/auth/oauth2/google → редирект в Google (OAuth2 code flow)
   GET /api/auth/oauth2/callback → привязка по verified email + JWT-куки
   Конфиги: app.google.enabled, app.google.client-id/secret (только env). */
