/* ============================================================
   landing.js — главная страница
   ============================================================ */

(function () {
  document.addEventListener('DOMContentLoaded', () => {
    AppUI.mountHeader('home');
    AppUI.mountFooter();

    const tasks = Store.tasks();
    const questions = (SA_DATA.questions || []).length;
    const collections = Store.dictionaries().collections.filter((c) => c.active !== false);

    const statTasks = document.getElementById('statTasks');
    if (statTasks) statTasks.textContent = String(tasks.length);
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
            <span class="badge badge-accent">уровень: ${AppUI.esc(stats.assessment.grade.name)}</span>
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

    /* --- демо-кнопки тарифов --- */
    document.querySelectorAll('[data-demo-plan]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        const plan = button.dataset.demoPlan === 'pro' ? 'Pro (990 ₽/мес)' : 'Team';
        AppUI.modal({
          title: `Тариф ${plan}`,
          wide: true,
          html: `
            <p class="muted">В макете оплата не подключена — это место, где будет платёжная форма.</p>
            <ul class="checklist">
              <li>Оплата картой или по счёту для юрлиц</li>
              <li>Пробный период 7 дней на Pro</li>
              <li>Для Team — пилот на 5 участников и отчёт по команде</li>
              <li>Чеки и закрывающие документы для бухгалтерии</li>
            </ul>
            <div class="info-box mt-16">
              <div class="ib-title">Что проверить в макете вместо оплаты</div>
              <p style="margin:0;font-size:13.5px">Откройте <a href="task.html?id=int-idempotency" style="color:var(--accent)">задачу про идемпотентность</a>, напишите пару абзацев решения и отправьте на ревью — это ключевой сценарий продукта.</p>
            </div>`
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
