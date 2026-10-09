/* ============================================================
   api.js — мост фронта к backend API (Фаза 1).
   Пытается забрать каталог/словари с того же origin (/api/*);
   если сервера нет (file:// или макет открыт как статика) —
   молча остаётся на встроенных SA_DATA. ready всегда резолвится,
   никогда не реджектится: страница обязана отрисоваться в любом случае.
   Решения/попытки пока живут в Store (localStorage), их очередь — Фаза 2.
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

  async function postJson(path, body) {
    // CSRF: Spring кладёт readable-куку XSRF-TOKEN на GET; каждый POST
    // обязан вернуть её значение заголовком X-XSRF-TOKEN (см. SecurityConfig).
    const headers = Object.assign({}, JSON_HEADERS);
    const token = cookie('XSRF-TOKEN');
    if (token) headers['X-XSRF-TOKEN'] = token;
    const response = await fetch(path, {
      method: 'POST',
      credentials: 'same-origin',
      headers,
      body: JSON.stringify(body || {})
    });
    if (!response.ok) {
      const error = new Error('POST ' + path + ' -> ' + response.status);
      error.status = response.status;
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
    }
  };

  window.Api = Api;
})();
