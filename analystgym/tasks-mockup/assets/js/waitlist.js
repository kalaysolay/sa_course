/* ============================================================
   waitlist.js — предзапись на Pro вместо paywall.
   Изучаем спрос до запуска платежей: email + телефон (+7-маска),
   регистрация в БД через POST /api/waitlist.
   При сетевой ошибке остаётся локальный черновик для повторной отправки;
   подтверждение показываем только после ответа сервера.
   ============================================================ */

(function () {
  const LOCAL_KEY = 'ag_waitlist';
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  /** Почта: trim + строчные (сервер делает то же самое). */
  function cleanEmail(value) {
    return String(value || '').trim().toLowerCase();
  }

  function validEmail(value) {
    const email = cleanEmail(value);
    return email.length >= 3 && email.length <= 254 && EMAIL_RE.test(email);
  }

  /** Цифры телефона как есть (нормализация — в formatPhone/normalizePhone). */
  function phoneDigits(value) {
    return String(value || '').replace(/\D/g, '');
  }

  /**
   * Маска +7 (___) ___-__-__: 8 в начале → 7, 10 цифр без кода → добираем 7.
   * Недобор показываем как есть; лишние цифры сохраняем для явной ошибки.
   */
  function formatPhone(value) {
    let d = phoneDigits(value);
    // Чужой код страны и слишком длинный номер не превращаем в +7.
    if (d.length > 11 || (String(value).trim().startsWith('+') && !d.startsWith('7'))) return value;
    if (d.startsWith('8')) d = '7' + d.slice(1);
    else if (d.length === 10 && !String(value).trim().startsWith('+')) d = '7' + d;
    else if (d && !d.startsWith('7')) return value;
    if (!d) return '';
    let out = '+7';
    if (d.length > 1) out += ' (' + d.slice(1, 4);
    if (d.length >= 4) out += ')';
    if (d.length > 4) out += ' ' + d.slice(4, 7);
    if (d.length > 7) out += '-' + d.slice(7, 9);
    if (d.length > 9) out += '-' + d.slice(9, 11);
    return out;
  }

  /** Нормализация к +7XXXXXXXXXX; null — браковать и просить перепечатать. */
  function normalizePhone(value) {
    let d = phoneDigits(value);
    if (d.startsWith('8') && d.length === 11) d = '7' + d.slice(1);
    else if (d.length === 10 && !String(value).trim().startsWith('+')) d = '7' + d;
    return /^7\d{10}$/.test(d) ? '+' + d : null;
  }

  /** Живая маска на поле: форматируем по ходу ввода, каретка — в конец. */
  function attachPhoneMask(input) {
    input.addEventListener('input', () => {
      input.value = formatPhone(input.value);
    });
  }

  function readLocal() {
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  }

  function saveLocal(email, phone, source) {
    try {
      const list = readLocal();
      const old = list.findIndex((item) => item.email === email && item.source === (source || ''));
      if (old >= 0) list.splice(old, 1);
      list.push({ email, phone, source: source || '', createdAt: new Date().toISOString(), local: true });
      localStorage.setItem(LOCAL_KEY, JSON.stringify(list));
      return { saved: true };
    } catch (e) {
      return { saved: false };
    }
  }

  function csrfPrime() {
    return fetch('/api/auth/csrf', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => (data && data.token ? data.token : null))
      .catch(() => null);
  }

  /**
   * Отправка заявки: сначала сервер (Api.post сам праймит CSRF),
   * при сетевом провале — локальный черновик без подтверждения доставки.
   * 409 с сервера маппим в {duplicate:true}, а не в ошибку.
   */
  async function submit(email, phone, source) {
    const payload = { email: cleanEmail(email), phone, source: source || '' };
    if (window.Api && typeof Api.post === 'function') {
      try {
        await Api.post('/api/waitlist', payload);
        return { duplicate: false };
      } catch (error) {
        if (error && (error.status === 409 || (error.body && error.body.status === 409))) {
          return { duplicate: true };
        }
        throw error;
      }
    }
    const token = await csrfPrime();
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['X-XSRF-TOKEN'] = token;
    const response = await fetch('/api/waitlist', {
      method: 'POST',
      credentials: 'same-origin',
      headers,
      body: JSON.stringify(payload)
    });
    if (response.status === 409) return { duplicate: true };
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return { duplicate: false };
  }

  async function submitWithFallback(email, phone, source) {
    try {
      const result = await submit(email, phone, source);
      try {
        localStorage.setItem(LOCAL_KEY, JSON.stringify(readLocal().filter((item) =>
          item.email !== cleanEmail(email) || item.source !== (source || ''))));
      } catch (e) { /* Сервер уже принял заявку; очистка локального черновика необязательна. */ }
      return result;
    } catch (error) {
      // Локальное сохранение не означает доставку заявки команде.
      if (error instanceof TypeError || (error && error.message && String(error.message).startsWith('Failed to fetch'))) {
        return Object.assign({ fallback: true }, saveLocal(cleanEmail(email), phone, source));
      }
      throw error;
    }
  }

  function formHtml(source) {
    const team = source === 'team';
    return `
      <p class="muted">${team ? 'Запрос на командную практику. Team пока не запущен; формат и стоимость нужно обсудить.' : 'Сообщим о запуске Pro по почте. Заявка не подключает подписку и не требует оплаты.'}</p>
      <div class="field"><label for="wlEmail">Почта</label>
        <input id="wlEmail" type="email" inputmode="email" autocomplete="email" maxlength="254" placeholder="you@example.com">
      </div>
      <div class="field"><label for="wlPhone">Телефон</label>
        <input id="wlPhone" type="tel" inputmode="tel" autocomplete="tel" placeholder="+7 (___) ___-__-__">
      </div>
      <p class="muted" style="font-size:12px">Сейчас форма принимает только номера +7 (11 цифр: код 7 и ещё 10). Телефон обязателен для отправки заявки; основной контакт — почта. Другие коды стран пока не поддерживаются.</p>
      <p class="muted" style="font-size:12px">Нажимая кнопку, вы соглашаетесь с обработкой почты и телефона для ${team ? 'связи по командному запросу' : 'связи о запуске Pro'}. Контакты сохраняются на сервере.</p>
      <p data-role="status" role="status" aria-live="polite"></p>
      <div class="modal-actions">
        <button type="button" class="btn btn-primary" data-role="send">Оставить заявку</button>
      </div>`;
  }

  /** Модалка предзаписи: точка входа для 402, лендинга и кабинета. */
  function open(source) {
    const ui = window.AppUI || window.UI;
    if (!ui || typeof ui.modal !== 'function') return;
    const dialog = ui.modal({ title: source === 'team' ? 'Обсудить Team' : 'Предзапись на Pro', wide: false, html: formHtml(source), closeText: 'Позже' });
    bindForm(dialog.body, source);
    const emailInput = dialog.body.querySelector('#wlEmail');
    setTimeout(() => emailInput.focus(), 60);
  }

  /** Одинаковые состояния доставки в модалке и кабинете; поля остаются при сбое. */
  function bindForm(host, source) {
    const emailInput = host.querySelector('#wlEmail');
    const phoneInput = host.querySelector('#wlPhone');
    const button = host.querySelector('[data-role="send"]');
    const status = host.querySelector('[data-role="status"]');
    const draft = readLocal().filter((item) => item.source === (source || '')).pop();
    if (draft) {
      emailInput.value = draft.email;
      phoneInput.value = draft.phone;
      status.textContent = 'Есть локальный черновик. Доставка заявки не подтверждена — отправьте её ещё раз.';
    }
    attachPhoneMask(phoneInput);
    button.addEventListener('click', async () => {
      const email = cleanEmail(emailInput.value);
      const phone = normalizePhone(phoneInput.value);
      if (!validEmail(email)) {
        (window.AppUI || window.UI).toast('Проверьте почту', 'warn');
        emailInput.focus();
        return;
      }
      if (!phone) {
        (window.AppUI || window.UI).toast('Укажите номер +7 и ещё 10 цифр. Другие коды стран пока не поддерживаются.', 'warn');
        phoneInput.focus();
        return;
      }
      try {
        button.disabled = true;
        status.textContent = 'Отправляем заявку…';
        const res = await submitWithFallback(email, phone, source);
        if (res.fallback) {
          status.textContent = res.saved
            ? 'Доставка заявки не подтверждена. Контакты сохранены как черновик в этом браузере. Повторите отправку, когда появится связь.'
            : 'Заявка не отправлена и черновик не сохранён. Поля остаются в форме — попробуйте отправить ещё раз.';
          button.textContent = 'Повторить отправку';
          return;
        }
        host.innerHTML = res.duplicate
          ? '<p role="status">На сервере уже есть заявка с этой почтой. Новая запись не создана.</p>'
          : source === 'team'
            ? '<p role="status">Запрос на Team сохранён на сервере. Команда получила контакты для обсуждения. Доступ и оплата не подключены.</p>'
            : '<p role="status">Заявка на Pro сохранена на сервере. Контакты получены; дата запуска пока не объявлена. Подписка и оплата не подключены.</p>';
      } catch (error) {
        status.textContent = 'Отправка не подтверждена. Проверьте контакты и попробуйте ещё раз. Если связь прервалась после приёма, повторная отправка проверит заявку по почте.';
        button.textContent = 'Повторить отправку';
      } finally {
        button.disabled = false;
      }
    });
  }

  /** Встроенная форма для кабинета (тот же контракт, без модалки). */
  function renderInline(host, source) {
    host.innerHTML = `
      <div class="row" style="gap:8px;margin-bottom:12px"><span class="badge">Предзапись</span></div>
      ${formHtml(source)}`;
    bindForm(host, source);
  }

  window.Waitlist = {
    open, renderInline, submit: submitWithFallback,
    validEmail, cleanEmail, formatPhone, normalizePhone, attachPhoneMask
  };
})();
