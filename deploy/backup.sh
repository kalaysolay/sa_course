#!/bin/sh
# Ночной бэкап Postgres (вариант A): pg_dump в custom-формате + ротация 7 дней.
# Запуск на VPS из cron: 0 3 * * * /opt/analystgym/deploy/backup.sh
# Проверка restore — drill ниже (раз в месяц руками).
set -eu
cd "$(dirname "$0")"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/analystgym}"
KEEP="${BACKUP_KEEP_DAYS:-7}"
DATE="$(date +%F)"
mkdir -p "$BACKUP_DIR"
FILE="$BACKUP_DIR/analystgym-$DATE.dump"
# Пароль берём из .env рядом (в репо его нет, см. .env.example).
set -a
. ./../deploy/.env 2>/dev/null || . ./.env
set +a
docker compose -f docker-compose.yml exec -T postgres \
  pg_dump -U "$POSTGRES_USER" -d analystgym -Fc > "$FILE"
find "$BACKUP_DIR" -name 'analystgym-*.dump' -mtime +"$KEEP" -delete
echo "backup written: $FILE ($(du -h "$FILE" | cut -f1))"
