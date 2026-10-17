/* ============================================================
   waitlist.js — предзапись на Pro вместо paywall.
   Изучаем спрос до запуска платежей: email + телефон (+7-маска),
   регистрация в БД через POST /api/waitlist. Без сервера
   (чистая статика) — честный локальный fallback в localStorage,
   чтобы форму можно было показать хоть на netlify.
   ============================================================ */

(function () {
  const LOCAL_KEY = 'ag_waitlist';
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  /** Почта: trim + строчные (сервер делает то же самое). */
  function cleanEmail(value) {
    return String(value || '').trim().toLowerCase().slice(0, 254);
  }

  function validEmail(value) {
    const email = cleanEmail(value);
    return email.length >= 3 && email.length <= 254 && EMAIL_RE.test(email);
  }

  /** Цифры телефона как есть (нормализация — в formatPhone/normalizePhone). */
  function phoneDigits(value) {
    return String(value || '').replace(/\D/g, '').slice(0, 11);
  }

  /**
   * Маска +7 (___) ___-__-__: 8 в начале → 7, 10 цифр без кода → добираем 7.
   * Недобор показываем как есть (частичный ввод), перебор режем.
   */
  function formatPhone(value) {
    let d = phoneDigits(value);
    if (d.startsWith('8')) d = '7' + d.slice(1);
    else if (d.length === 10) d = '7' + d;
    else if (d && !d.startsWith('7')) d = ('7' + d).slice(0, 11);
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
    else if (d.length === 10) d = '7' + d;
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
      if (list.some((item) => item.email === email)) return { duplicate: true };
      list.push({ email, phone, source: source || '', createdAt: new Date().toISOString(), local: true });
      localStorage.setItem(LOCAL_KEY, JSON.stringify(list));
      return { duplicate: false };
    } catch (e) {
      return { duplicate: false };
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
   * при сетевом провале (статика без бэка) — локальный список.
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
      return await submit(email, phone, source);
    } catch (error) {
      // Сервера рядом нет (file://, netlify-статика): спрос фиксируем локально.
      if (error instanceof TypeError || (error && error.message && String(error.message).startsWith('Failed to fetch'))) {
        return Object.assign({ fallback: true }, saveLocal(cleanEmail(email), phone, source));
      }
      throw error;
    }
  }

  function formHtml() {
    return `
      <div class="field"><label for="wlEmail">Почта</label>
        <input id="wlEmail" type="email" inputmode="email" autocomplete="email" maxlength="254" placeholder="you@example.com">
      </div>
      <div class="field"><label for="wlPhone">Телефон</label>
        <input id="wlPhone" type="tel" inputmode="tel" autocomplete="tel" placeholder="+7 (___) ___-__-__">
      </div>
      <p class="muted" style="font-size:12px">Нажимая кнопку, вы соглашаетесь с обработкой персональных данных для связи о запуске Pro.</p>
      <div class="modal-actions">
        <button type="button" class="btn btn-primary" data-role="send">Оставить заявку</button>
      </div>`;
  }

  /** Модалка предзаписи: точка входа для 402, лендинга и кабинета. */
  function open(source) {
    const ui = window.AppUI || window.UI;
    if (!ui || typeof ui.modal !== 'function') return;
    const dialog = ui.modal({ title: 'Предзапись на Pro', wide: false, html: formHtml(), closeText: 'Позже' });
    const emailInput = dialog.body.querySelector('#wlEmail');
    const phoneInput = dialog.body.querySelector('#wlPhone');
    attachPhoneMask(phoneInput);
    setTimeout(() => emailInput.focus(), 60);
    dialog.body.querySelector('[data-role="send"]').addEventListener('click', async () => {
      const email = cleanEmail(emailInput.value);
      const phone = normalizePhone(phoneInput.value);
      if (!validEmail(email)) {
        (window.AppUI || window.UI).toast('Проверьте почту', 'warn');
        emailInput.focus();
        return;
      }
      if (!phone) {
        (window.AppUI || window.UI).toast('Проверьте телефон: нужен российский номер', 'warn');
        phoneInput.focus();
        return;
      }
      try {
        const res = await submitWithFallback(email, phone, source);
        dialog.body.innerHTML = res.duplicate
          ? '<p>Вы уже в списке — напишем первым делом, как только Pro откроется.</p>'
          : '<p>Готово! Вы в предзаписи — напишем, как только Pro откроется.</p>';
      } catch (error) {
        (window.AppUI || window.UI).toast('Не получилось отправить: ' + (error && error.message ? error.message : error), 'bad');
      }
    });
  }

  /** Встроенная форма для кабинета (тот же контракт, без модалки). */
  function renderInline(host, source) {
    host.innerHTML = `
      <div class="row" style="gap:8px;margin-bottom:12px"><span class="badge">Предзапись</span></div>
      <p class="muted" style="font-size:13px">Pro откроем после набора желающих — оставьте контакты, напишем первым.</p>
      ${formHtml()}`;
    const emailInput = host.querySelector('#wlEmail');
    const phoneInput = host.querySelector('#wlPhone');
    attachPhoneMask(phoneInput);
    host.querySelector('[data-role="send"]').addEventListener('click', async () => {
      const email = cleanEmail(emailInput.value);
      const phone = normalizePhone(phoneInput.value);
      if (!validEmail(email)) {
        (window.AppUI || window.UI).toast('Проверьте почту', 'warn');
        return;
      }
      if (!phone) {
        (window.AppUI || window.UI).toast('Проверьте телефон: нужен российский номер', 'warn');
        return;
      }
      try {
        const res = await submitWithFallback(email, phone, source);
        host.innerHTML = res.duplicate
          ? '<p class="muted">Вы уже в списке — напишем первым делом.</p>'
          : '<p class="muted">Готово! Вы в предзаписи.</p>';
      } catch (error) {
        (window.AppUI || window.UI).toast('Не получилось отправить: ' + (error && error.message ? error.message : error), 'bad');
      }
    });
  }

  window.Waitlist = {
    open, renderInline, submit: submitWithFallback,
    validEmail, cleanEmail, formatPhone, normalizePhone, attachPhoneMask
  };
})();
