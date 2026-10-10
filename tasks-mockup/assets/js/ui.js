/* ============================================================
   ui.js — общий слой: шапка, подвал, модалки, тосты, диаграммы
   ============================================================ */

(function () {

  const UI = {};

  /* ---------- мелочи ---------- */

  UI.esc = function (value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  UI.qs = function (name) {
    return new URLSearchParams(window.location.search).get(name);
  };

  UI.plural = function (count, forms) {
    const n = Math.abs(Number(count)) % 100;
    const n1 = n % 10;
    if (n > 10 && n < 20) return forms[2];
    if (n1 > 1 && n1 < 5) return forms[1];
    if (n1 === 1) return forms[0];
    return forms[2];
  };

  UI.debounce = function (fn, ms) {
    let timer = null;
    return function () {
      const args = arguments;
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(null, args), ms || 250);
    };
  };

  /* ---------- тема оформления (тёмная / серая / светлая) ---------- */

  const THEMES = [
    { id: 'dark', name: 'Тёмная' },
    { id: 'gray', name: 'Серая · IDE' },
    { id: 'light', name: 'Светлая' }
  ];

  function themeName(id) {
    const found = THEMES.find((t) => t.id === id);
    return found ? found.name : THEMES[0].name;
  }

  UI.theme = function () {
    try {
      const saved = localStorage.getItem('sa-trainer:theme');
      if (saved === 'gray' || saved === 'light') return saved;
      return 'dark';
    } catch (error) {
      const attr = document.documentElement.dataset.theme;
      if (attr === 'gray' || attr === 'light') return attr;
      return 'dark';
    }
  };

  UI.setTheme = function (mode) {
    const value = mode === 'gray' ? 'gray' : mode === 'light' ? 'light' : 'dark';
    if (value === 'dark') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', value);
    try {
      localStorage.setItem('sa-trainer:theme', value);
    } catch (error) {
      /* приватный режим: тема живёт до перезагрузки */
    }
    document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
      const label = button.querySelector('[data-theme-label]');
      if (label) label.textContent = themeName(value);
      button.title = `Оформление: ${themeName(value)}. Нажмите, чтобы выбрать`;
    });
  };

  UI.initTheme = function () {
    UI.setTheme(UI.theme());
  };

  UI.themeMenu = function (anchor) {
    const current = UI.theme();
    UI.menu(anchor, THEMES.map((item) => ({
      id: item.id,
      label: `${item.id === current ? '●' : '○'}  ${item.name}`,
      onSelect: () => UI.setTheme(item.id)
    })));
  };

  UI.timeAgo = function (iso) {
    const then = new Date(iso).getTime();
    if (!then) return '';
    const diff = Math.max(0, Date.now() - then);
    const min = Math.floor(diff / 60000);
    if (min < 1) return 'только что';
    if (min < 60) return `${min} ${UI.plural(min, ['минуту', 'минуты', 'минут'])} назад`;
    const hours = Math.floor(min / 60);
    if (hours < 24) return `${hours} ${UI.plural(hours, ['час', 'часа', 'часов'])} назад`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} ${UI.plural(days, ['день', 'дня', 'дней'])} назад`;
    return new Date(iso).toLocaleDateString('ru-RU');
  };

  UI.dateTime = function (iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  UI.levelBadge = function (levelId) {
    const level = window.Store.level(levelId);
    return `<span class="level ${UI.esc(level.cssClass || '')}">${UI.esc(level.name)}</span>`;
  };

  UI.levelPill = function (levelId) {
    const level = window.Store.level(levelId);
    return `<span class="level-pill ${UI.esc(level.cssClass || '')}">${UI.esc(level.name)}</span>`;
  };

  UI.tagChips = function (tagIds, limit) {
    const ids = (tagIds || []).slice(0, limit || 99);
    return ids.map((id) => {
      const tag = window.Store.tag(id);
      return `<span class="chip">${UI.esc(tag.name)}</span>`;
    }).join('');
  };

  UI.statusMeta = {
    new: { label: 'Не начато', icon: '', state: 'new' },
    draft: { label: 'Черновик', icon: '✎', state: 'draft' },
    review: { label: 'На ревью', icon: '◷', state: 'review' },
    reviewed: { label: 'Ревью получено', icon: '✓', state: 'done' }
  };

  /* ---------- шапка и подвал ---------- */

  /* ---------- логотип ---------- */

  /* Единое лого во всех шапках/подвалах. Если файла assets/logo.png
     нет — вместо картинки аккуратно встаёт текстовая плашка SA. */
  UI.logoImg = function () {
    return '<img class="brand-logo" src="./assets/logo.png" alt="AnalystGym" data-logo>';
  };

  UI.bindLogos = function (root) {
    const scope = root || document;
    scope.querySelectorAll('img[data-logo]').forEach((img) => {
      const swap = () => {
        const stub = document.createElement('span');
        stub.className = 'brand-mark';
        stub.textContent = 'SA';
        img.replaceWith(stub);
      };
      if (img.complete && img.naturalWidth === 0) swap();
      else img.addEventListener('error', swap);
    });
  };

  /* ---------- шапка и подвал (навигация — отдельно под каждый продукт) ---------- */

  const NAV_PRACTICE = [
    { href: 'catalog.html', label: 'Задачи', id: 'catalog' },
    { href: 'collections.html', label: 'Подборки', id: 'collections' },
    { href: 'courses.html', label: 'Курсы', id: 'courses' },
    { href: 'practice.html#how', label: 'Как это работает', id: 'how' },
    { href: 'practice.html#pricing', label: 'Тарифы', id: 'pricing' },
    { href: 'account.html', label: 'Кабинет', id: 'account' }
  ];

  const NAV_COURSE = [
    { href: 'courses.html', label: 'Курсы', id: 'courses' }
  ];

  /* Вход/кабинет в шапке: гостю — Войти + Регистрация, своему — имя и выход.
     Api подтягивается асинхронно (ready), поэтому рисуем дважды: сразу
     гостевой вариант и повторно после ready (без сервера останется гость). */
  function paintAuthSlot(mount) {
    const slot = mount.querySelector('[data-auth-slot]');
    if (!slot) return;
    const paint = () => {
      const target = mount.querySelector('[data-auth-slot]');
      if (!target) return;
      const user = window.Api ? Api.user : null;
      if (!user) {
        target.innerHTML = `
          <a class="btn btn-ghost btn-sm" href="login.html">Войти</a>
          <a class="btn btn-primary btn-sm" href="login.html?mode=register">Регистрация</a>`;
        return;
      }
      const short = String(user.name || user.email || 'Кабинет').split(' ')[0];
      target.innerHTML = `
        <a class="btn btn-ghost btn-sm" href="account.html" title="${UI.esc(user.email || '')}">${UI.esc(short)}</a>
        <button class="btn btn-ghost btn-sm" type="button" data-logout>Выйти</button>`;
      const out = target.querySelector('[data-logout]');
      if (out) out.addEventListener('click', async () => {
        try { await Api.logout(); } catch (error) { /* сессия и так мёртвая */ }
        window.location.reload();
      });
    };
    paint();
    if (window.Api && Api.ready && typeof Api.ready.then === 'function') {
      Api.ready.then(paint).catch(paint);
    }
  }

  UI.mountHeader = function (active, product) {
    const mount = document.getElementById('siteHeader');
    if (!mount) return;
    UI.initTheme();
    const isCourse = product === 'course';
    const nav = isCourse ? NAV_COURSE : NAV_PRACTICE;
    const stats = window.Store.stats();
    const levelName = stats.assessment ? stats.assessment.grade.name : null;

    mount.className = 'site-header';
    mount.innerHTML = `
      <div class="wrap wrap-wide">
        <a class="brand" href="index.html" title="AnalystGym — на главную платформы">
          ${UI.logoImg()}
          <span>Analyst<span style="color:var(--accent)">Gym</span></span>
          <span class="brand-sub hidden-mobile">${isCourse ? 'курсы для аналитиков' : 'тренажёр собеседований'}</span>
        </a>
        <button class="icon-btn burger" id="burgerBtn" type="button" aria-label="Меню" aria-expanded="false">☰</button>
        <nav class="main-nav" aria-label="Основная навигация">
          ${nav.map((item) => `<a href="${item.href}" ${item.id === active ? 'aria-current="page"' : ''}>${UI.esc(item.label)}</a>`).join('')}
        </nav>
        <div class="header-actions">
          <button class="btn btn-ghost btn-sm" type="button" data-theme-toggle title="Сменить оформление">
            <span aria-hidden="true">◐</span>&nbsp;<span data-theme-label>Тёмная</span>
          </button>
          <span data-auth-slot style="display:contents"></span>
          ${!isCourse && (stats.reviewed || stats.assessment) ? `
            <div class="progress-chip" title="Ваш прогресс в макете">
              <span class="avatar">Я</span>
              <span>
                ${levelName ? `уровень <b>${UI.esc(levelName)}</b>` : `решено <b>${stats.reviewed}</b>`}
              </span>
            </div>` : ''}
          ${isCourse
            ? '<a class="btn btn-primary btn-sm" href="practice.html">Онлайн-тренажёр</a>'
            : '<a class="btn btn-primary btn-sm" href="catalog.html">К задачам</a>'}
        </div>
      </div>`;
    const toggle = mount.querySelector('[data-theme-toggle]');
    if (toggle) toggle.addEventListener('click', (event) => {
      event.stopPropagation();
      UI.themeMenu(toggle);
    });
    paintAuthSlot(mount);
    const burger = mount.querySelector('#burgerBtn');
    const navEl = mount.querySelector('.main-nav');
    if (burger && navEl) {
      const closeNav = () => {
        navEl.classList.remove('open');
        burger.setAttribute('aria-expanded', 'false');
      };
      burger.addEventListener('click', (event) => {
        event.stopPropagation();
        const willOpen = !navEl.classList.contains('open');
        UI.closeMenu();
        navEl.classList.toggle('open', willOpen);
        burger.setAttribute('aria-expanded', String(willOpen));
      });
      navEl.addEventListener('click', (event) => {
        if (event.target.closest('a')) closeNav();
      });
      document.addEventListener('click', (event) => {
        if (!event.target.closest('.site-header')) closeNav();
      });
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeNav();
      });
    }
    UI.bindLogos(mount);
    UI.initTheme();
  };

  const FOOTERS = {
    practice: [
      { title: 'Практика', links: [
        ['catalog.html', 'Каталог задач'],
        ['collections.html', 'Подборки по доменам'],
        ['courses.html', 'Курсы'],
        ['results.html', 'Мои результаты']
      ]},
      { title: 'Домены', links: [
        ['collections.html#integrations', 'Интеграции'],
        ['collections.html#system-design', 'Системный дизайн'],
        ['collections.html#databases', 'Базы данных и SQL'],
        ['collections.html#requirements', 'Требования']
      ]},
      { title: 'Платформа', links: [
        ['index.html', 'AnalystGym — платформа'],
        ['practice.html#pricing', 'Тарифы'],
        ['practice.html#faq', 'Вопросы и ответы'],
        ['admin.html', 'Справочники (админка)']
      ]}
    ],
    course: [
      { title: 'Курсы', links: [
        ['courses.html', 'Все курсы'],
        ['course.html?id=req-free', 'Бесплатный курс']
      ]},
      { title: 'Тренажёр', links: [
        ['practice.html', 'Онлайн-тренажёр'],
        ['catalog.html', 'Каталог задач']
      ]},
      { title: 'Платформа', links: [
        ['index.html', 'AnalystGym — платформа'],
        ['admin.html', 'Справочники (админка)']
      ]}
    ]
  };

  UI.mountFooter = function (product) {
    const mount = document.getElementById('siteFooter');
    if (!mount) return;
    const isCourse = product === 'course';    const columns = FOOTERS[isCourse ? 'course' : 'practice'];
    const about = isCourse
      ? 'Курсы для системных и бизнес-аналитиков: короткие уроки без воды, практика на тренажёре, прогресс по курсу.'
      : 'Тренажёр собеседований для системных и бизнес-аналитиков: задачи с реальных проектов, ревью двумя ИИ-агентами и диагностика уровня.';
    mount.className = 'site-footer';
    mount.innerHTML = `
      <div class="wrap">
        <div class="footer-grid">
          <div class="footer-col">
            <a class="brand" href="index.html" title="AnalystGym — на главную платформы" style="margin-bottom:14px">
              ${UI.logoImg()}
              <span>AnalystGym</span>
            </a>
            <p class="footer-note">${about}</p>
            <p class="footer-note mono" style="margin-top:14px;font-size:12px">Кликабельный макет · данные хранятся в браузере</p>
          </div>
          ${columns.map((col) => `
            <div class="footer-col">
              <h4>${UI.esc(col.title)}</h4>
              ${col.links.map(([href, label]) => `<a href="${href}">${UI.esc(label)}</a>`).join('')}
            </div>`).join('')}
          <div class="footer-col">
            <h4>Демо</h4>
            <a href="#" data-action="reset-demo">Сбросить демо-данные</a>
          </div>
        </div>
        <div class="footer-bottom">
          <span>© 2026 AnalystGym · макет UX</span>
          <span id="storageMode">хранилище: ${window.Store.backend}</span>
        </div>
      </div>`;

    UI.bindLogos(mount);
    mount.querySelectorAll('[data-action="reset-demo"]').forEach((link) => {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        UI.confirm({
          title: 'Сбросить демо-данные?',
          text: 'Черновики решений, история ревью, результаты диагностики и прогресс курсов будут удалены из этого браузера.',
          confirmText: 'Сбросить',
          danger: true
        }).then((ok) => {
          if (!ok) return;
          window.Store.reset();
          UI.toast('Демо-данные сброшены', 'ok');
          setTimeout(() => window.location.reload(), 600);
        });
      });
    });
  };

  /* ---------- тосты ---------- */

  UI.toast = function (message, type, title) {
    let host = document.querySelector('.toasts');
    if (!host) {
      host = document.createElement('div');
      host.className = 'toasts';
      document.body.append(host);
    }
    const item = document.createElement('div');
    item.className = 'toast' + (type ? ' ' + type : '');
    item.innerHTML = (title ? `<b>${UI.esc(title)}</b>` : '') + UI.esc(message);
    host.append(item);
    setTimeout(() => {
      item.style.transition = 'opacity .25s, transform .25s';
      item.style.opacity = '0';
      item.style.transform = 'translateX(12px)';
      setTimeout(() => item.remove(), 260);
    }, 3600);
  };

  /* ---------- модалки ---------- */

  UI.closeModal = function () {
    document.querySelectorAll('.modal-backdrop').forEach((node) => node.remove());
    document.body.style.overflow = '';
  };

  /**
   * options: { title, text, html, confirmText, cancelText, danger, checklist: [] }
   * resolve(true|false)
   */
  UI.confirm = function (options) {
    const opts = options || {};
    return new Promise((resolve) => {
      const backdrop = document.createElement('div');
      backdrop.className = 'modal-backdrop';
      backdrop.innerHTML = `
        <div class="modal" role="dialog" aria-modal="true" aria-label="${UI.esc(opts.title || 'Подтверждение')}">
          <h3>${UI.esc(opts.title || 'Подтвердить?')}</h3>
          ${opts.text ? `<p>${UI.esc(opts.text)}</p>` : ''}
          ${opts.html || ''}
          ${opts.checklist && opts.checklist.length ? `<ul class="checklist">${opts.checklist.map((i) => `<li>${UI.esc(i)}</li>`).join('')}</ul>` : ''}
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" data-role="cancel">${UI.esc(opts.cancelText || 'Отмена')}</button>
            <button type="button" class="btn ${opts.danger ? 'btn-danger' : 'btn-primary'}" data-role="confirm">${UI.esc(opts.confirmText || 'Подтвердить')}</button>
          </div>
        </div>`;
      document.body.append(backdrop);
      document.body.style.overflow = 'hidden';

      const finish = (value) => {
        UI.closeModal();
        resolve(value);
      };
      backdrop.querySelector('[data-role="confirm"]').addEventListener('click', () => finish(true));
      backdrop.querySelector('[data-role="cancel"]').addEventListener('click', () => finish(false));
      backdrop.addEventListener('click', (event) => { if (event.target === backdrop) finish(false); });
      document.addEventListener('keydown', function onKey(event) {
        if (event.key === 'Escape') { document.removeEventListener('keydown', onKey); finish(false); }
      });
      setTimeout(() => backdrop.querySelector('[data-role="confirm"]').focus(), 40);
    });
  };

  UI.modal = function (options) {
    const opts = options || {};
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal ${opts.wide ? 'wide' : ''}" role="dialog" aria-modal="true">
        ${opts.title ? `<h3>${UI.esc(opts.title)}</h3>` : ''}
        <div data-role="body">${opts.html || ''}</div>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" data-role="close">${UI.esc(opts.closeText || 'Закрыть')}</button>
        </div>
      </div>`;
    document.body.append(backdrop);
    document.body.style.overflow = 'hidden';
    const close = () => UI.closeModal();
    backdrop.querySelector('[data-role="close"]').addEventListener('click', close);
    backdrop.addEventListener('click', (event) => { if (event.target === backdrop) close(); });
    return { root: backdrop, body: backdrop.querySelector('[data-role="body"]'), close };
  };

  /* ---------- выпадающее меню ---------- */

  UI.menu = function (anchor, items) {
    UI.closeMenu();
    const rect = anchor.getBoundingClientRect();
    const menu = document.createElement('div');
    menu.className = 'menu';
    menu.style.top = `${rect.bottom + window.scrollY + 6}px`;
    menu.style.left = `${Math.max(12, rect.left + window.scrollX - 120)}px`;
    menu.innerHTML = items.map((item) => {
      if (item.separator) return '<div class="menu-sep"></div>';
      return `<button type="button" data-id="${UI.esc(item.id)}">${UI.esc(item.label)}${item.hint ? `<span class="k">${UI.esc(item.hint)}</span>` : ''}</button>`;
    }).join('');
    document.body.append(menu);

    menu.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-id]');
      if (!button) return;
      const item = items.find((i) => i.id === button.dataset.id);
      UI.closeMenu();
      if (item && item.onSelect) item.onSelect(item);
    });

    setTimeout(() => {
      document.addEventListener('click', UI.closeMenu, { once: true });
    }, 0);
    return menu;
  };

  UI.closeMenu = function () {
    document.querySelectorAll('.menu').forEach((node) => node.remove());
  };

  /* ---------- диаграммы: Mermaid + PlantUML ---------- */

  let mermaidReady = false;
  let diagramSeq = 0;

  function mermaid() {
    const lib = window.mermaid;
    if (!lib) return Promise.reject(new Error('Библиотека Mermaid не загружена'));
    if (!mermaidReady) {
      lib.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: 'neutral',
        flowchart: { useMaxWidth: true, htmlLabels: true },
        sequence: { useMaxWidth: true },
        themeVariables: { fontFamily: 'Inter, system-ui, sans-serif' }
      });
      mermaidReady = true;
    }
    return Promise.resolve(lib);
  }

  function plantuml(source) {
    const lib = window.PlantUMLCore;
    if (!lib) return Promise.reject(new Error('Библиотека PlantUML не загружена'));
    return new Promise((resolve, reject) => {
      lib.renderToString(String(source).split(/\r?\n/), resolve, reject);
    });
  }

  /**
   * Рендер одного блока.
   * container — элемент, куда кладём svg; type — 'mermaid' | 'plantuml'; source — текст.
   */
  UI.renderDiagram = async function (container, type, source) {
    if (!container) return;
    const text = String(source || '').trim();
    if (!text) {
      container.innerHTML = '<div class="preview-empty">Пустая диаграмма.<br>Вставьте код слева — превью появится здесь.</div>';
      return;
    }
    try {
      if (type === 'plantuml') {
        container.innerHTML = await plantuml(text);
      } else {
        const lib = await mermaid();
        diagramSeq += 1;
        const result = await lib.render(`dg-${diagramSeq}-${Date.now().toString(36)}`, text);
        container.innerHTML = result.svg;
      }
      container.dataset.error = '';
    } catch (error) {
      const message = (error && (error.message || String(error))) || 'Ошибка синтаксиса';
      container.dataset.error = message;
      container.innerHTML = `<div class="preview-error">Не удалось построить диаграмму\n\n${UI.esc(message.slice(0, 600))}</div>`;
    }
  };

  /**
   * Рендер всех <div class="diagram-embed" data-type data-source> внутри root.
   * Источник хранится в data-source (encodeURIComponent), чтобы не экранировать HTML.
   */
  UI.renderEmbeddedDiagrams = async function (root) {
    const scope = root || document;
    const nodes = Array.from(scope.querySelectorAll('.diagram-embed[data-type]'));
    for (const node of nodes) {
      if (node.dataset.rendered === 'true') continue;
      node.dataset.rendered = 'true';
      const source = node.dataset.source ? decodeURIComponent(node.dataset.source) : node.textContent;
      node.textContent = '';
      await UI.renderDiagram(node, node.dataset.type, source);
    }
  };

  UI.embedDiagram = function (type, source, title) {
    return `<div class="diagram-embed" data-type="${UI.esc(type)}" data-source="${encodeURIComponent(source || '')}">
      ${title ? `<div class="preview-empty">${UI.esc(title)}</div>` : ''}
    </div>`;
  };

  /* ---------- простые сниппеты для редакторов диаграмм ---------- */

  UI.diagramSnippets = {
    mermaid: [
      { id: 'flow', label: 'flowchart', code: 'flowchart TD\n  A[Начало] --> B{Условие}\n  B -->|да| C[Действие]\n  B -->|нет| D[Альтернатива]\n' },
      { id: 'seq', label: 'sequence', code: 'sequenceDiagram\n  autonumber\n  actor Пользователь as U\n  participant Сервис as S\n  U->>S: запрос\n  S-->>U: ответ\n' },
      { id: 'er', label: 'ER', code: 'erDiagram\n  ENTITY_A ||--o{ ENTITY_B : "связь"\n  ENTITY_A {\n    bigint id PK\n    string name\n  }\n' },
      { id: 'state', label: 'state', code: 'stateDiagram-v2\n  [*] --> DRAFT\n  DRAFT --> ACTIVE: событие\n  ACTIVE --> [*]\n' }
    ],
    plantuml: [
      { id: 'seq', label: 'sequence', code: '@startuml\nautonumber\nactor Пользователь as U\nparticipant "Сервис" as S\ndatabase "БД" as DB\nU -> S: запрос\nS -> DB: чтение\nDB --> S: данные\nS --> U: ответ\n@enduml\n' },
      { id: 'activity', label: 'activity', code: '@startuml\nstart\n:Получить заявку;\nif (Данные полные?) then (да)\n  :Обработать;\nelse (нет)\n  :Запросить уточнение;\nendif\nstop\n@enduml\n' },
      { id: 'component', label: 'component', code: '@startuml\ncomponent "API Gateway" as GW\ncomponent "Сервис A" as A\ndatabase "БД" as DB\nGW --> A\nA --> DB\n@enduml\n' },
      { id: 'class', label: 'class', code: '@startuml\nclass Order {\n  +id\n  +status\n  +create()\n}\nclass OrderItem\nOrder "1" *-- "many" OrderItem\n@enduml\n' }
    ]
  };

  window.AppUI = UI;
})();
