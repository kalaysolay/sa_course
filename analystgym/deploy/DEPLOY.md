# Деплой AnalystGym: VPS, Docker Compose и Caddy

Актуализировано 2026-10-18 для миграций V1–V15 и текущего редактора решений.
Все команды ниже выполняются из каталога `analystgym/`, например
`/opt/sa_course/analystgym`. Они рассчитаны на Bash в Linux.

Приложение — один Spring Boot JAR с фронтендом внутри, PostgreSQL и Caddy.
Redis присутствует в compose, но текущие лимиты и очередь его не используют:
лимиты API находятся в памяти процесса, очередь ревью и уведомлений — в БД.
Эта конфигурация рассчитана на один экземпляр приложения.

## 1. Подготовка сервера и конфигурации

- VPS: ориентир 2 CPU / 4 GB RAM, Ubuntu 24.04, Docker Engine и Compose plugin.
- DNS: `analystgym.ru`, `practice.analystgym.ru`, `course.analystgym.ru` указывают
  на сервер. Для своего домена заменить `APP_DOMAIN` и `APP_SITE_BASE_URL`.
- Входящие 80/443 доступны для Caddy и выдачи HTTPS-сертификатов.
- Compose также публикует 8080 на всех интерфейсах. Закрыть его снаружи
  сетевым экраном VPS, включая Docker-трафик; проверить с другого хоста.
  PostgreSQL и Redis наружу не опубликованы.

```bash
cp deploy/.env.example deploy/.env
chmod 600 deploy/.env
nano deploy/.env
```

Обязательно заменить `POSTGRES_PASSWORD` и `APP_JWT_SECRET` собственными
значениями; `openssl rand -hex 32` подходит для генерации. Задать внешний
`APP_SITE_BASE_URL=https://<домен>` для ссылок в письмах и `APP_DOMAIN=<домен>`
для Caddy. Файл `.env` не коммитить и не прикладывать к диагностике.

Числовые настройки оставлять заполненными. Пустыми могут быть необязательные
ключи Google, SMTP и моделей, пока соответствующий канал выключен.
Параметры перечислены в `.env.example` и `backend/app/src/main/resources/application.yml`.
Файлы `.env*` исключены из Docker build context через `analystgym/.dockerignore`.

Во всех командах указан `--env-file`: `env_file` сервиса передаёт переменные
контейнеру, а этот флаг задаёт значения для `${...}` в самом compose-файле.
Перед запуском проверить конфигурацию без печати секретов:

```bash
docker compose --env-file deploy/.env -f deploy/docker-compose.yml config --quiet
```

Если существующий стенд запускался с `-p` или `COMPOSE_PROJECT_NAME`, сохранить
его имя во всех командах, включая бэкапы. Иначе Compose создаст другие volumes
и приложение увидит новую пустую БД. Пароль PostgreSQL из env применяется при
первой инициализации volume; редактирование `.env` не меняет пароль существующей БД.

## 2. Проверки и сборка

Перед выпуском из `backend/`, с JDK 21 и доступным Docker для Testcontainers:

```bash
sh ./gradlew build :app:integrationTest
cd ../tasks-mockup
node --test tests/session.test.cjs tests/evaluation.test.cjs
cd ..
```

При необходимости задать `DOCKER_HOST` из рабочего Docker context.
Wrapper вызывается через sh, поскольку в репозитории у gradlew нет executable-бита.
Интеграционная задача использует Docker API 1.44 по умолчанию.
Браузерные сценарии находятся в `tasks-mockup/tests/`: общий smoke,
отправка/восстановление ревью и `solution-editor-smoke.html` для добавления
документов, шести шаблонов и полного тела отправки.

Сборка образа из `analystgym/`:

```bash
docker compose --env-file deploy/.env -f deploy/docker-compose.yml build app
```

Dockerfile копирует `backend/` и соседний `tasks-mockup/`, запускает Gradle build
с unit-тестами и упаковывает один исполняемый Boot JAR. Только plain JAR точки
входа исключён из этой сборки; JAR модулей и тесты включены. Интеграционные
проверки выполняются отдельно: Docker daemon внутрь build-стадии не передаётся.

`syncMockup` включает HTML, CSS, JS и локальные библиотеки рендера схем.
Демонстрационные эталоны `data-tasks-*.js`, банк с ответами `questions.js`,
тесты и служебные скрипты в серверную статику не попадают.
Клиент и API обновляются вместе; отдельной frontend-сборки нет.

