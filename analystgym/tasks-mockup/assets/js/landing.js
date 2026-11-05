/* ============================================================
   landing.js — главная страница
   ============================================================ */

(function () {
  document.addEventListener('DOMContentLoaded', async () => {
    if (window.Api) await Api.ready;
    AppUI.mountHeader('home');
    AppUI.mountFooter();

    const tasks = Store.tasks();
    const questions = (SA_DATA.questions || []).length;
    const collections = Store.dictionaries().collections.filter((c) => c.active !== false);

    const statTasks = document.getElementById('statTasks');
    if (statTasks) statTasks.textContent = Api.catalogError ? '—' : String(tasks.length);
    const statQuestions = document.getElementById('statQuestions');
    if (statQuestions) statQuestions.textContent = String(questions);

    /* --- персонализация: если уже есть результаты, показываем их --- */
    const stats = Store.stats();
    if (stats.assessment) {
      const lead = document.querySelector('.hero-lead');
      if (lead) {
        const banner = document.createElement('div');
        banner.className = 'info-box';
        banner.style.marginBottom = '20px';
        banner.innerHTML = `
          <div class="ib-title">Ваша последняя диагностика</div>
          <div class="row" style="gap:14px;flex-wrap:wrap">
            <span class="badge badge-accent">знания по тесту: ${AppUI.esc(stats.assessment.grade.name)}</span>
            <span class="badge">итог: ${stats.assessment.score}/100</span>
            <span class="badge ${stats.assessment.weakest ? 'badge-warn' : ''}">зона роста: ${AppUI.esc(stats.assessment.weakest ? stats.assessment.weakest.name : '—')}</span>
            <a class="link-btn" href="results.html">открыть результат →</a>
          </div>`;
        lead.parentNode.insertBefore(banner, lead);
      }
    } else if (stats.reviewed) {
      AppUI.toast(`Решений с ревью: ${stats.reviewed}. Продолжайте — прогресс виден в каталоге.`, 'ok', 'С возвращением');
    }

    /* --- карточки подборок --- */
    const host = document.getElementById('landingCollections');
    if (host) {
      host.innerHTML = collections.slice(0, 6).map((collection) => {
        const items = collection.taskIds
          .map((id) => tasks.find((t) => t.id === id))
          .filter(Boolean);
        const levels = ['easy', 'medium', 'hard'].map((lvl) => items.filter((t) => t.level === lvl).length);
        return `
          <a class="card card-hover collection-card" href="collections.html#${AppUI.esc(collection.id)}" style="text-decoration:none">
            <div class="collection-top">
              <span class="collection-ico">${AppUI.esc(collection.icon || '◈')}</span>
              <div>
                <h3>${AppUI.esc(collection.name)}</h3>
                <p class="desc">${AppUI.esc(collection.tagline || '')}</p>
              </div>
            </div>
            <div class="collection-meta">
              <span><b>${items.length}</b> ${AppUI.plural(items.length, ['задача', 'задачи', 'задач'])}</span>
              <span class="level level-easy">${levels[0]}</span>
              <span class="level level-medium">${levels[1]}</span>
              <span class="level level-hard">${levels[2]}</span>
            </div>
          </a>`;
      }).join('');
    }

    /* --- тарифы: вместо демо-оплаты — предзапись на Pro (изучаем спрос) --- */
    document.querySelectorAll('[data-demo-plan]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        if (window.Waitlist) {
          Waitlist.open(button.dataset.demoPlan === 'team' ? 'team' : 'landing');
          return;
        }
        const plan = button.dataset.demoPlan === 'pro' ? 'Pro' : 'Team';
        AppUI.modal({
          title: `${plan} · форма недоступна`,
          html: '<p>Не удалось загрузить форму заявки. Обновите страницу и попробуйте ещё раз. Заявка не отправлена.</p>'
        });
      });
    });

    /* --- плавный скролл по якорям --- */
    document.querySelectorAll('a[href^="#"]').forEach((link) => {
      link.addEventListener('click', (event) => {
        const id = link.getAttribute('href').slice(1);
        if (!id) return;
        const target = document.getElementById(id);
        if (!target) return;
        event.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  });
})();
