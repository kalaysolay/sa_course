/* Метрика подключается только с настроенным ID. Тексты решений и контакты не передаются. */
(function () {
  'use strict';
  const allowed = new Set(['practice_open', 'catalog_open', 'task_open', 'waitlist_open_pro',
    'waitlist_open_team', 'waitlist_success_pro', 'waitlist_success_team', 'solution_submitted', 'review_open']);
  const pending = [];
  let counter = null;
  let disabled = false;
  window.AppAnalytics = {
    goal(name) {
      if (!allowed.has(name) || disabled) return;
      try {
        if (counter) window.ym(counter, 'reachGoal', name);
        else if (pending.length < 30) pending.push(name);
      } catch (_) { /* Ошибка аналитики не меняет результат действия пользователя. */ }
    }
  };

  // В URL не попадают токены входа, содержимое форм, произвольные параметры и hash.
  function publicUrl() {
    const url = new URL(location.pathname, location.origin);
    const query = new URLSearchParams(location.search);
    if (url.pathname === '/task.html' && /^[a-zA-Z0-9_-]{1,150}$/.test(query.get('id') || '')) {
      url.searchParams.set('id', query.get('id'));
    }
    for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
      const value = query.get(key);
      if (value && /^[a-zA-Z0-9а-яА-ЯёЁ _.-]{1,100}$/.test(value)) url.searchParams.set(key, value);
    }
    return url.href;
  }

  const pageUrl = publicUrl();
  fetch('/api/site-config', { credentials: 'same-origin' }).then(response => {
    if (!response.ok) throw new Error('analytics config unavailable');
    return response.json();
  }).then(config => {
    if (!/^[1-9][0-9]{0,14}$/.test(config.metrikaId || '')) { disabled = true; pending.length = 0; return; }
    counter = Number(config.metrikaId);
    window.ym = window.ym || function () { (window.ym.a = window.ym.a || []).push(arguments); };
    window.ym.l = Date.now();
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://mc.yandex.ru/metrika/tag.js';
    document.head.appendChild(script);
    window.ym(counter, 'init', { defer: true, webvisor: false, clickmap: false, trackLinks: false, accurateTrackBounce: true });
    const referrer = document.referrer ? new URL(document.referrer).origin : '';
    window.ym(counter, 'hit', pageUrl, { referer: referrer });
    pending.splice(0).forEach(name => window.ym(counter, 'reachGoal', name));
    const pageGoal = { '/practice.html': 'practice_open', '/catalog.html': 'catalog_open', '/task.html': 'task_open' }[location.pathname];
    if (pageGoal) window.AppAnalytics.goal(pageGoal);
  }).catch(() => { disabled = true; pending.length = 0; });
}());