Имя `ghcr.io/kalaysolay/sa_course-app:latest` в compose — тег локальной сборки.
Текущий GitHub Actions workflow запускается вручную и не публикует образ.
Нельзя рассчитывать на автоматический выпуск в GHCR после push.

## 3. Первый запуск

После успешной сборки:

```bash
docker compose --env-file deploy/.env -f deploy/docker-compose.yml up -d --no-build --pull missing
docker compose --env-file deploy/.env -f deploy/docker-compose.yml ps
docker compose --env-file deploy/.env -f deploy/docker-compose.yml logs --tail=100 app caddy
curl --fail --silent --show-error https://analystgym.ru/api/health
curl --fail --silent --show-error https://analystgym.ru/actuator/health
```

Использовать свой домен, если он изменён. Flyway применяет миграции при старте,
Hibernate проверяет схему. В логах должны появиться успешные миграции и
`Started AnalystGymApplication`.

`/api/health` возвращает `status`, `product`, `version`: это проверка живого HTTP,
а не доказательство доступности БД, SMTP или LLM. `/actuator/health` дополнительно
показывает агрегированное состояние инфраструктуры, включая datasource и SMTP
при APP_MAIL_ENABLED=true. Выключенная почта не влияет на этот статус;
очереди и качество ревью проверяются отдельно.

Создать первого администратора после миграций, не передавая пароль аргументом:

```bash
read -r -p 'Email первого администратора: ' APP_BOOTSTRAP_ADMIN_EMAIL
read -r -s -p 'Пароль (8–72 байта UTF-8): ' APP_BOOTSTRAP_ADMIN_PASSWORD
printf '\n'
export APP_BOOTSTRAP_ADMIN_EMAIL APP_BOOTSTRAP_ADMIN_PASSWORD
docker compose --env-file deploy/.env -f deploy/docker-compose.yml exec -e APP_BOOTSTRAP_ADMIN_EMAIL -e APP_BOOTSTRAP_ADMIN_PASSWORD app java -jar /app/app.jar --bootstrap-admin
unset APP_BOOTSTRAP_ADMIN_PASSWORD APP_BOOTSTRAP_ADMIN_EMAIL
```

Команда использует APP_DB_* контейнера, не запускает HTTP/воркеры, отказывается
повышать существующий аккаунт или создавать второго SUPERADMIN. Войти на
`/login.html`, открыть `/admin.html`. Остальные роли назначаются в админке;
API `PUT /api/admin/users/{id}/role` принимает `role` и `expectedRole`.
`APP_ADMIN_EMAILS` не действует.

Compose принудительно включает Secure-куки. Для работы пользователей нужен
HTTPS; открытый по HTTP порт 8080 не является локальным вариантом авторизации.
Для локального HTTP использовать `bootRun` с собственной тестовой БД и
`APP_COOKIES_SECURE=false`. Между поддоменами не проверять сценарий как одну
сессию: cookies привязаны к хосту; пройти вход на используемом хосте.

## 4. Настройки рабочих контуров

### Ревью и проверяющие агенты

`REVIEW_ENGINE=mock` — явно обозначенная демонстрация, балл не выше 45/100.
Для реального ревью задать `REVIEW_ENGINE=llm` и ключи моделей из `.env.example`.
В админке LLM_ADMIN/SUPERADMIN проверить провайдеров, агентов и активные
промпты. Стартовый DeepSeek включён, GLM и `mock-llm` выключены. Одной записи
`GLM_API_KEY` недостаточно: резервный провайдер должен быть включён в БД.
`REVIEW_LLM_PRIMARY`/`REVIEW_LLM_FALLBACK` — ID провайдеров из админки.

При отказе внешних моделей автоматического перехода на локальный mock нет.
Очередь использует зафиксированные маршруты, делает ограниченные повторы,
затем попытка получает `failed`. Смена REVIEW_ENGINE влияет на новые планы,
но не переписывает уже принятые задания. Провайдер `mock://` в LLM-стенде
также даёт демонстрационную оценку (`llm-demo/v2`).

Оба агента получают все документы и исходники схем. PlantUML основной в UI,
Mermaid дополнительный; сервер поддерживает оба. Общие инструкции и весь
контекст сохраняются в плане попытки. Новые инструкции действуют на новые
планы, включая назначенное повторное ревью. Качество настоящей LLM пока
не откалибровано методистом: `../tasks-mockup/docs/review-calibration.md`.

