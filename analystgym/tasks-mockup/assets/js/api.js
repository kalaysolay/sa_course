/* ============================================================
   api.js — мост фронта к backend API (Фазы 1–3).
   Пытается забрать каталог/словари с того же origin (/api/*);
   если сервера нет (file:// или макет открыт как статика) —
   молча остаётся на встроенных SA_DATA. ready всегда резолвится,
   никогда не реджектится: страница обязана отрисоваться в любом случае.
   Фазы 2–3: черновики/попытки/диагностика/жалобы идут через сервер,
   когда он есть и пользователь вошёл; иначе task.js работает локально.
   ============================================================ */

(function () {
  const JSON_HEADERS = { 'Content-Type': 'application/json' };

  function cookie(name) {
    const parts = (document.cookie || '').split(';');
    for (const part of parts) {
      const [key, ...rest] = part.trim().split('=');
      if (key === name) return decodeURIComponent(rest.join('='));
    }
    return null;
  }

  let refreshPromise = null;
  let accountChanged = false;

  function changeUser(user, announce) {
    const oldId = window.Store ? Store.owner() : (Api.user && Api.user.id);
    const nextId = user ? String(user.id) : null;
    if (oldId !== nextId) {
      window.dispatchEvent(new Event('ag:before-account-change'));
      if (window.Store) Store.setUser(nextId);
    } else if (window.Store && !Api.initialized) {
      Store.setUser(nextId);
    }
    Api.user = user;
    Api.initialized = true;
    if (announce) {
      try { localStorage.setItem('analystgym:auth-owner', nextId || 'guest'); } catch (error) { /* память */ }
    }
    window.dispatchEvent(new Event('ag:auth-changed'));
  }

  function accountError() {
    const error = new Error('Аккаунт изменился. Обновите страницу перед продолжением.');
    error.status = 409;
    error.body = { error: 'account_changed' };
    return error;
  }

  async function getJson(path) {
    return requestJson('GET', path);
  }

  async function postJson(path, body, extraHeaders) {
    return sendJson('POST', path, body, extraHeaders);
  }

  async function putJson(path, body) {
    return sendJson('PUT', path, body, null);
  }

  async function sendJson(method, path, body, extraHeaders) {
    return requestJson(method, path, body, extraHeaders);
  }

  // Повторяем только запрос, отклонённый с 401: транспортные ошибки мутаций не ретраим.
  async function requestJson(method, path, body, extraHeaders, recover = true, expectedUser) {
    if (accountChanged) throw accountError();
    const authPath = path.startsWith('/api/auth/');
    const owner = expectedUser === undefined ? (Api.user && String(Api.user.id)) : expectedUser;
    if (method !== 'GET') await ensureCsrf();
    const headers = Object.assign({}, method === 'GET' ? {} : JSON_HEADERS, extraHeaders || {});
    if (owner && (!authPath || path === '/api/auth/profile' || path === '/api/auth/password/change')) {
      headers['X-Account-ID'] = owner;
    }
    if (method !== 'GET') {
      const token = csrfToken || cookie('XSRF-TOKEN');
      if (token) headers['X-XSRF-TOKEN'] = token;
    }
    const response = await fetch(path, {
      method, credentials: 'same-origin', headers,
      ...(method === 'GET' ? {} : { body: JSON.stringify(body || {}) }),
      signal: AbortSignal.timeout(15000)
    });
    const canRefresh = !authPath || path === '/api/auth/me' || path === '/api/auth/profile'
      || path === '/api/auth/password/change';
    if (response.status === 401 && recover && canRefresh) {
      await refreshSession();
      if (owner && (!Api.user || owner !== String(Api.user.id))) throw accountError();
      return requestJson(method, path, body, extraHeaders, false, owner);
    }
    if (!response.ok) {
      const error = new Error(method + ' ' + path + ' -> ' + response.status);
      error.status = response.status;
      // Тело ошибки (код вида quota_exhausted) — для точных тостов.
      try {
        const errText = await response.text();
        error.body = errText ? JSON.parse(errText) : null;
      } catch (e) {
        error.body = null;
      }
      throw error;
    }
    // refresh/logout могут вернуть пустое тело — читаем как текст с запасом.
    const text = await response.text();
    try {
      return text ? JSON.parse(text) : {};
    } catch (e) {
      return {};
    }
  }

  async function refreshSession() {
    if (refreshPromise) return refreshPromise;
    const refresh = async () => {
      // Другая вкладка могла уже обновить общие куки, пока мы ждали Web Lock.
      let probe = await fetch('/api/auth/me', { credentials: 'same-origin', signal: AbortSignal.timeout(15000) });
      let user;
      if (probe.ok) user = await probe.json();
      else {
        try { user = await requestJson('POST', '/api/auth/refresh', {}, null, false); }
        catch (error) {
          if (error.status !== 401) throw error;
          // Запасной путь для браузеров без Web Locks: сначала проверяем результат соседней вкладки.
          probe = await fetch('/api/auth/me', { credentials: 'same-origin', signal: AbortSignal.timeout(15000) });
          if (!probe.ok) {
            Api.user = null;
            window.dispatchEvent(new Event('ag:session-expired'));
            throw error;
          }
          user = await probe.json();
        }
      }
      const owner = window.Store ? Store.owner() : (Api.user && String(Api.user.id));
      if (owner && owner !== String(user.id)) {
        accountChanged = true;
        window.dispatchEvent(new Event('ag:before-account-change'));
        window.location.reload();
        throw accountError();
      }
      changeUser(user, true);
      return user;
    };
    refreshPromise = (window.navigator && navigator.locks
      ? navigator.locks.request('analystgym:refresh', refresh) : refresh())
      .finally(() => { refreshPromise = null; });
    return refreshPromise;
  }

  async function offerGuestDrafts() {
    if (!Api.user || !window.Store || !Store.guestDraftCount() || Store.all().guestImportOffered) return;
    if (document.readyState === 'loading') await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
    if (!window.AppUI) return;
    Store.dismissGuestImport();
    const accept = await AppUI.confirm({
      title: 'Перенести гостевые черновики?',
      text: 'Найдено черновиков: ' + Store.guestDraftCount() + '. Совпадающие черновики аккаунта сохранятся; гостевые останутся отдельно.',
      confirmText: 'Перенести', cancelText: 'Оставить отдельно'
    });
    if (accept) Store.importGuestDrafts();
  }

  window.addEventListener('storage', event => {
    if (event.key !== 'analystgym:auth-owner' || !Api.initialized) return;
    const current = Api.user ? String(Api.user.id) : 'guest';
    if (event.newValue === current) return;
    accountChanged = true;
    window.dispatchEvent(new Event('ag:before-account-change'));
    window.location.reload();
  });

  /* Прайминг CSRF перед КАЖДЫМ POST: сервер при некоторых условиях чистит куку
     XSRF-TOKEN на промежутке между запросами (session-стратегия + stateless-JWT),
     поэтому вчерашний токен может протухнуть — свежий прайм дешёвый и лечит всё.
     Сервер отдаёт маскированный токен телом /api/auth/csrf (кука XSRF-TOKEN — сырая,
     в заголовок идёт значение из тела: Boot по умолчанию включает
     XorCsrfTokenRequestAttributeHandler, и сырая кука в заголовке даёт 403).
     Ошибки глотаем: на file:// сервера нет, а POST там всё равно некуда слать. */
  let csrfToken = null;
  async function ensureCsrf() {
    try {
      const response = await fetch('/api/auth/csrf', { credentials: 'same-origin' });
      if (response.ok) {
        const data = await response.json();
        if (data && data.token) csrfToken = data.token;
      }
    } catch (error) {
      // Сервера рядом нет — следующий POST всё равно упадёт в fetch, это штатно для макета.
    }
  }

  /* Подмешиваем серверные сводки в SA_DATA: по совпадающим id побеждает
     сервер (заголовок/уровень/метки правит методист), полные тела задач
     остаются из встроенных данных до Фазы 2. Новых id с сервера добавляем. */
  function mergeTasks(serverTasks) {
    if (!Array.isArray(serverTasks) || !window.SA_DATA) return;
    const embedded = window.SA_DATA.tasks || [];
    const byId = new Map(embedded.map((task) => [task.id, task]));
    const extra = [];
    serverTasks.forEach((card) => {
      const local = byId.get(card.id);
      if (local) {
        local.title = card.title;
        local.level = card.level;
        local.tags = card.tags || [];
        local.timeMin = card.timeMin;
        local.solvedRate = card.solvedRate;
      } else {
        extra.push({
          id: card.id,
          title: card.title,
          level: card.level,
          tags: card.tags || [],
          timeMin: card.timeMin,
          solvedRate: card.solvedRate,
          status: 'published'
        });
      }
    });
    window.SA_DATA.tasks = embedded.concat(extra);
  }

  function replaceDictionaries(dict) {
    if (!dict || !window.SA_DATA) return;
    if (Array.isArray(dict.levels) && dict.levels.length) window.SA_DATA.levels = dict.levels;
    if (Array.isArray(dict.tags) && dict.tags.length) window.SA_DATA.tags = dict.tags;
  }

  function replaceCollections(serverCollections) {
    if (!Array.isArray(serverCollections) || !window.SA_DATA) return;
    // Сервер отдаёт title, встроенные карточки местами читают name — кладём оба.
    window.SA_DATA.collections = serverCollections.map((c) => Object.assign({}, c, { name: c.title }));
  }

  const ready = Promise.resolve().then(async () => {
    const fileDemo = window.location.protocol === 'file:';
    Api.mode = fileDemo ? 'embedded' : 'unavailable';
    if (!fileDemo) {
      try { await getJson('/api/health'); Api.mode = 'server'; }
      catch (error) {
        // Отсутствие API у статического сервера — демо. Сбой доступного API демо не включает.
        if (error.status === 404) Api.mode = 'embedded';
      }
    }
    try {
      const [dict, tasks, collections] = await Promise.all([
        getJson('/api/dictionaries'),
        getJson('/api/tasks'),
        getJson('/api/collections')
      ]);
      replaceDictionaries(dict);
      mergeTasks(tasks);
      replaceCollections(collections);
    } catch (error) {
      // Ошибка каталога не меняет ранее определённый режим сервера.
    }
    try {
      changeUser(Api.mode === 'server' ? await Api.me() : null, Api.mode === 'server');
    } catch (error) {
      changeUser(null, false);
    }
    await offerGuestDrafts();
    return Api.mode;
  });

  const Api = {
    mode: 'unavailable',
    user: null,
    initialized: false,
    ready,

    get: getJson,
    post: postJson,

    // Bcrypt ограничивает байты UTF-8, а не число символов кириллицы.
    validPassword(value) {
      return typeof value === 'string' && value.trim().length > 0 && value.length >= 8
        && new TextEncoder().encode(value).length <= 72;
    },

    /* ---------- вход (куки ставит сервер, сюда токены не возвращаются) ---------- */
    async register(email, password, name) {
      changeUser(await postJson('/api/auth/register', { email, password, name }), true);
      await offerGuestDrafts();
      return Api.user;
    },

    async login(email, password) {
      changeUser(await postJson('/api/auth/login', { email, password }), true);
      await offerGuestDrafts();
      return Api.user;
    },

    async logout() {
      await postJson('/api/auth/logout', {});
      changeUser(null, true);
    },

    async me() {
      const user = await getJson('/api/auth/me');
      Api.user = user;
      return user;
    },

    /* ---------- контур практики (Фаза 2): сервер, если есть и вошли ---------- */
    serverPractice() {
      return Api.mode === 'server' && !!Api.user;
    },

    async saveDraft(taskId, tabs, version) {
      return putJson('/api/tasks/' + encodeURIComponent(taskId) + '/draft', { tabs: tabs || [], version: version ?? null });
    },

    async getDraft(taskId) {
      try {
        return await getJson('/api/tasks/' + encodeURIComponent(taskId) + '/draft');
      } catch (error) {
        return null;
      }
    },

    async submitAttempt(taskId, tabs, idempotencyKey) {
      const extra = idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : null;
      return postJson('/api/attempts', { taskId, tabs: tabs || [] }, extra);
    },

    async getAttempt(attemptId) {
      return getJson('/api/attempts/' + encodeURIComponent(attemptId));
    },

    async listAttempts(taskId) {
      try {
        return await getJson('/api/tasks/' + encodeURIComponent(taskId) + '/attempts');
      } catch (error) {
        return null;
      }
    },

    async getReference(taskId) {
      // 403 (эталон закрыт) и 404 глотаем: значит, показывать нечего.
      try {
        return await getJson('/api/tasks/' + encodeURIComponent(taskId) + '/reference');
      } catch (error) {
        return null;
      }
    },

    /* ---------- диагностика (Фаза 3): сервер, если есть и вошли ---------- */
    async getQuestions() {
      return getJson('/api/assessment/questions');
    },

    async submitAssessment(answers, durationSec) {
      return postJson('/api/assessment/submissions', { answers: answers || {}, durationSec: durationSec || 0 });
    },

    async assessmentHistory() {
      try {
        return await getJson('/api/assessment/submissions');
      } catch (error) {
        return null;
      }
    },

    async assessmentPlan(submissionId) {
      try {
        const query = submissionId ? '?submissionId=' + encodeURIComponent(submissionId) : '';
        return await getJson('/api/assessment/plan' + query);
      } catch (error) {
        return null;
      }
    },

    /* ---------- жалобы (Фаза 3, UC-S08) ---------- */    async fileComplaint(attemptId, reason) {
      return postJson('/api/complaints', { attemptId, reason });
    },

    async myComplaints() {
      try {
        return await getJson('/api/complaints/mine');
      } catch (error) {
        return null;
      }
    },

    /* ---------- предзапись на Pro (вместо paywall): гостевая ---------- */
    async submitWaitlist(email, phone, source) {
      return postJson('/api/waitlist', { email, phone, source: source || '' });
    },

    /* ---------- биллинг (Фаза 4): тарифы, заказы, Pro-статус ---------- */    async plans() {
      return getJson('/api/billing/plans');
    },

    async billingStatus() {
      try {
        return await getJson('/api/billing/status');
      } catch (error) {
        return null;
      }
    },

    async createOrder(plan) {
      return postJson('/api/billing/orders', { plan });
    },

    async redeemPromo(code) {
      return postJson('/api/billing/promocodes/redeem', { code });
    },

    async myOrders() {
      try {
        return await getJson('/api/billing/orders');
      } catch (error) {
        return null;
      }
    },

    async cancelSubscription(id) {
      return postJson('/api/billing/subscriptions/' + encodeURIComponent(id) + '/cancel', {});
    },

    /* ---------- кабинет (макет): серверные доработки после утверждения ---------- */    async updateProfile(name) {
      return putJson('/api/auth/profile', { name });
    },

    async changePassword(currentPassword, newPassword) {
      const result = await postJson('/api/auth/password/change', { currentPassword, newPassword });
      Api.user = null;
      window.dispatchEvent(new Event('ag:session-expired'));
      return result;
    },

    async myAttempts(limit) {
      try {
        const query = limit ? '?limit=' + encodeURIComponent(limit) : '';
        return await getJson('/api/attempts/mine' + query);
      } catch (error) {
        return null;
      }
    },

    async oauthStatus() {
      try {
        return await getJson('/api/auth/oauth2/status');
      } catch (error) {
        return { googleEnabled: false };
      }
    },

    /* Сброс пароля: запрос всегда «принят» (бэк не палит, есть ли email),
       подтверждение — по токену из письма (потребитель — login.html?mode=reset). */
    async requestPasswordReset(email) {
      return postJson('/api/auth/password/request', { email });
    },

    async confirmPasswordReset(token, password) {
      return postJson('/api/auth/password/confirm', { token, password });
    }
  };

  window.Api = Api;
})();
