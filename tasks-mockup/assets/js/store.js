/* ============================================================
   store.js — состояние макета: решения, попытки, ревью, диагностика
   Хранение: localStorage, при недоступности — в памяти вкладки.
   В реальном продукте это API + БД; интерфейс намеренно такой же.
   ============================================================ */

(function () {
  const KEY = 'sa-trainer:v1';
  let backend = 'localStorage';
  let memory = null;

  function blank() {
    return {
      profile: { name: 'Гость', role: 'Системный аналитик' },
      solutions: {},     // taskId -> { tabs: [], activeTabId, updatedAt }
      attempts: {},      // taskId -> [ { id, submittedAt, status, tabs, review } ]
      assessment: null,  // { startedAt, finishedAt, answers, result }
      admin: null,       // переопределения справочников из админки
      taskEdits: {},     // taskId -> patch (правки задач из админки, живут поверх данных)
      complaints: null,  // жалобы на ревью (ленивый сид демо-данных, см. ниже)
      promptState: {},   // key -> { activeV, traffic: {version: pct} }
      agents: {},        // agentId -> { enabled, checks[], model } (оверрайды поверх движка)
      courses: {},       // courseId -> { completed: [lessonId], owned: bool, startedAt }
      visits: {}         // pageId -> count (для «живости» макета)
    };
  }

  function read() {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (!raw) return blank();
      const parsed = JSON.parse(raw);
      return Object.assign(blank(), parsed);
    } catch (error) {
      backend = 'memory';
      if (!memory) memory = blank();
      return memory;
    }
  }

  function write(state) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(state));
    } catch (error) {
      backend = 'memory';
      memory = state;
    }
  }

  let state = read();

  /* Статусы задачи во внутреннем workflow издательства */
  const TASK_STATUSES = [
    { id: 'draft', name: 'Черновик', hint: 'Видна только в админке' },
    { id: 'review', name: 'На ревью', hint: 'Проверяет методист' },
    { id: 'published', name: 'Опубликована', hint: 'Видна студентам' },
    { id: 'archived', name: 'Архив', hint: 'Снята с публикации' }
  ];

  /* Глубокое слияние правок админки поверх базовых данных.
     Объекты мержатся, массивы и скаляры заменяются целиком. */
  function mergeDeep(base, patch) {
    if (Array.isArray(patch)) return patch.slice();
    if (!patch || typeof patch !== 'object') return patch;
    const src = (base && typeof base === 'object' && !Array.isArray(base)) ? base : {};
    const out = Object.assign({}, src);
    Object.keys(patch).forEach((key) => {
      const value = patch[key];
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        out[key] = mergeDeep(out[key], value);
      } else if (Array.isArray(value)) {
        out[key] = value.slice();
      } else {
        out[key] = value;
      }
    });
    return out;
  }

  const Store = {
    get backend() { return backend; },

    all() { return state; },

    reset() {
      state = blank();
      write(state);
    },

    /* ---------- справочники с учётом правок админки ---------- */
    dictionaries() {
      const base = {
        levels: (window.SA_DATA.levels || []).slice(),
        tags: (window.SA_DATA.tags || []).slice(),
        tagCategories: (window.SA_DATA.tagCategories || []).slice(),
        collections: (window.SA_DATA.collections || []).slice()
      };
      if (!state.admin) return base;
      return {
        levels: state.admin.levels || base.levels,
        tags: state.admin.tags || base.tags,
        tagCategories: state.admin.tagCategories || base.tagCategories,
        collections: state.admin.collections || base.collections
      };
    },

    saveDictionaries(dict) {
      state.admin = {
        levels: dict.levels,
        tags: dict.tags,
        tagCategories: dict.tagCategories,
        collections: dict.collections
      };
      write(state);
    },

    resetDictionaries() {
      if (state.admin) {
        state.admin = null;
        write(state);
      }
    },

    /* ---------- задачи (+ правки из админки) ---------- */
    tasks() {
      const base = (window.SA_DATA.tasks || []).slice();
      const custom = Object.values(state.taskEdits || {})
        .filter((entry) => entry && entry.__created)
        .map((entry) => mergeDeep({}, entry));
      return base.concat(custom);
    },

    task(id) {
      const base = (window.SA_DATA.tasks || []).find((task) => task.id === id) || null;
      const patch = (state.taskEdits || {})[id];
      if (base) {
        if (!patch) return base;
        return mergeDeep(Object.assign({}, base), patch);
      }
      if (patch && patch.__created) return mergeDeep({}, patch);
      return null;
    },

    saveTaskEdit(taskId, patch) {
      state.taskEdits = state.taskEdits || {};
      state.taskEdits[taskId] = mergeDeep(state.taskEdits[taskId] || {}, patch);
      state.taskEdits[taskId].updatedAt = new Date().toISOString();
      write(state);
      return this.task(taskId);
    },

    resetTaskEdit(taskId) {
      if (state.taskEdits) delete state.taskEdits[taskId];
      write(state);
    },

    taskStatus(taskId) {
      const task = this.task(taskId);
      return (task && task.status) || 'published';
    },

    taskStatuses() {
      return TASK_STATUSES.slice();
    },

    setTaskStatus(taskId, status) {
      return this.saveTaskEdit(taskId, { status });
    },

    level(id) {
      return this.dictionaries().levels.find((item) => item.id === id) || { id, name: id, cssClass: '' };
    },

    tag(id) {
      return this.dictionaries().tags.find((item) => item.id === id) || { id, name: id, category: null };
    },

    tagCategoryName(id) {
      const cat = this.dictionaries().tagCategories.find((item) => item.id === id);
      return cat ? cat.name : 'Прочее';
    },

    collection(id) {
      return this.dictionaries().collections.find((item) => item.id === id) || null;
    },

    collectionsOfTask(taskId) {
      return this.dictionaries().collections.filter((c) => (c.taskIds || []).includes(taskId));
    },

    /* ---------- решения (черновики) ---------- */
    solution(taskId) {
      return state.solutions[taskId] || null;
    },

    saveSolution(taskId, solution) {
      state.solutions[taskId] = Object.assign({}, solution, { updatedAt: Date.now() });
      write(state);
      return state.solutions[taskId];
    },

    clearSolution(taskId) {
      delete state.solutions[taskId];
      write(state);
    },

    /* ---------- попытки и ревью ---------- */
    attempts(taskId) {
      return state.attempts[taskId] || [];
    },

    lastAttempt(taskId) {
      const list = this.attempts(taskId);
      return list.length ? list[list.length - 1] : null;
    },

    addAttempt(taskId, attempt) {
      if (!state.attempts[taskId]) state.attempts[taskId] = [];
      state.attempts[taskId].push(attempt);
      write(state);
      return attempt;
    },

    updateAttempt(taskId, attemptId, patch) {
      const list = state.attempts[taskId] || [];
      const item = list.find((a) => a.id === attemptId);
      if (item) Object.assign(item, patch);
      write(state);
      return item;
    },

    removeAttempt(taskId, attemptId) {
      state.attempts[taskId] = (state.attempts[taskId] || []).filter((a) => a.id !== attemptId);
      write(state);
    },

    /**
     * Статус задачи для каталога:
     * new — не открывали, draft — есть черновик, review — отправлено и ждёт,
     * reviewed — есть ревью.
     */
    status(taskId) {
      const last = this.lastAttempt(taskId);
      if (last && last.status === 'in_review') return 'review';
      if (last && last.status === 'reviewed') return 'reviewed';
      const draft = this.solution(taskId);
      if (draft && draft.tabs && draft.tabs.length) return 'draft';
      return 'new';
    },

    bestGrade(taskId) {
      return this.attempts(taskId)
        .filter((a) => a.review && a.review.grade)
        .reduce((max, a) => Math.max(max, a.review.grade.score), 0) || null;
    },

    /* ---------- жалобы на ревью ---------- */
    complaintStatuses() {
      return [
        { id: 'new', name: 'Новая' },
        { id: 'review', name: 'Разбираем' },
        { id: 'resolved', name: 'Решена' },
        { id: 'rejected', name: 'Отклонена' }
      ];
    },

    complaints() {
      if (!state.complaints) {
        state.complaints = [
          { id: 'cmp-1042', taskId: 'int-idempotency', user: 'Марат Г.', score: 41, createdAt: '2026-10-07T19:50:00', status: 'new', promptVersion: 'arch-reviewer@v2', reason: 'Агент не засчитал outbox, хотя я описал transactional outbox с relay. Похоже, маркеров не хватило.', excerpt: '…публикация события и запись заказа — в одной транзакции через таблицу outbox, relay доставляет в Kafka…' },
          { id: 'cmp-1041', taskId: 'db-slow-report', user: 'Анна К.', score: 78, createdAt: '2026-10-07T21:12:00', status: 'review', promptVersion: 'sa-reviewer@v3', reason: 'Снизили за отсутствие витрины, но в условии всего 2 недели на всё. Витрина — системное решение, а не быстрый фикс.', excerpt: '…предлагаю покрывающий индекс и переписанный предикат, витрину — вторым этапом…' },
          { id: 'cmp-1039', taskId: 'req-vague-feature', user: 'Игорь С.', score: 22, createdAt: '2026-10-06T12:31:00', status: 'new', promptVersion: 'sa-reviewer@v3', reason: 'Ревью будто про другую задачу: я писал про B2B-портал, агент требует B2C-метрики.', excerpt: '…конверсия заявки в выдачу, время до решения, доля ручных разборов…' },
          { id: 'cmp-1036', taskId: 'des-order-state', user: 'Марат Г.', score: 66, createdAt: '2026-10-05T18:40:00', status: 'resolved', promptVersion: 'sa-reviewer@v3', resolution: 'Разобрали: guard на отмену действительно был расплывчат. Добавили пример в подсказки задачи.', reason: 'Частично согласен: guard-условия у меня слабые, но «недопустимые переходы» я покрыл.', excerpt: '…отмена после ACCEPTED — только через поддержку с удержанием…' }
        ];
        write(state);
      }
      return state.complaints;
    },

    saveComplaint(id, patch) {
      const list = this.complaints();
      const item = list.find((c) => c.id === id);
      if (item) Object.assign(item, patch);
      write(state);
      return item;
    },

    /* ---------- версии промптов (A/B) ---------- */
    prompts() {
      const base = (window.SA_DATA.prompts || []).slice();
      const overrides = state.promptState || {};
      return base.map((prompt) => {
        const over = overrides[prompt.key] || { versions: {} };
        const seen = new Set(prompt.versions.map((v) => v.v));
        const versions = prompt.versions.map((v) => Object.assign({}, v,
          (over.versions || {})[v.v] || {},
          over.activeV === v.v ? { status: 'active' } : {}
        ));
        Object.entries(over.versions || {}).forEach(([rawV, extra]) => {
          const v = Number(rawV);
          if (!seen.has(v)) {
            versions.push(Object.assign(
              { v, status: 'archived', traffic: 0, model: 'mock-agents/v1', changelog: '', text: '', updatedAt: '' },
              extra,
              over.activeV === v ? { status: 'active' } : {}
            ));
          }
        });
        versions.sort((a, b) => a.v - b.v);
        return Object.assign({}, prompt, { versions });
      });
    },

    setPromptTraffic(key, version, pct) {
      state.promptState = state.promptState || {};
      state.promptState[key] = state.promptState[key] || { versions: {} };
      state.promptState[key].versions[version] = Object.assign(
        {}, state.promptState[key].versions[version], { traffic: Math.max(0, Math.min(100, Number(pct) || 0)) }
      );
      write(state);
    },

    promotePrompt(key, version) {
      const prompt = this.prompts().find((p) => p.key === key);
      if (!prompt) return;
      state.promptState = state.promptState || {};
      const versions = {};
      prompt.versions.forEach((v) => {
        const prev = ((state.promptState[key] || {}).versions || {})[v.v] || {};
        versions[v.v] = Object.assign({}, prev, {
          traffic: v.v === version ? 100 : 0,
          status: v.v === version ? 'active' : 'archived'
        });
      });
      state.promptState[key] = Object.assign({}, state.promptState[key], { activeV: version, versions });
      write(state);
    },

    addPromptVersion(key, entry) {
      state.promptState = state.promptState || {};
      state.promptState[key] = state.promptState[key] || { versions: {} };
      state.promptState[key].versions[entry.v] = {
        traffic: Math.max(0, Math.min(100, Number(entry.traffic) || 0)),
        status: (Number(entry.traffic) || 0) > 0 ? 'canary' : 'archived',
        changelog: String(entry.changelog || ''),
        model: entry.model || 'mock-agents/v1',
        text: String(entry.text || ''),
        updatedAt: new Date().toISOString().slice(0, 10)
      };
      write(state);
    },

    savePromptVersion(key, version, patch) {
      state.promptState = state.promptState || {};
      state.promptState[key] = state.promptState[key] || { versions: {} };
      state.promptState[key].versions[version] = Object.assign(
        {}, state.promptState[key].versions[version], patch, { updatedAt: new Date().toISOString().slice(0, 10) }
      );
      write(state);
    },

    /* ---------- агенты ревью ---------- */
    agents() {
      const base = (window.ReviewEngine && window.ReviewEngine.agents) || {};
      return Object.keys(base).map((id) => Object.assign(
        { id, enabled: true },
        base[id],
        (state.agents || {})[id] || {}
      ));
    },

    saveAgent(id, patch) {
      state.agents = state.agents || {};
      state.agents[id] = Object.assign({}, state.agents[id], patch);
      write(state);
      return state.agents[id];
    },

    /* ---------- диагностика ---------- */
    assessment() { return state.assessment; },
    saveAssessment(data) {
      state.assessment = data;
      write(state);
      return data;
    },

    /* ---------- курсы: прогресс и доступ ---------- */
    course(id) {
      return (window.SA_DATA.courses || []).find((c) => c.id === id) || null;
    },

    courseState(courseId) {
      if (!state.courses[courseId]) {
        state.courses[courseId] = { completed: [], owned: false, startedAt: null };
      }
      return state.courses[courseId];
    },

    touchCourse(courseId) {
      const courseState = this.courseState(courseId);
      if (!courseState.startedAt) {
        courseState.startedAt = Date.now();
        write(state);
      }
      return courseState;
    },

    isLessonDone(courseId, lessonId) {
      return (this.courseState(courseId).completed || []).includes(lessonId);
    },

    completeLesson(courseId, lessonId) {
      const courseState = this.courseState(courseId);
      if (!courseState.completed.includes(lessonId)) {
        courseState.completed.push(lessonId);
        write(state);
      }
      return courseState;
    },

    uncompleteLesson(courseId, lessonId) {
      const courseState = this.courseState(courseId);
      courseState.completed = (courseState.completed || []).filter((id) => id !== lessonId);
      write(state);
      return courseState;
    },

    setOwned(courseId, owned) {
      const courseState = this.courseState(courseId);
      courseState.owned = Boolean(owned);
      write(state);
      return courseState;
    },

    isOwned(courseId) {
      const course = this.course(courseId);
      if (!course) return false;
      if (!course.price) return true;
      return Boolean(this.courseState(courseId).owned);
    },

    isLessonOpen(courseId, lesson) {
      if (!lesson) return false;
      if (lesson.free) return true;
      return this.isOwned(courseId);
    },

    courseProgress(courseId) {
      const course = this.course(courseId);
      const lessons = window.SA_DATA.flatLessons(course);
      if (!lessons.length) return { done: 0, total: 0, pct: 0 };
      const done = lessons.filter((lesson) => this.isLessonDone(courseId, lesson.id)).length;
      return { done, total: lessons.length, pct: Math.round((done / lessons.length) * 100) };
    },

    /* ---------- статистика для лендинга/шапки ---------- */
    stats() {
      const taskIds = this.tasks().map((t) => t.id);
      const reviewed = taskIds.filter((id) => this.status(id) === 'reviewed').length;
      const inProgress = taskIds.filter((id) => this.status(id) === 'draft' || this.status(id) === 'review').length;
      const attempts = Object.values(state.attempts).reduce((sum, list) => sum + list.length, 0);
      const avgScore = (() => {
        const scores = [];
        Object.values(state.attempts).forEach((list) => {
          list.forEach((a) => { if (a.review && a.review.grade) scores.push(a.review.grade.score); });
        });
        if (!scores.length) return null;
        return Math.round(scores.reduce((s, v) => s + v, 0) / scores.length);
      })();
      return {
        total: taskIds.length,
        reviewed,
        inProgress,
        attempts,
        avgScore,
        assessment: state.assessment && state.assessment.result ? state.assessment.result : null
      };
    },

    exportJson() {
      return JSON.stringify(state, null, 2);
    }
  };

  window.Store = Store;
})();
