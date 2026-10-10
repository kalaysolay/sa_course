/* ============================================================
   security.js — страница безопасности (черновик макета).
   Смена пароля и привязка Google-входа. Гостя уводим на вход.
   ============================================================ */

(function () {
  document.addEventListener('DOMContentLoaded', async () => {
    AppUI.mountHeader('account');
    AppUI.mountFooter();

    if (window.Api) {
      try { await Api.ready; } catch (e) { /* без сервера формы мёртвые */ }
    }
    if (!window.Api || !Api.user) {
      window.location.href = 'login.html?next=security.html';
      return;
    }

    paintPassword();
    paintGoogle();
  });

  function paintPassword() {
    document.getElementById('pwBody').innerHTML = `
      <div class="field"><label for="pwCurrent">Текущий пароль</label>
        <input id="pwCurrent" type="password" autocomplete="current-password">
      </div>
      <div class="field"><label for="pwNew">Новый пароль (минимум 8 символов)</label>
        <input id="pwNew" type="password" autocomplete="new-password">
      </div>
      <div class="field"><label for="pwNew2">Новый пароль ещё раз</label>
        <input id="pwNew2" type="password" autocomplete="new-password">
      </div>
      <button class="btn btn-primary btn-sm mt-16" type="button" id="pwBtn">Сменить пароль</button>
      <p class="muted mt-16" style="font-size:12px">После смены другие сессии завершатся автоматически.</p>`;

    document.getElementById('pwBtn').addEventListener('click', async () => {
      const current = document.getElementById('pwCurrent').value;
      const next = document.getElementById('pwNew').value;
      const next2 = document.getElementById('pwNew2').value;
      if (!current || next.length < 8) {
        AppUI.toast('Новый пароль — минимум 8 символов', 'warn');
        return;
      }
      if (next !== next2) {
        AppUI.toast('Пароли не совпадают', 'warn');
        return;
      }
      try {
        await Api.changePassword(current, next);
        AppUI.toast('Пароль сменён, другие сессии завершены', 'ok');
        document.getElementById('pwCurrent').value = '';
        document.getElementById('pwNew').value = '';
        document.getElementById('pwNew2').value = '';
      } catch (error) {
        const code = error && error.status;
        AppUI.toast(code === 401 ? 'Текущий пароль неверный' : 'Не удалось сменить пароль', 'bad');
      }
    });
  }

  async function paintGoogle() {
    const host = document.getElementById('googleBody');
    let status = null;
    try { status = await Api.oauthStatus(); } catch (e) { status = null; }
    if (status && status.googleEnabled) {
      host.innerHTML = `
        <p class="muted" style="font-size:13px;margin-bottom:12px">Привязка идёт по подтверждённой почте Google к этому же аккаунту.</p>
        <button class="btn btn-outline btn-sm" type="button" id="googleBtn">Привязать Google-вход</button>`;
      document.getElementById('googleBtn').addEventListener('click', () => {
        window.location.href = '/api/auth/oauth2/google';
      });
    } else {
      host.innerHTML = `
        <p class="muted" style="font-size:13px">Вход через Google появится после подключения ключей — кнопка уже заложена здесь.</p>`;
    }
  }
})();
