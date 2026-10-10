# Деплой AnalystGym (вариант A: VPS + Docker Compose + Caddy)

Всё приложение — этот каталог: `backend/` (код), `tasks-mockup/` (фронт,
в образе как статика), `deploy/` (этот каталог: compose, Caddy, бэкапы).
Прод собирается из `main`, тесты гоняются до упаковки в образ.

## 0. Что нужно

- VPS: 2 CPU / 4 GB RAM, Ubuntu 24.04, Docker + compose plugin.
- DNS: A-записи `analystgym.ru`, `practice.analystgym.ru`,
  `course.analystgym.ru` на IP сервера (или свой домен — тогда он же
  в `APP_DOMAIN` и `APP_SITE_BASE_URL`).
- Порты 80/443 наружу (Caddy сам выпустит HTTPS-сертификаты).

## 1. Конфиг: `deploy/.env`

```bash
cd analystgym
cp deploy/.env.example deploy/.env
nano deploy/.env
```

Заполнить обязательно: `POSTGRES_PASSWORD`, `APP_JWT_SECRET`
(`openssl rand -hex 32`, минимум 32 символа), `APP_ADMIN_EMAILS`
(свой email — первый вход даст SUPERADMIN), `APP_DOMAIN`,
`APP_SITE_BASE_URL`, `APP_COOKIES_SECURE=true`.
`.env` в git не коммитится. Остальные группы — ниже, по мере подключения.

## 2. Первый запуск

```bash
docker compose -f deploy/docker-compose.yml up --build -d
docker compose -f deploy/docker-compose.yml logs -f app  # до "Started AnalystGymApplication"
curl https://analystgym.ru/api/health                     # {"status":"UP"}
```

Дальше: зарегистрироваться на сайте с email из `APP_ADMIN_EMAILS` —
станете SUPERADMIN, роли остальным — через `PUT /api/admin/users/{id}/role`.

## 3. Подключения (каждое — независимо, всё через env)

### Google-вход
1. Google Cloud Console → APIs & Services → Credentials → Create OAuth client
   (тип Web application).
2. Authorized redirect URI: `https://<домен>/login/oauth2/code/google`.
3. В `.env`: `APP_GOOGLE_ENABLED=true`, `AUTH_GOOGLE_CLIENT_ID`,
   `AUTH_GOOGLE_SECRET`. Перезапустить app.
4. Проверка: кнопка «Продолжить через Google» на `login.html`;
   без ключей бэк отдаёт 409 и кнопка показывает заглушку.

### Почта (сброс пароля)
Без флага письма идут в лог (`MAIL password-reset ...`) — для локалки хватает.
Прод:

```ini
APP_MAIL_ENABLED=true
MAIL_HOST=smtp.yandex.ru
MAIL_PORT=587
MAIL_USERNAME=robot@analystgym.ru
MAIL_PASSWORD=<пароль приложения, не основной!>
APP_MAIL_FROM=robot@analystgym.ru
```

Проверка: «Забыли пароль?» на `login.html` → письмо со ссылкой вида
`/login.html?mode=reset&token=...` (живёт 1 час, одноразовая).
Падение SMTP не роняет сценарии — ошибка только в логах.

### Ревью через LLM
```ini
REVIEW_ENGINE=llm
DEEPSEEK_API_KEY=...
GLM_API_KEY=...
```
Имена env-переменных ключей лежат в таблице провайдеров (сид `V9__llm.sql`;
меняются через админку персоналом с ролью LLM_ADMIN). Без ключей или при
падении обеих моделей — `REVIEW_ENGINE=mock` (детерминированный разбор).

### ЮKassa
1. Кабинет ЮKassa → shopId + секретный ключ → `YOOKASSA_SHOP_ID`,
   `YOOKASSA_SECRET_KEY`. Без обоих ключей работает fake-провайдер
   (для прода `BILLING_FAKE_ENABLED=false`).
2. Webhook в кабинете кассы: `POST https://<домен>/api/billing/webhooks/yookassa`,
   тот же секрет — в `BILLING_WEBHOOK_SECRET` (проверка подписи
   `X-Webhook-Signature`, повторные вызовы идемпотентны).

## 4. Обновление прода

```bash
git pull
docker compose -f deploy/docker-compose.yml up --build -d
```

Миграции применяет Flyway при старте (строгая валидация: расхождение —
падение сразу, а не тихая езда). Откат: предыдущий образ
(`ghcr.io/...-app:<тег>`), бэкап БД — ниже.

## 5. Бэкапы

Ночной `pg_dump` + ротация 7 дней — `deploy/backup.sh`:

```bash
0 3 * * * /opt/analystgym/deploy/backup.sh
```

Раз в месяц — drill restore на тестовую базу (команды в шапке скрипта).
Перед первым прод-запуском проверить restore руками один раз.

## 6. Диагностика

| Симптом | Куда смотреть |
|---|---|
| `{"status":"UP"}` нет | `docker compose logs app`, `pgdata` жив ли postgres |
| Вход «крутится», куки нет | `APP_COOKIES_SECURE=true` только за https; локально по http — `false` |
| Google: 409 | нет ключей или `APP_GOOGLE_ENABLED=false` |
| Письма не приходят | `APP_MAIL_ENABLED`, `APP_MAIL_FROM`, лог `MAIL failed` |
| Оплата не проходит | ключи кассы, подпись вебхука, `BILLING_FAKE_ENABLED=false` в проде |
| Подозрительный трафик | лимиты `RATELIMIT_*`, логи Caddy |

## 7. Что осознанно не входит

Курсы и их paywall (фаза 5), возвраты денег, автопродление подписок,
SMTP-рассылки кроме транзакционных, Redis-лимиты при втором инстансе.
