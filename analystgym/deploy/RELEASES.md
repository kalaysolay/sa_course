# Выпуск релизов и настройка ключей на analystgym.pro

Региональные месячные цены лендинга: PRICING_MONTHLY_RUB=990,
PRICING_MONTHLY_KZT=5000, PRICING_MONTHLY_USD=11.29. На текущем VPS эти
значения при необходимости задаются в services.app.environment закрытого
/etc/analystgym-deploy/compose.json. База стран входит в образ и не требует
ключей или исходящих запросов при посещении сайта. Переопределение базы:
PRICING_COUNTRY_DATABASE (gzip MMDB, путь должен существовать в контейнере).
Для проверки после обновления открыть /api/pricing через публичный nginx:
страна должна соответствовать адресу посетителя, не адресу Docker. VPN
проверяет страну выходного узла. Не включать общий кеш этого ответа.
Локальный localhost получает USD по умолчанию. Это цены предзаписи;
эквайринг и история рублёвых заказов данным обновлением не меняются.

Для подготовленного релиза курсов/персонала используется `upgrade-release.py`:
root копирует и сверяет скрипт, передаёт архив и доверенные SHA-256/config digest.
Процедура сохраняет текущий compose.json и pg_dump в каталоге релиза, меняет
только образ app и проверяет HTTPS. В этом релизе схема БД не меняется,
начальные аккаунты создаются отдельной транзакцией --bootstrap-staff после
готовности приложения. Запуск first-release.py для обновления запрещён.

Начальные адреса: admin@analystgym.pro, reviewer@analystgym.pro,
methodist@analystgym.pro, llm-admin@analystgym.pro. У каждого отдельный
случайный пароль; root читает их в /etc/analystgym-deploy/staff-credentials.json.
Если email уже занят другой ролью, seed откажет без повышения прав. Для
существующего пользователя той же роли пароль сохраняется; если предложенный
пароль не совпал, в файле будет null, а не ложные данные для входа.

Это инструкция для реально установленного VPS. Git push пока не запускает
деплой. Репозиторий на VPS не клонировался: туда передаётся собранный Docker
образ. Сборка/одобрение образа и изменение секретов остаются у root или
доверенного CI. Пользователь deploy запускает только одобренную конфигурацию.

## Где находятся настройки

- `/etc/analystgym-deploy/compose.json` — действующая конфигурация, Image ID и
  переменные в `services.app.environment`. Файл root:root 0600, каталог 0700.
- `/etc/analystgym-deploy/settings.json` — привязка gateway к Compose-проекту.
- `/var/lib/analystgym-release/release.json` — запись первого запуска.
- `/var/backups/analystgym/initial-release.dump` — бэкап после первого старта.

Отдельного рабочего `.env` на этом стенде нет. Репозиторный `.env.example`
показывает названия переменных, но его изменение не обновляет VPS.

## Ввод ключей

Под root открыть:

```bash
nano /etc/analystgym-deploy/compose.json
```

Добавлять/менять только нужные поля существующего services.app.environment,
сохраняя пароль БД, JWT и прочие настройки. JSON требует двойных кавычек,
значений-строк и отсутствия завершающей запятой. Доллар в значении Compose
нужно записывать как `$$` вместо `$` для передачи буквального символа.

LLM:

```json
"REVIEW_ENGINE": "llm",
"REVIEW_LLM_PRIMARY": "deepseek",
"DEEPSEEK_API_KEY": "ВСТАВИТЬ_КЛЮЧ"
```

Для резервного GLM: `GLM_API_KEY` и `REVIEW_LLM_FALLBACK=glm`. Одного ключа
недостаточно: провайдер должен быть включён в админке, агенты и промпты —
активны. Начальная миграция включает DeepSeek и выключает GLM. Для управления
админкой сначала создаётся первый администратор по DEPLOY.md.

Google:

```json
"APP_GOOGLE_ENABLED": "true",
"AUTH_GOOGLE_CLIENT_ID": "ВСТАВИТЬ_CLIENT_ID",
"AUTH_GOOGLE_SECRET": "ВСТАВИТЬ_CLIENT_SECRET"
```