| Переменная | Значение по умолчанию | Назначение |
|---|---|---|
| REVIEW_QUEUE_ENABLED | true | Обработчик очереди; false оставляет принятые задания ждать |
| REVIEW_WORKERS | 2 | Параллельные задания на экземпляр, 1–32 |
| REVIEW_LEASE_SECONDS / REVIEW_HEARTBEAT_MS | 30 / 1000 | Захват и продление; heartbeat должен быть существенно короче lease |
| REVIEW_POLL_MS | 500 | Интервал поиска заданий |
| REVIEW_MAX_TRIES / REVIEW_RETRY_SECONDS | 3 / 2 | Число захватов и начальная пауза повтора |
| REVIEW_MAX_SOLUTION_CHARS | 20000 | Сумма исходного содержимого всех вкладок |
| REVIEW_MAX_INPUT_BYTES | 64000 | UTF-8 байты system+user на вызов |
| REVIEW_MAX_OUTPUT_TOKENS | 2000 | Максимальный ответ на вызов |
| REVIEW_TOKEN_BUDGET / REVIEW_MAX_CALLS | 160000 / 6 | Бюджет и число всех обращений с повторами |

Резерв токенов — техническая оценка, не денежный лимит. Прерванный внешний
запрос может оказаться платным и повториться после восстановления lease.

### Диагностика и жалобы

| Переменная | По умолчанию | Назначение |
|---|---|---|
| ASSESSMENT_GUEST_DAYS | 7 | Срок гостевого доступа, допустимо 1–30 дней |
| QUALITY_RECHECK_ENABLED | true | Финализация повторной проверки жалобы |
| QUALITY_RECHECK_POLL_MS | 2000 | Интервал финализации |

Гостевой токен передаётся в заголовке, не в URL. После входа прохождение
привязывается явно. Старый POST `/api/assessment/submissions` возвращает 410:
нужен актуальный клиент с `/runs`, сохранением прогресса и серверным финишем.
Повторное ревью требует включённой очереди и финализатора жалоб.
Отключение финализатора оставляет жалобу ждать даже при готовой повторной попытке.

### SMTP и уведомления

Задать `APP_MAIL_ENABLED=true`, `APP_MAIL_FROM`, `APP_SITE_BASE_URL`,
`MAIL_HOST`, `MAIL_PORT` (по умолчанию 587), `MAIL_USERNAME`, `MAIL_PASSWORD`.
Используется SMTP AUTH и STARTTLS, таймауты подключения/чтения/записи — по 10 с.
Пароль SMTP хранить только в `.env`.

- Сброс пароля отправляется напрямую; токен живёт час и одноразовый.
  При ошибке SMTP запрос не падает, но автоматического повтора письма нет:
  после исправления SMTP пользователь запрашивает новую ссылку.
- Готовность ревью и решения по жалобам создают уведомление в кабинете и
  запись `user_notifications` в одной транзакции с бизнес-событием.
  Доставка письма выполняется отдельно с повторами.
- При APP_MAIL_ENABLED=false outbox остаётся ждать, уведомления в кабинете
  уже доступны. Это не отметка успешной доставки. В dev-режиме сброс пароля
  пишет токен в лог; для публичного запуска настроить настоящий SMTP.

| Переменная | По умолчанию | Назначение |
|---|---|---|
| NOTIFICATION_MAX_TRIES | 5 | Максимум попыток доставки |
| NOTIFICATION_RETRY_SECONDS | 30 | Начальная пауза; затем 60/120/240… с |
| NOTIFICATION_LEASE_SECONDS | 120 | Захват отправки, минимум 30 с |
| NOTIFICATION_POLL_MS | 1000 | Интервал отправки |

Статусы: pending → sending → sent либо failed после исчерпания повторов.
После исправления SMTP pending продолжит обрабатываться; для failed отдельного
автоматического сброса счётчика нет. Неопределённый исход SMTP может дать
повтор письма. Включение почты начнёт отправлять и накопившуюся очередь.
Ссылки в уже созданных письмах не пересобираются при смене базового URL.

### Google-вход

В Google Cloud создать OAuth client типа Web application, указать redirect URI
`https://<используемый хост>/login/oauth2/code/google`. Для нескольких хостов
добавить каждый URI. Задать `APP_GOOGLE_ENABLED=true`, `AUTH_GOOGLE_CLIENT_ID`,
`AUTH_GOOGLE_SECRET` и пересоздать app. Проверить реальный вход и возврат
в кабинет; без конфигурации ожидается отказ, не работающий Google-вход.

### Оплата

