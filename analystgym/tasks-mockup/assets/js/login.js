/* ============================================================
   login.js — вход и регистрация (черновик макета).
   После успеха — редирект в ?next= (только свой .html) или в кабинет.
   Вошедшего сразу уводим в кабинет, формы ему ни к чему.
   ============================================================ */

(function () {
  function showError(message) {
    const box = document.getElementById('authError');
    box.textContent = message;
    box.style.borderColor = 'rgba(255,107,107,.4)';
    box.classList.remove('hidden');
  }

  function showOk(message) {
    const box = document.getElementById('authError');
    box.textContent = message;
    box.style.borderColor = 'rgba(80,200,120,.45)';
    box.classList.remove('hidden');
  }

  function hideError() {
    document.getElementById('authError').classList.add('hidden');
  }

  function nextUrl() {
    const raw = AppUI.qs('next') || '';
    // Редирект только на свои страницы, иначе — в кабинет.
    if (/^[a-z0-9-]+\.html(\?.*)?$/.test(raw)) return raw;
    return 'account.html';
  }

  function setMode(mode) {
    const login = mode === 'login';
    const register = mode === 'register';
    const resetRequest = mode === 'reset-request';
    const reset = mode === 'reset';
    document.getElementById('loginForm').classList.toggle('hidden', !login);
    document.getElementById('registerForm').classList.toggle('hidden', !register);
    document.getElementById('resetRequestForm').classList.toggle('hidden', !resetRequest);
    document.getElementById('resetConfirmForm').classList.toggle('hidden', !reset);
    document.getElementById('forgotLink').classList.toggle('hidden', reset || resetRequest);
    document.getElementById('authTitle').textContent =
      reset ? 'Новый пароль' : resetRequest ? 'Сброс пароля' : login ? 'Вход' : 'Регистрация';
    document.getElementById('tabLogin').classList.toggle('btn-primary', login);
    document.getElementById('tabRegister').classList.toggle('btn-primary', register);
    hideError();
  }

  document.addEventListener('DOMContentLoaded', async () => {
    AppUI.mountHeader('');
    AppUI.mountFooter();

    if (window.Api) {
      try { await Api.ready; } catch (e) { /* без сервера формы мёртвые, скажем честно */ }
      if (Api.user) {
        window.location.href = 'account.html';
        return;
      }
      if (Api.mode !== 'server') {
        showError('Сервер недоступен: вход работает только рядом с бэкендом, а не с файла.');
      }
    }

    const qsMode = AppUI.qs('mode') || 'login';
    // Ссылка из письма: ?mode=reset&token=... — сразу форма нового пароля.
    const resetToken = AppUI.qs('token') || '';
    const initial = qsMode === 'register' ? 'register'
      : qsMode === 'reset' && resetToken ? 'reset'
      : qsMode === 'reset' ? 'reset-request'
      : 'login';
    setMode(initial);
    document.getElementById('tabLogin').addEventListener('click', () => setMode('login'));
    document.getElementById('tabRegister').addEventListener('click', () => setMode('register'));

    document.getElementById('loginForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      hideError();
      const email = document.getElementById('loginEmail').value.trim();
      const password = document.getElementById('loginPassword').value;
      if (!email || !password) {
        showError('Введите email и пароль.');
        return;
      }
      const btn = document.getElementById('loginBtn');
      btn.disabled = true;
      try {
        await Api.login(email, password);
        window.location.href = nextUrl();
      } catch (error) {
        showError(error && error.status === 401 ? 'Неверный email или пароль.' : 'Не удалось войти, попробуйте позже.');
      } finally {
        btn.disabled = false;
      }
    });

    document.getElementById('registerForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      hideError();
      const name = document.getElementById('regName').value.trim();
      const email = document.getElementById('regEmail').value.trim();
      const password = document.getElementById('regPassword').value;
      if (name.length < 1) {
        showError('Представьтесь: как к вам обращаться.');
        return;
      }
      if (!/.+@.+\..+/.test(email)) {
        showError('Похоже, в email опечатка.');
        return;
      }
      if (!Api.validPassword(password)) {
        showError('Пароль — минимум 8 символов, максимум 72 байта UTF-8. Слишком длинный пароль сократите.');
        return;
      }
      const btn = document.getElementById('regBtn');
      btn.disabled = true;
      try {
        await Api.register(email, password, name);
        window.location.href = nextUrl();
      } catch (error) {
        showError(error && error.status === 409
          ? 'Такой email уже зарегистрирован — войдите.'
          : 'Не удалось зарегистрироваться, попробуйте позже.');
      } finally {
        btn.disabled = false;
      }
    });

    document.getElementById('forgotLink').addEventListener('click', () => setMode('reset-request'));

    document.getElementById('resetRequestForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      hideError();
      const email = document.getElementById('resetEmail').value.trim();
      if (!/.+@.+\..+/.test(email)) {
        showError('Похоже, в email опечатка.');
        return;
      }
      const btn = document.getElementById('resetReqBtn');
      btn.disabled = true;
      try {
        await Api.requestPasswordReset(email);
        showOk('Готово: если такой аккаунт есть, письмо уже летит.');
      } catch (error) {
        showError('Не удалось отправить, попробуйте позже.');
      } finally {
        btn.disabled = false;
      }
    });

    document.getElementById('resetConfirmForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      hideError();
      const password = document.getElementById('resetNew').value;
      if (!Api.validPassword(password)) {
        showError('Пароль — минимум 8 символов, максимум 72 байта UTF-8. Слишком длинный пароль сократите.');
        return;
      }
      const btn = document.getElementById('resetConfirmBtn');
      btn.disabled = true;
      try {
        await Api.confirmPasswordReset(resetToken, password);
        window.location.href = 'login.html';
      } catch (error) {
        showError(error.status === 401 ? 'Ссылка устарела или уже использована — запросите новую.'
          : 'Не удалось изменить пароль. Проверьте пароль и повторите запрос.');
      } finally {
        btn.disabled = false;
      }
    });

    paintGoogle();
  });

  /* Вход через Google: есть ключи — едем в OAuth-флоу, нет — честная заглушка. */
  async function paintGoogle() {
    const host = document.getElementById('googleBox');
    if (!host || !window.Api) return;
    let status = null;
    try { status = await Api.oauthStatus(); } catch (e) { status = null; }
    if (status && status.googleEnabled) {
      host.innerHTML = `
        <div class="row" style="gap:8px;align-items:center;margin:8px 0">
          <span class="muted" style="font-size:12px">или</span>
        </div>
        <button class="btn btn-outline" type="button" id="googleBtn" style="width:100%">Продолжить через Google</button>`;
      document.getElementById('googleBtn').addEventListener('click', () => {
        window.location.href = '/api/auth/oauth2/google';
      });
    } else {
      host.innerHTML = `
        <p class="muted mt-16" style="font-size:12px">Вход через Google подключим после ключей — кнопка уже заложена здесь.</p>`;
    }
  }
})();
