/* ============================================================
   account.js — личный кабинет (черновик макета).
   Всё тянет с сервера, когда вошли (Api.user); гостю — приглашение войти.
   Эндпоинты профиля/пароля/ленты попыток/Google-статуса — бэк-доработки
   после утверждения макета (см. конец файла). Локальный Store — только
   запасной показ, сервер всегда первичнее.
   ============================================================ */

(function () {
  const FEED_LIMIT = 10;

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
          <p class="muted" style="margin-bottom:16px">Войдите, чтобы увидеть профиль, подписку и историю.</p>
          <div class="row" style="gap:8px;justify-content:center;flex-wrap:wrap">
            <a class="btn btn-primary" href="login.html">Войти</a>
            <a class="btn btn-ghost" href="login.html?mode=register">Регистрация</a>
          </div>
        </div>`;
      return;
    }
    accountBox.classList.remove('hidden');

    renderProfile(user);
    renderSecurity(user);
    await Promise.all([
      loadPro(),
      loadAttempts(),
      loadAssessment(),
      loadComplaints(),
      loadOrders()
    ]);
  });

  /* ==================== профиль ==================== */

  function renderProfile(user) {
    const host = document.getElementById('profileBody');
    const pro = user.role && user.role !== 'STUDENT'
      ? `<span class="badge badge-accent">${AppUI.esc(user.role)}</span>`
      : '<span class="badge">студент</span>';
    host.innerHTML = `
      <div class="row" style="gap:8px;flex-wrap:wrap;margin-bottom:12px">${pro}</div>
      <div class="field"><label for="profileName">Имя</label>
        <input id="profileName" maxlength="100" value="${AppUI.esc(user.name || '')}">
      </div>
      <div class="field"><label>Email</label>
        <input value="${AppUI.esc(user.email || '')}" disabled>
      </div>
      <div class="row mt-16" style="gap:8px;flex-wrap:wrap">
        <button class="btn btn-primary btn-sm" type="button" id="saveProfileBtn">Сохранить</button>
        <button class="btn btn-ghost btn-sm" type="button" id="logoutBtn">Выйти</button>
      </div>
      <div id="googleBox" class="mt-16"></div>`;

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
      try { await Api.logout(); } catch (e) { /* всё равно уходим */ }
      window.location.href = 'index.html';
    });

    paintGoogleBox();
  }

  /* Вход через Google: кнопка ведёт на серверный OAuth-флоу; без ключей
     сервер отвечает 409, фронт честно показывает заглушку. */
  async function paintGoogleBox() {
    const host = document.getElementById('googleBox');
    if (!host) return;
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

  /* ==================== подписка ==================== */

  async function loadPro() {
    const host = document.getElementById('proBody');
    let status = null;
    let plans = [];
    try { status = await Api.billingStatus(); } catch (e) { status = null; }
    try { plans = await Api.plans(); } catch (e) { plans = []; }
    if (!status) {
      host.innerHTML = '<p class="muted">Не удалось загрузить подписку.</p>';
      return;
    }

    const badge = status.pro
      ? `<span class="badge badge-accent">Pro${status.endsAt ? ' · до ' + AppUI.esc(AppUI.dateTime(status.endsAt)) : ''}</span>`
      : '<span class="badge">Free</span>';
    const planRows = (plans || []).map((plan) => `
      <div class="plan-item" style="margin-bottom:6px">
        <span class="n">${AppUI.esc(plan.title || plan.id)}</span>
        <div><div class="t">${plan.price} ₽</div></div>
        <span class="row" style="gap:8px">
          ${status.pro ? '' : `<button class="btn btn-primary btn-sm" type="button" data-buy-plan="${AppUI.esc(plan.id)}">Оформить</button>`}
        </span>
      </div>`).join('');

    host.innerHTML = `
      <div class="row" style="gap:8px;margin-bottom:12px">${badge}</div>
      ${status.pro
        ? `<p class="muted" style="font-size:13px">Безлимитные ревью и эталоны включены.</p>
           ${status.subscriptionId ? '<button class="btn btn-ghost btn-sm mt-16" type="button" id="cancelSubBtn">Отменить автопродление</button>' : ''}`
        : planRows}
      <div class="field mt-16"><label for="promoInput">Промокод</label>
        <div class="row" style="gap:8px">
          <input id="promoInput" placeholder="PILOT-30" style="text-transform:uppercase">
          <button class="btn btn-outline btn-sm" type="button" id="promoBtn">Применить</button>
        </div>
      </div>`;

    host.querySelectorAll('[data-buy-plan]').forEach((button) => {
      button.addEventListener('click', async () => {
        try {
          const order = await Api.createOrder(button.dataset.buyPlan);
          AppUI.confirm({
            title: 'Заказ создан',
            text: `К оплате ${order.amount} ₽. В макете касса не подключена — ссылка для оплаты:`,
            checklist: [order.confirmationUrl || '—'],
            confirmText: 'Понятно',
            cancelText: 'Закрыть'
          });
        } catch (error) {
          AppUI.toast('Не удалось создать заказ: ' + (error && error.message ? error.message : error), 'bad');
        }
      });
    });

    const promoBtn = document.getElementById('promoBtn');
    if (promoBtn) {
      promoBtn.addEventListener('click', async () => {
        const code = document.getElementById('promoInput').value.trim();
        if (!code) return;
        try {
          await Api.redeemPromo(code);
          AppUI.toast('Промокод применён', 'ok');
          loadPro();
        } catch (error) {
          AppUI.toast('Промокод не подошёл: ' + (error && error.message ? error.message : error), 'bad');
        }
      });
    }

    const cancelBtn = document.getElementById('cancelSubBtn');
    if (cancelBtn && status.subscriptionId) {
      cancelBtn.addEventListener('click', () => {
        AppUI.confirm({
          title: 'Отменить автопродление?',
          text: 'Доступ Pro сохранится до конца оплаченного периода.',
          confirmText: 'Отменить продление',
          cancelText: 'Оставить'
        }).then(async (ok) => {
          if (!ok) return;
          try {
            await Api.cancelSubscription(status.subscriptionId);
            AppUI.toast('Автопродление отменено', 'ok');
            loadPro();
          } catch (error) {
            AppUI.toast('Не удалось отменить: ' + (error && error.message ? error.message : error), 'bad');
          }
        });
      });
    }
  }

  /* ==================== безопасность ==================== */

  function renderSecurity() {
    document.getElementById('securityBody').innerHTML = `
      <div class="field"><label for="pwCurrent">Текущий пароль</label>
        <input id="pwCurrent" type="password" autocomplete="current-password">
      </div>
      <div class="field"><label for="pwNew">Новый пароль</label>
        <input id="pwNew" type="password" autocomplete="new-password">
      </div>
      <div class="field"><label for="pwNew2">Новый пароль ещё раз</label>
        <input id="pwNew2" type="password" autocomplete="new-password">
      </div>
      <button class="btn btn-outline btn-sm mt-16" type="button" id="pwBtn">Сменить пароль</button>`;

    document.getElementById('pwBtn').addEventListener('click', async () => {
      const current = document.getElementById('pwCurrent').value;
      const next = document.getElementById('pwNew').value;
      const next2 = document.getElementById('pwNew2').value;
      if (!current || next.length < 8) {
        AppUI.toast('Новый пароль — минимум 8 символов', 'warn');
        return;
      }
      if (next !== next2) {
        AppUI.toast('Пароли не совпадают', 'warn');
        return;
      }
      try {
        await Api.changePassword(current, next);
        AppUI.toast('Пароль сменён, другие сессии завершены', 'ok');
        document.getElementById('pwCurrent').value = '';
        document.getElementById('pwNew').value = '';
        document.getElementById('pwNew2').value = '';
      } catch (error) {
        const code = error && error.status;
        AppUI.toast(code === 401 ? 'Текущий пароль неверный' : 'Не удалось сменить пароль', 'bad');
      }
    });
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
    const local = window.Store ? Store.assessment() : null;
    if ((!history || !history.length) && !(local && local.result)) {
      host.innerHTML = '<p class="muted">Замеров пока нет — <a href="assessment.html" style="color:var(--accent)">пройдите диагностику</a>.</p>';
      return;
    }
    const rows = (history && history.length ? history : []).slice(0, 5).map((item) => `
      <div class="plan-item" style="margin-bottom:6px">
        <span class="n">${AppUI.esc(AppUI.dateTime(item.createdAt))}</span>
        <div>
          <div class="t">${AppUI.esc(item.gradeName || item.gradeId || '')}</div>
          <div class="s">верно ${item.correctCount} из ${item.answeredCount}</div>
        </div>
        <span class="badge">${item.scoreRounded}/100</span>
      </div>`).join('');
    const localNote = local && local.result
      ? `<p class="muted" style="font-size:12px">Локальный замер в этом браузере: ${local.result.scoreRounded}/100 — серверная история выше.</p>`
      : '';
    host.innerHTML = `${rows}${localNote}<a class="btn btn-ghost btn-sm mt-16" href="results.html">Последний результат</a>`;
  }

  async function loadComplaints() {
    const host = document.getElementById('complaintsBody');
    let list = null;
    try { list = await Api.myComplaints(); } catch (e) { list = null; }
    if (!list || !list.length) {
      host.innerHTML = '<p class="muted">Жалоб нет. Оспорить ревью можно кнопкой «Оспорить» в карточке ревью.</p>';
      return;
    }
    host.innerHTML = list.slice(0, 5).map((item) => `
      <div class="plan-item" style="margin-bottom:6px">
        <span class="n">${AppUI.esc(AppUI.dateTime(item.createdAt))}</span>
        <div>
          <div class="t">${AppUI.esc(item.taskTitle || item.taskId)}</div>
          <div class="s">${AppUI.esc(item.status)}${item.resolution ? ' · ' + AppUI.esc(item.resolution.slice(0, 80)) : ''}</div>
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
})();

/* Бэк-доработки под макет (после утверждения):
   PUT /api/auth/profile {name} → MeResponse
   POST /api/auth/password/change {currentPassword,newPassword} → 200 (401 при чужом текущем)
   GET /api/attempts/mine?limit= → [{attemptId,taskId,taskTitle,score,gradeLabel,status,submittedAt}]
   GET /api/auth/oauth2/status → {googleEnabled: bool}
   GET /api/auth/oauth2/google → редирект в Google (OAuth2 code flow)
   GET /api/auth/oauth2/callback → привязка по verified email + JWT-куки
   Конфиги: auth.google.enabled, auth.google.client-id/secret (только env). */