Подключение платёжного провайдера пока вынесено за рамки запуска.
Оставить `BILLING_FAKE_ENABLED=false`, ключи ЮKassa пустыми. Это отключает
тестовое подтверждение fake-платежей, но не означает готовность приёма денег.
Текущий `BILLING_WEBHOOK_SECRET` относится к внутреннему контракту приложения;
его нельзя считать готовой настройкой нативных webhook-уведомлений ЮKassa.

После изменения env пересоздать контейнер: `restart` не перечитывает окружение.

```bash
docker compose --env-file deploy/.env -f deploy/docker-compose.yml up -d --no-build --pull never --no-deps --force-recreate app
```

При смене APP_DOMAIN отдельно пересоздать Caddy с тем же env-файлом
(`up -d --no-build --pull never --no-deps --force-recreate caddy`).
Флаг --no-deps сохраняет работающие PostgreSQL/Redis при обновлении app.

## 5. Обновление существующего стенда

До первого применения V14 остановить старые воркеры: незавершённые попытки
без сохранённого плана станут failed (`legacy_review_requires_resubmit`).
После перехода через V11 пользователям нужен повторный вход. V15 добавляет
прохождения диагностики, ревизии ревью, историю жалоб и outbox; готовые
результаты сохраняются. Исторический контекст старых попыток может отсутствовать.

Не редактировать применённые миграции и не запускать Flyway repair вслепую.
Обновление проводить с коротким окном обслуживания: после остановки app Caddy
временно будет отвечать ошибкой прокси. Сборку выполнить до остановки.

```bash
DEPLOY_STAMP=$(date +%Y%m%d-%H%M%S)
PREVIOUS_APP_IMAGE=$(docker compose --env-file deploy/.env -f deploy/docker-compose.yml images -q app)
docker image tag "$PREVIOUS_APP_IMAGE" "analystgym-app:rollback-$DEPLOY_STAMP"
git pull --ff-only
docker compose --env-file deploy/.env -f deploy/docker-compose.yml config --quiet
docker compose --env-file deploy/.env -f deploy/docker-compose.yml build app
docker compose --env-file deploy/.env -f deploy/docker-compose.yml stop app
umask 077
mkdir -p backups
BACKUP_FILE="backups/pre-update-$DEPLOY_STAMP.dump"
docker compose --env-file deploy/.env -f deploy/docker-compose.yml exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d analystgym -Fc' > "$BACKUP_FILE"
docker compose --env-file deploy/.env -f deploy/docker-compose.yml exec -T postgres pg_restore --list < "$BACKUP_FILE" > /dev/null
docker compose --env-file deploy/.env -f deploy/docker-compose.yml up -d --no-build --pull never --no-deps app
docker compose --env-file deploy/.env -f deploy/docker-compose.yml logs --tail=100 app
```

Команды выполнять последовательно и не продолжать при ошибке сборки/дампа.
`pg_restore --list` проверяет читаемость архива, а не полноценное восстановление.
Не применять `down -v`: это удалит данные volumes.

Если схема совместима со старой версией, откатить именно сохранённый образ:

```bash
docker compose --env-file deploy/.env -f deploy/docker-compose.yml stop app
docker image tag "analystgym-app:rollback-$DEPLOY_STAMP" ghcr.io/kalaysolay/sa_course-app:latest
docker compose --env-file deploy/.env -f deploy/docker-compose.yml up -d --no-build --pull never --no-deps app
```

Это не откат БД. Для несовместимой схемы нужен отдельный план восстановления
из дампа с остановленным приложением и учётом потери записей после бэкапа.
Проверить восстановление в отдельную БД до операций с рабочей.

## 6. Бэкапы и проверка восстановления

`deploy/backup.sh` создаёт custom-format pg_dump и удаляет файлы старше 7 дней.
Путь по умолчанию `/var/backups/analystgym`; параметры BACKUP_DIR и
BACKUP_KEEP_DAYS можно задать в окружении. Скрипт выполняет `. deploy/.env`
как shell-конфигурацию: значения с shell-символами должны быть корректно заключены
в кавычки. У пользователя cron должны быть доступ к Docker и права на каталог.

```cron
0 3 * * * umask 077; /bin/sh /opt/sa_course/analystgym/deploy/backup.sh >> /var/log/analystgym-backup.log 2>&1
```

Скрипт использует одно имя файла на день: повторный запуск перезаписывает
сегодняшний дамп. Для бэкапа перед релизом использовать отдельное имя из раздела 5.
Проверять успешность cron, размер/читаемость архивов и хранить копию вне VPS.
Volumes PostgreSQL и Caddy нельзя считать резервной копией.

