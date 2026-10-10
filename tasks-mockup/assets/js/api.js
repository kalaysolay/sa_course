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

  async function getJson(path) {
    const response = await fetch(path, { credentials: 'same-origin' });
    if (!response.ok) throw new Error('GET ' + path + ' -> ' + response.status);
    return response.json();
  }

  async function postJson(path, body, extraHeaders) {
    return sendJson('POST', path, body, extraHeaders);
  }

  async function putJson(path, body) {
    return sendJson('PUT', path, body, null);
  }

  async function sendJson(method, path, body, extraHeaders) {
    // CSRF: сервер пишет readable-куку XSRF-TOKEN только когда токен материализован
    // (GET /api/auth/csrf ниже), на обычных GET куки нет — токен ленивый.
    // Каждый не-GET обязан вернуть значение куки заголовком X-XSRF-TOKEN.
    await ensureCsrf();
    const headers = Object.assign({}, JSON_HEADERS, extraHeaders || {});
    // Заголовок — маскированный токен из тела /api/auth/csrf (см. ensureCsrf),
    // запасной вариант — сырая кука (с XOR-хендлером не сработает, но и не навредит).
    const token = csrfToken || cookie('XSRF-TOKEN');
    if (token) headers['X-XSRF-TOKEN'] = token;
    const response = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers,
      body: JSON.stringify(body || {})
    });
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

  const ready = (async () => {
    try {
      const [dict, tasks, collections] = await Promise.all([
        getJson('/api/dictionaries'),
        getJson('/api/tasks'),
        getJson('/api/collections')
      ]);
      replaceDictionaries(dict);
      mergeTasks(tasks);
      replaceCollections(collections);
      Api.mode = 'server';
    } catch (error) {
      // Сервера нет рядом — остаёмся на встроенных данных, это штатно для макета.
      Api.mode = 'embedded';
    }
    try {
      Api.user = await Api.me();
    } catch (error) {
      Api.user = null;
    }
    return Api.mode;
  })();

  const Api = {
    mode: 'embedded',
    user: null,
    ready,

    get: getJson,
    post: postJson,

    /* ---------- вход (куки ставит сервер, сюда токены не возвращаются) ---------- */
    async register(email, password, name) {
      Api.user = await postJson('/api/auth/register', { email, password, name });
      return Api.user;
    },

    async login(email, password) {
      Api.user = await postJson('/api/auth/login', { email, password });
      return Api.user;
    },

    async logout() {
      try {
        await postJson('/api/auth/logout', {});
      } finally {
        Api.user = null;
      }
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

    async saveDraft(taskId, tabs) {
      return putJson('/api/tasks/' + encodeURIComponent(taskId) + '/draft', { tabs: tabs || [] });
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

    /* ---------- кабинет (макет): серверные доработки после утверждения ---------- */
    async updateProfile(name) {
      return putJson('/api/auth/profile', { name });
    },

    async changePassword(currentPassword, newPassword) {
      return postJson('/api/auth/password/change', { currentPassword, newPassword });
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
    }
  };

  window.Api = Api;
})();