Callback реализован приложением по адресу:
`https://analystgym.pro/login/oauth2/code/google`.
Этот точный адрес должен быть разрешён в настройках OAuth-клиента Google.

Почта: `APP_MAIL_ENABLED=true`, `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`,
`MAIL_PASSWORD`, `APP_MAIL_FROM`. Публичная база ссылок уже задана как
`APP_SITE_BASE_URL=https://analystgym.pro`.

Перед изменениями сохранить копию конфигурации в каталоге root с правами
0700. Ключи не передавать в чат и не добавлять в репозиторий.

После сохранения проверить конфигурацию под root:

```bash
docker compose --env-file /dev/null \
  --project-directory /etc/analystgym-deploy \
  -p analystgym -f /etc/analystgym-deploy/compose.json config --quiet
```

Затем применить из PowerShell:

```powershell
ssh analystgym-vps 'sudo -n /usr/local/sbin/analystgym-deploy deploy'
```

`deploy` пересоздаст app при изменении конфигурации. `restart` только
перезапускает прежний контейнер и новые значения окружения не применяет.

## Выпуск нового образа

1. На машине сборки выбрать конкретный commit. Выполнить предусмотренные
   DEPLOY.md проверки, включая интеграционные, если меняется backend.
   Собрать образ с уникальным тегом `analystgym-app:release-COMMIT` из
   `analystgym/`, Dockerfile `backend/Dockerfile`; unit-тесты входят в сборку.
   Дополнительно проверить старт на тестовой БД и критические сценарии.
2. Экспортировать `docker save`, вычислить SHA-256, передать архив по scp
   в home deploy. Root копирует архив в защищённый каталог релиза, сверяет
   SHA-256 копии с доверенной сборкой и выполняет docker load. Не использовать
   контрольную сумму, полученную только из непроверенного загруженного файла.
3. До переключения под root сделать бэкап БД и compose.json. Минимальная
   команда для дампа использует тот же project name и Compose-файл:

```bash
umask 077
release_backup="/var/backups/analystgym/release-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -m 700 "$release_backup"
cp /etc/analystgym-deploy/compose.json "$release_backup/compose.json"
docker compose --env-file /dev/null \
  --project-directory /etc/analystgym-deploy \
  -p analystgym -f /etc/analystgym-deploy/compose.json \
  exec -T postgres pg_dump -U analystgym -d analystgym -Fc \
  > "$release_backup/database.dump"
```

Проверить успешный код pg_dump; ошибочный/пустой дамп не считать бэкапом.
Периодически проверять восстановление отдельно от рабочего volume.

4. После docker load узнать локальный ID:

```bash
docker image inspect analystgym-app:release-COMMIT --format '{{.Id}}'
```

Root меняет только `services.app.image` на полученный `sha256:...` в
compose.json, сохраняя окружение и другие настройки, и выполняет config
--quiet. Это и есть одобрение конкретного образа. Секреты не входят в образ.

5. Пользователь deploy выполняет команду deploy, затем status:

```powershell
ssh analystgym-vps 'sudo -n /usr/local/sbin/analystgym-deploy deploy'
ssh analystgym-vps 'sudo -n /usr/local/sbin/analystgym-deploy status'
```

6. Проверить `/actuator/health`, `/api/tasks`, страницы, вход и сценарии,
затронутые релизом. Flyway применяет миграции при старте. Gateway не делает
автоматический откат по HTTP-проверке. Обновление одного app может дать
краткий перерыв; zero-downtime механизм пока не настроен.

## Откат

Если изменения БД совместимы, root возвращает предыдущий Image ID, после
чего deploy снова выполняет deploy и проверку. Старый образ не удалять до
подтверждения релиза. Если миграция несовместима, откат контейнера недостаточен:
нужен заранее проверенный план для схемы и данных. Восстановление старого
дампа может потерять изменения, поступившие после бэкапа, и требует отдельного
решения владельца и окна работ.

В дальнейшем автоматизировать можно сборку/публикацию, проверенное одобрение
digest и проверки готовности. Не выдавать deploy произвольный Docker-доступ
ради автоматизации и не выполнять first-release.py повторно для обновления.