Пример проверки восстановления в **новую** БД того же PostgreSQL
(BACKUP_FILE указывает на выбранный custom-format дамп):

```bash
RESTORE_DB="analystgym_restore_$(date +%Y%m%d_%H%M%S)"
docker compose --env-file deploy/.env -f deploy/docker-compose.yml exec -T postgres sh -c 'createdb -U "$POSTGRES_USER" "$1"' sh "$RESTORE_DB"
docker compose --env-file deploy/.env -f deploy/docker-compose.yml exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" --dbname="$1" --exit-on-error --no-owner --no-privileges' sh "$RESTORE_DB" < "$BACKUP_FILE"
docker compose --env-file deploy/.env -f deploy/docker-compose.yml exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$1" -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM users; SELECT count(*) FROM review_revisions; SELECT version, success FROM flyway_schema_history ORDER BY installed_rank DESC LIMIT 3;"' sh "$RESTORE_DB"
```

В дампах до V15 таблицы `review_revisions` ещё нет: выбирать запросы под их
версию схемы. Для полной проверки запустить отдельное приложение на копии БД
и пройти вход/чтение результата; подключения к рабочей БД быть не должно.
В compose APP_DB_URL задан явно в `environment`, поэтому переключение БД
требует отдельной конфигурации, одного значения в `.env` недостаточно.
После проверки удалить только созданную тестовую БД. Повторять drill перед
первым запуском и затем хотя бы раз в месяц.

## 7. Проверка после выпуска и диагностика

Проверить на основном HTTPS-хосте:

1. Главную, каталог, вход/выход и защищённую админку; сессия переживает обновление.
2. Гостевую диагностику: ответ → перезагрузка → серверный финиш → явная привязка
   после входа → открытие из истории аккаунта.
3. Документ и схему: PlantUML по умолчанию, Mermaid через дополнительные настройки;
   предпросмотр, сохранение, мобильные вкладки без ухода вправо. На ревью уходят
   все части, а не только активная вкладка.
4. Очередь ревью до результата; для реального LLM использовать контрольный
   аккаунт и учитывать расход провайдера. Демо не принимать за проверку LLM.
5. Жалобу: исправление/повтор → новая версия → сохранённое исходное ревью →
   уведомление в кабинете. SMTP проверить письмом на свой контрольный адрес.
6. Файлы `/assets/js/questions.js` и `/assets/js/data-tasks-1.js` отвечают 404,
   эталон задачи недоступен гостю. Если есть внешний CDN, обновить кэш HTML
   вместе со сборкой; свежие CSS/JS имеют версии в ссылках.

| Симптом | Проверить |
|---|---|
| API жив, но главная 404 | Собрана ли статика; build context — analystgym/, фронт включён в Dockerfile |
| Не стартует app | Логи app/postgres, Flyway checksum, APP_DB_*, сохранён ли прежний volume |
| Пропали данные после запуска | Имя Compose-проекта и подключённый volume; не инициализировать новый вместо старого |
| Не сохраняется вход | HTTPS, Secure-куки, один используемый хост, время сервера; 401/403 в запросах |
| Попытка долго ждёт | REVIEW_QUEUE_ENABLED, worker/lease, review_jobs и журнал обращений в админке |
| LLM не работает | Активные агенты/промпты, включённые провайдеры в БД, имена env ключей, лимиты и журнал |
| Жалоба ждёт готового повтора | QUALITY_RECHECK_ENABLED и outcome жалобы; recheck_failed/conflict требуют сотрудника |
| Письмо о ревью не пришло | APP_MAIL_ENABLED, MAIL_*, APP_MAIL_FROM, статусы user_notifications; MAIL-лог сам по себе не подтверждает outbox-доставку |
| Ссылка сброса не пришла | SMTP-лог; после исправления запросить новую ссылку, этот канал без outbox-повтора |
| Старый UI или 410 диагностики | Обновлены ли HTML и API одной версии, кэш клиента/CDN |
| 429 | RATELIMIT_*; лимиты в памяти одного процесса, после рестарта сбрасываются |

Для очереди писем достаточно агрегатов без адресов и текста:

```bash
docker compose --env-file deploy/.env -f deploy/docker-compose.yml exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d analystgym -c "SELECT status, count(*) FROM user_notifications GROUP BY status; SELECT status, count(*) FROM review_jobs GROUP BY status;"'
```

Не выгружать в общие логи окружение контейнера, тексты решений, письма или
токены. Публичный платёжный запуск, course paywall, возвраты, автопродление,
распределённые API-лимиты и подтверждение качества LLM требуют отдельных работ.
