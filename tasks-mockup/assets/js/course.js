/* ============================================================
   course.js — страница курса: модули в сайдбаре + контент урока.
   Контент заполненных уроков грузится из output/ (lecture.md,
   exercises.md, answers.md, project/task.md) и рендерится через
   window.AppMD. Уроки с инлайн-телом (db-sql, req-free) рисуются
   напрямую. Уроки-заглушки — «в производстве».
   Нужен HTTP (server.py или хостинг): на file:// fetch заблокирован,
   покажем подсказку. Уроки-заглушки — «в производстве».
   ============================================================ */

(function () {

  let course = null;
  let flat = [];
  let lesson = null;
  let lessonCache = {};
  let lessonView = 'lecture';
  let mode = 'lesson';

  document.addEventListener('DOMContentLoaded', () => {
    AppUI.mountHeader('courses', 'course');
    AppUI.mountFooter('course');

    const id = AppUI.qs('id');
    course = id ? Store.course(id) : null;
    const host = document.getElementById('courseHost');

    if (!course) {
      document.getElementById('crumbs').innerHTML = '<a href="courses.html">Курсы</a>';
      host.innerHTML = `
        <div class="empty-state">
          <h3>Курс не найден</h3>
          <p class="muted" style="margin-bottom:16px">Возможно, ссылка устарела. Выберите курс из каталога.</p>
          <a class="btn btn-primary" href="courses.html">К курсам</a>
        </div>`;
      return;
    }

    document.title = `${course.title} — AnalystGym`;
    Store.touchCourse(course.id);
    flat = SA_DATA.flatLessons(course);

    const wanted = AppUI.qs('lesson');
    if (wanted) {
      lesson = flat.find((item) => item.id === wanted)
        || flat.find((item) => Store.isLessonOpen(course.id, item) && !Store.isLessonDone(course.id, item.id))
        || flat[0];
      const wantedView = AppUI.qs('view');
      lessonView = wantedView === 'artifacts' || wantedView === 'exercises' ? wantedView : 'lecture';
    } else {
      mode = 'about';
      lesson = null;
    }

    renderCrumbs();
    render();
  });

  function renderCrumbs() {
    document.getElementById('crumbs').innerHTML = `
      <a href="courses.html">Курсы</a>
      <span class="sep">/</span>
      <span style="color:var(--text-2)">${AppUI.esc(course.title)}</span>
      <div class="grow"></div>
      <a href="catalog.html">Тренажёр задач →</a>
    `;
  }

  function lessonIndex() {
    return flat.findIndex((item) => item.id === lesson.id);
  }

  function lessonUrl(item) {
    return `course.html?id=${AppUI.esc(course.id)}&lesson=${AppUI.esc(item.id)}`;
  }

  /* ==================== каркас ==================== */

  function render() {
    if (mode === 'about') {
      renderAbout();
      scrollCurrentIntoView();
      return;
    }
    const progress = Store.courseProgress(course.id);
    const open = Store.isLessonOpen(course.id, lesson);
    const done = Store.isLessonDone(course.id, lesson.id);
    const index = lessonIndex();
    const prev = index > 0 ? flat[index - 1] : null;
    const next = index < flat.length - 1 ? flat[index + 1] : null;

    document.getElementById('courseHost').innerHTML = `
      <div class="page-head" style="padding-top:8px">
        <div class="row" style="gap:16px;align-items:flex-start;flex-wrap:wrap">
          <span class="course-logo" style="background:${course.logo.bg}">${AppUI.esc(course.logo.letters)}</span>
          <div class="grow">
            <h1 style="font-size:clamp(24px,3vw,34px)">${AppUI.esc(course.title)}</h1>
            <p class="lead">${AppUI.esc(course.tagline)} · ${AppUI.esc(course.level)}</p>
          </div>
          <div style="text-align:right">
            <div class="mono" style="font-size:11px;color:var(--dim);letter-spacing:.1em;margin-bottom:6px">ПРОГРЕСС</div>
            <div class="mono" style="font-size:22px;font-weight:600">${progress.done}/${progress.total}</div>
          </div>
        </div>
        <div class="progress-bar mt-16"><i style="width:${progress.pct}%"></i></div>
      </div>

      <div class="learn-layout">
        <aside class="learn-side">
          ${mode === 'about' ? `
          <div class="panel learn-course">
            <span class="course-logo" style="background:${course.logo.bg}">${AppUI.esc(course.logo.letters)}</span>
            <div>
              <h3>${AppUI.esc(course.title)}</h3>
              <div class="mono dim" style="font-size:11px">${flat.length} ${AppUI.plural(flat.length, ['урок', 'урока', 'уроков'])} · ${progress.pct}% пройдено</div>
            </div>
          </div>` : `
          <a class="panel learn-course learn-course-link" href="course.html?id=${AppUI.esc(course.id)}" title="К описанию курса">
            <span class="course-logo" style="background:${course.logo.bg}">${AppUI.esc(course.logo.letters)}</span>
            <div>
              <h3>${AppUI.esc(course.title)}</h3>
              <div class="mono dim" style="font-size:11px">${flat.length} ${AppUI.plural(flat.length, ['урок', 'урока', 'уроков'])} · ${progress.pct}% пройдено</div>
            </div>
          </a>`}
          <nav class="panel learn-lessons" aria-label="Уроки курса">
            ${renderModules()}
          </nav>
        </aside>

        <main class="learn-main">
          <div class="panel">
            <div class="pane-head">
              <div>
                <div class="mono dim" style="font-size:10.5px;letter-spacing:.12em">УРОК ${index + 1} ИЗ ${flat.length}${lesson.moduleTitle ? ` · ${AppUI.esc(lesson.moduleTitle)}` : ''}</div>
                <div class="title" style="font-size:17px;margin-top:2px">${AppUI.esc(lesson.title)}</div>
              </div>
              <div class="actions">
                ${open && lesson.filled ? `
                  <button class="jump-btn" type="button" data-view="exercises" data-active="${lessonView === 'exercises'}">Упражнения</button>
                  ${(lesson.artifacts || []).length ? `<button class="jump-btn" type="button" data-view="artifacts" data-active="${lessonView === 'artifacts'}">Артефакты</button>` : ''}` : ''}
              </div>
            </div>
            <div id="lessonContent"></div>
            ${open && (lesson.filled || lesson.body) ? `
              <div class="learn-nav">
                ${prev ? `<a class="btn btn-ghost btn-sm" href="${lessonUrl(prev)}">← ${AppUI.esc(prev.title.slice(0, 30))}</a>` : '<span></span>'}
                <button class="btn ${done ? 'btn-ghost' : 'btn-primary'} btn-sm" type="button" id="doneBtn">
                  ${done ? 'Пройден ✓ · снять отметку' : 'Отметить пройденным'}
                </button>
                <span class="spacer"></span>
                ${next ? `<a class="btn btn-outline btn-sm" href="${lessonUrl(next)}">${AppUI.esc(next.title.slice(0, 30))} →</a>` : '<span class="badge badge-ok">это последний урок 🎉</span>'}
              </div>` : ''}
          </div>
        </main>
      </div>`;

    if (!open) {
      renderPaywall();
    } else if (lesson.filled) {
      renderFilled();
    } else if (lesson.body) {
      renderLegacy();
    } else {
      renderStub();
    }

    scrollCurrentIntoView();
  }

  /* Текущий урок всегда виден в сайдбаре: подкручиваем внутренний скролл */
  function scrollCurrentIntoView() {
    const nav = document.querySelector('.learn-lessons');
    const current = nav && nav.querySelector('[data-current="true"]');
    if (!nav || !current || nav.scrollHeight <= nav.clientHeight) return;
    const top = current.getBoundingClientRect().top - nav.getBoundingClientRect().top;
    nav.scrollTop = Math.max(0, top + nav.scrollTop - nav.clientHeight / 2);
  }

  /* ==================== страница-обзор курса ==================== */

  function startTarget() {
    return flat.find((item) => Store.isLessonOpen(course.id, item) && !Store.isLessonDone(course.id, item.id)) || flat[0];
  }

  function renderAbout() {
    const progress = Store.courseProgress(course.id);
    const target = startTarget();
    const minutes = flat.reduce((sum, item) => sum + (item.minutes || 0), 0);
    const hours = Math.round((minutes / 60) * 10) / 10;
    const freeCount = flat.filter((item) => item.free).length;
    const cta = progress.done === 0
      ? (course.price ? 'Начать учиться' : 'Начать бесплатно')
      : (progress.done >= progress.total ? 'Пройти заново' : 'Продолжить обучение');

    document.getElementById('courseHost').innerHTML = `
      <div class="page-head" style="padding-top:8px">
        <div class="row" style="gap:16px;align-items:flex-start;flex-wrap:wrap">
          <span class="course-logo" style="background:${course.logo.bg}">${AppUI.esc(course.logo.letters)}</span>
          <div class="grow">
            <h1 style="font-size:clamp(24px,3vw,34px)">${AppUI.esc(course.title)}</h1>
            <p class="lead">${AppUI.esc(course.tagline)} · ${AppUI.esc(course.level)}</p>
          </div>
          <div style="text-align:right">
            <div class="mono" style="font-size:11px;color:var(--dim);letter-spacing:.1em;margin-bottom:6px">ПРОГРЕСС</div>
            <div class="mono" style="font-size:22px;font-weight:600">${progress.done}/${progress.total}</div>
          </div>
        </div>
        <div class="progress-bar mt-16"><i style="width:${progress.pct}%"></i></div>
      </div>

      <div class="learn-layout">
        <aside class="learn-side">
          <div class="panel learn-course">
            <span class="course-logo" style="background:${course.logo.bg}">${AppUI.esc(course.logo.letters)}</span>
            <div>
              <h3>${AppUI.esc(course.title)}</h3>
              <div class="mono dim" style="font-size:11px">${flat.length} ${AppUI.plural(flat.length, ['урок', 'урока', 'уроков'])} · ${progress.pct}% пройдено</div>
            </div>
          </div>
          <nav class="panel learn-lessons" aria-label="Уроки курса">
            ${renderModules()}
          </nav>
        </aside>

        <main class="learn-main">
          <div class="panel">
            <div class="panel-body" style="padding:26px 28px">
              <p class="eyebrow">О курсе</p>
              <p style="font-size:15px;color:var(--text-2);max-width:70ch">${AppUI.esc(course.description)}</p>
              <div class="row mt-16" style="gap:8px;flex-wrap:wrap">
                <span class="badge">${flat.length} ${AppUI.plural(flat.length, ['урок', 'урока', 'уроков'])}</span>
                ${hours ? `<span class="badge">≈ ${hours} ч</span>` : ''}
                <span class="badge">${AppUI.esc(course.level)}</span>
                ${freeCount ? `<span class="badge badge-ok">${freeCount} бесплатно</span>` : ''}
                <span class="badge">${AppUI.esc(course.audience || '')}</span>
              </div>
              ${(course.outcomes || []).length ? `
                <h3 style="font-size:16px;margin:24px 0 12px">Чему научитесь</h3>
                <ul class="course-outcomes" style="padding:0">
                  ${course.outcomes.map((o) => `<li>${AppUI.esc(o)}</li>`).join('')}
                </ul>` : ''}
            </div>
            <div class="learn-nav">
              ${course.price ? `
                <span class="course-price">${course.price.toLocaleString('ru-RU')} ₽</span>
                ${course.oldPrice ? `<span class="course-price-old">${course.oldPrice.toLocaleString('ru-RU')} ₽</span>` : ''}` : `
                <span class="course-price-free">Бесплатно</span>`}
              <span class="spacer"></span>
              ${course.price && !Store.isOwned(course.id) ? `<button class="btn btn-ghost btn-sm" type="button" id="buyBtn">Оформить доступ</button>` : ''}
              <a class="btn btn-primary" href="${lessonUrl(target)}">${cta} →</a>
            </div>
          </div>

          <div class="panel mt-16">
            <div class="panel-head"><p class="panel-title">Программа курса</p><span class="badge">${course.modules ? course.modules.length + ' модулей' : flat.length + ' уроков'}</span></div>
            <div class="collection-tasks">
              ${(course.modules || [{ sections: [{ lessons: flat }] }]).map((module) => `
                <div class="row" style="padding:12px 24px;border-bottom:1px solid var(--line-soft);gap:12px;align-items:flex-start">
                  <span class="course-logo" style="background:${course.logo.bg};flex:0 0 30px;width:30px;height:30px;font-size:10px;border-radius:9px">${AppUI.esc(course.logo.letters)}</span>
                  <div class="grow">
                    <div style="font-weight:600;font-size:14px">${AppUI.esc(module.title || course.title)}</div>
                    <div class="mono dim" style="font-size:11px;margin-top:2px">${moduleLessonCount(module)} ${AppUI.plural(moduleLessonCount(module), ['урок', 'урока', 'уроков'])}</div>
                  </div>
                </div>`).join('')}
            </div>
          </div>
        </main>
      </div>`;
  }

  function moduleLessonCount(module) {
    return ((module.sections || []).reduce((sum, section) => sum + (section.lessons || []).length, 0));
  }

  /* ==================== сайдбар с модулями ==================== */

  function renderModules() {
    if (!course.modules) {
      return flat.map((item, i) => lessonRow(item, i)).join('');
    }
    return course.modules.map((module) => {
      const moduleLessons = SA_DATA.flatLessons({ modules: [module] });
      const doneCount = moduleLessons.filter((item) => Store.isLessonDone(course.id, item.id)).length;
      const hasCurrent = Boolean(lesson) && moduleLessons.some((item) => item.id === lesson.id);
      const allDone = doneCount === moduleLessons.length && moduleLessons.length > 0;
      return `
        <details class="module-group" ${hasCurrent ? 'open' : ''}>
          <summary>
            <span class="mg-title">${AppUI.esc(module.title)}</span>
            <span class="mg-count ${allDone ? 'done' : ''}">${doneCount}/${moduleLessons.length}</span>
          </summary>
          <div class="mg-body">
            ${(module.sections || []).map((section) => `
              <div class="mg-section">${AppUI.esc(section.title)}</div>
              ${section.lessons.map((item) => lessonRow(
                Object.assign({ moduleTitle: module.title }, item),
                flat.findIndex((flatItem) => flatItem.id === item.id)
              )).join('')}
            `).join('')}
          </div>
        </details>`;
    }).join('');
  }

  function lessonRow(item, number) {
    const itemOpen = Store.isLessonOpen(course.id, item);
    const itemDone = Store.isLessonDone(course.id, item.id);
    const current = Boolean(lesson) && item.id === lesson.id;
    return `
      <a class="lesson-link" href="${lessonUrl(item)}"
         data-current="${current}" data-done="${itemDone}" data-locked="${!itemOpen}">
        <span class="lesson-num">${itemDone ? '✓' : !itemOpen ? '🔒' : number + 1}</span>
        <span>
          <span class="lt">${AppUI.esc(item.title)}</span>
          <span class="lm" style="display:block">${item.minutes ? item.minutes + ' мин' : 'скоро'}${item.free ? ' · бесплатно' : ''}</span>
        </span>
      </a>`;
  }

  /* ==================== контент заполненного урока ==================== */

  async function fetchText(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
    return response.text();
  }

  function contentBase() {
    return `../output/${lesson.dir}/`;
  }

  function loadContentScript(topicId) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `./assets/content/${topicId}.js`;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Нет встроенного модуля ${topicId}.js`));
      document.head.append(script);
    });
  }

  function cachedData() {
    const cache = window.__LESSON_MD || {};
    return cache[lesson.id] || null;
  }

  /* Реестр артефактов проекта (__artifacts.js): подгружаем один раз, тихо */
  function ensureArtifacts() {
    if (window.__ARTIFACTS && window.__ARTIFACTS.length) return Promise.resolve();
    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = './assets/content/__artifacts.js';
      script.onload = () => resolve();
      script.onerror = () => resolve();
      document.head.append(script);
    });
  }

  function resolveArtifactBody(artifact, data) {
    if (artifact.body) return { body: artifact.body, error: '' };
    if (artifact.ref && window.__ARTIFACTS) {
      const found = window.__ARTIFACTS.find((item) => item.id === artifact.ref);
      if (found && found.body) return { body: found.body, error: '' };
    }
    if (artifact.path === 'project/task.md' && data && data.task) {
      return { body: data.task, error: '' };
    }
    return { body: '', error: 'Нет встроенного текста' };
  }

  /* Запасной путь: прямые fetch из output/ (только по HTTP) */
  async function fetchPackage() {
    const base = contentBase();
    const [lecture, exercises, answers] = await Promise.all([
      fetchText(`${base}lecture.md`),
      fetchText(`${base}exercises.md`),
      fetchText(`${base}answers.md`)
    ]);
    const artifacts = [];
    for (const artifact of (lesson.artifacts || [])) {
      try {
        artifacts.push({ title: artifact.title, body: await fetchText(`${base}${artifact.path}`) });
      } catch (artifactError) {
        artifacts.push({ title: artifact.title, body: null, error: String(artifactError.message || artifactError) });
      }
    }
    return { lecture, exercises, answers, artifacts };
  }

  async function renderFilled() {
    const host = document.getElementById('lessonContent');
    host.innerHTML = '<div class="learn-body"><p class="muted">Загружаем материалы урока…</p></div>';

    try {
      await ensureArtifacts();
      if (!lessonCache[lesson.id]) {
        let data = cachedData();
        if (!data || !data.lecture) {
          try {
            await loadContentScript(lesson.id);
          } catch (scriptError) {
            data = null;
          }
          data = cachedData();
        }
        if (!data || !data.lecture) {
          data = await fetchPackage();
        } else {
          data = {
            lecture: data.lecture,
            exercises: data.exercises || '',
            answers: data.answers || '',
            artifacts: (lesson.artifacts || []).map((artifact) => ({
              title: artifact.title,
              body: artifact.path === 'project/task.md' ? (data.task || '') : '',
              error: artifact.path === 'project/task.md' ? '' : 'Нет встроенного текста, нужен HTTP'
            }))
          };
        }
        lessonCache[lesson.id] = data;
      }
      const data = lessonCache[lesson.id];
      renderLessonView();
    } catch (error) {
      const isFileProtocol = window.location.protocol === 'file:';
      host.innerHTML = `
        <div class="learn-body">
          <div class="empty-state" style="margin:8px 0">
            <h3>Не удалось загрузить материалы урока</h3>
            <p class="muted" style="margin-bottom:8px">${AppUI.esc(error.message || error)}</p>
            ${isFileProtocol
              ? '<p class="muted" style="font-size:13px">Страница открыта как файл (file://), а браузер запрещает подгрузку текстов. Запустите <code>start-mockup.bat</code> и откройте курс через http://127.0.0.1:5180</p>'
              : '<p class="muted" style="font-size:13px">Для развёртывания на хостинге положите рядом с макетом папку <code>output/</code> из репозитория курса.</p>'}
          </div>
        </div>`;
    }
  }

  /* ==================== виды урока: лекция / упражнения / артефакты ==================== */

  function backButton() {
    return '<button class="btn btn-ghost btn-sm mb-16" type="button" data-view="lecture">← Вернуться к лекции</button>';
  }

  function renderLessonView() {
    const data = lessonCache[lesson.id];
    const host = document.getElementById('lessonContent');
    if (!host || !data) return;

    if (lessonView === 'exercises') {
      host.innerHTML = `
        <div class="learn-body">
          ${backButton()}
          ${window.AppMD.render(data.exercises)}
          <details class="fold">
            <summary>Показать ответы и ориентиры</summary>
            <div class="fold-body">${window.AppMD.render(data.answers)}</div>
          </details>
        </div>`;
    } else if (lessonView === 'artifacts') {
      const cards = (lesson.artifacts || []).map((artifact, i) => {
        const resolved = resolveArtifactBody(artifact, data);
        const lines = resolved.body ? resolved.body.split('\n').length : 0;
        return `
          <details class="artifact-card"${i === 0 && resolved.body ? ' open' : ''}>
            <summary>
              <span class="artifact-ico">${AppUI.esc(artifact.icon || '▤')}</span>
              <span class="artifact-head">
                <span class="artifact-title">${AppUI.esc(artifact.title)}</span>
                ${artifact.desc ? `<span class="artifact-desc">${AppUI.esc(artifact.desc)}</span>` : ''}
              </span>
              ${artifact.kind ? `<span class="badge">${AppUI.esc(artifact.kind)}</span>` : ''}
              ${lines ? `<span class="mono dim artifact-lines">${lines} строк</span>` : ''}
              <span class="artifact-chev">▸</span>
            </summary>
            <div class="artifact-body">
              ${resolved.body ? window.AppMD.render(resolved.body) : `<p class="muted" style="font-size:13px">Не удалось загрузить: ${AppUI.esc(resolved.error)}</p>`}
            </div>
          </details>`;
      }).join('');
      host.innerHTML = `
        <div class="learn-body">
          ${backButton()}
          <p class="muted" style="font-size:13.5px">Артефакты сквозного проекта «Автоматизация комплаенса», связанные с уроком. Раскройте карточку, чтобы посмотреть содержимое.</p>
          <div class="artifact-list">${cards || '<p class="muted">К этому уроку артефакты не привязаны.</p>'}</div>
        </div>`;
    } else {
      host.innerHTML = `
        <div class="learn-body">
          ${window.AppMD.render(data.lecture)}
        </div>`;
    }
    AppUI.renderEmbeddedDiagrams(host);
    document.querySelectorAll('[data-view]').forEach((button) => {
      button.dataset.active = String(button.dataset.view === lessonView);
    });
  }

  /* ==================== legacy-урок с инлайн-телом (db-sql, req-free) ==================== */

  function renderLegacy() {
    const host = document.getElementById('lessonContent');
    host.innerHTML = `
      <div class="learn-body" id="lessonBody">
        ${lesson.body}
        ${lesson.diagram ? AppUI.embedDiagram(lesson.diagram.type, lesson.diagram.source) : ''}
      </div>`;
    AppUI.renderEmbeddedDiagrams(host);
  }

  function renderStub() {
    document.getElementById('lessonContent').innerHTML = `
      <div class="learn-body">
        <div class="empty-state" style="margin:8px 0">
          <h3>Урок в производстве</h3>
          <p class="muted" style="margin-bottom:16px">«${AppUI.esc(lesson.title)}» ещё пишет издательство. В макете наполнены первые уроки модулей M01, M02, M03 и M05 — начните с них.</p>
          <a class="btn btn-ghost btn-sm" href="${lessonUrl(flat.find((item) => item.filled) || flat[0])}">К готовым урокам</a>
        </div>
      </div>`;
  }

  function renderPaywall() {
    document.getElementById('lessonContent').innerHTML = `
      <div class="paywall">
        <div class="lock-big">🔒</div>
        <h3>Урок доступен по подписке на курс</h3>
        <p>«${AppUI.esc(lesson.title)}» входит в полную версию курса «${AppUI.esc(course.title)}».
        В демо бесплатно открыты первые уроки модулей — остальное разблокируется в один клик.</p>
        <div class="row mb-24" style="gap:10px;justify-content:center">
          <span class="course-price">${course.price.toLocaleString('ru-RU')} ₽</span>
          ${course.oldPrice ? `<span class="course-price-old">${course.oldPrice.toLocaleString('ru-RU')} ₽</span>` : ''}
          <span class="badge">навсегда, не подписка</span>
        </div>
        <div class="row" style="gap:10px;justify-content:center;flex-wrap:wrap">
          <button class="btn btn-primary" type="button" id="buyBtn">Оформить доступ</button>
          <a class="btn btn-ghost" href="course.html?id=${AppUI.esc(course.id)}">К бесплатным урокам</a>
        </div>
        <p class="mono dim mt-16" style="font-size:11px">демо: оплата не списывается, доступ сохранится в браузере</p>
      </div>`;
  }

  document.addEventListener('click', (event) => {
    if (!course) return;

    const gotoBtn = event.target.closest('[data-view]');
    if (gotoBtn) {
      lessonView = gotoBtn.dataset.view || 'lecture';
      render();
      return;
    }

    const doneBtn = event.target.closest('#doneBtn');
    if (doneBtn && lesson) {
      if (Store.isLessonDone(course.id, lesson.id)) Store.uncompleteLesson(course.id, lesson.id);
      else {
        Store.completeLesson(course.id, lesson.id);
        AppUI.toast('Урок отмечен пройденным', 'ok');
      }
      render();
      return;
    }

    const buyBtn = event.target.closest('#buyBtn');
    if (buyBtn) {
      AppUI.confirm({
        title: `Доступ к курсу «${course.title}»`,
        text: `Полная версия: все ${flat.length} уроков, практика на тренажёре и прогресс. В макете оплата не подключена — доступ откроется сразу.`,
        checklist: [
          `Цена: ${course.price.toLocaleString('ru-RU')} ₽ (разовый платёж)`,
          'Все уроки и обновления курса',
          'Практика: задачи тренажёра по темам уроков'
        ],
        confirmText: 'Открыть демо-доступ',
        cancelText: 'Пока нет'
      }).then((ok) => {
        if (!ok) return;
        Store.setOwned(course.id, true);
        AppUI.toast('Доступ открыт — приятного обучения', 'ok');
        render();
      });
    }
  });
})();
