# Вспомогательные инструменты AnalystGym

## Экономика (`economics/`)

- `analystgym-economics-build.py` пересобирает DOCX и Markdown в `analystgym/docs/`. Перезаписывает документы: ручные изменения сначала перенесите в генератор.
- `analystgym-economics-export.ps1` экспортирует DOCX в PDF через установленный Microsoft Word на Windows.
- `analystgym-economics-render.py` создаёт картинки страниц из PDF через Documents skill. Путь к skill можно задать переменной `DOCUMENTS_SKILL_DIR`.
- `analystgym-economics-verify.py` проверяет документы и наличие десяти отрисованных страниц.

Порядок: build → export → render → verify. Python требует `python-docx`, `lxml`, `Pillow` и зависимости рендера Documents skill. Промежуточные файлы создаются в `economics/.qa/` и игнорируются Git. Модель и проверки относятся к редакции документа от 26 октября 2026 года.

## Релиз (`release/`)

- `seo-local-smoke.cjs` — проверка поисковых страниц на собранном JAR и временной PostgreSQL. После Gradle build: `node analystgym/tools/release/seo-local-smoke.cjs --screenshots`. Нужны Java 21, Docker и (для скриншотов) Edge; путь можно задать через `EDGE_BINARY`. Вывод остаётся в игнорируемом `backend/app/build/seo-smoke/`, контейнер удаляется после проверки.

- `analystgym-production-release-check.cjs` проверяет публичный сайт, выполняет только чтение. Запуск: `node analystgym-production-release-check.cjs`.
- `analystgym-regional-release-smoke.cjs` проверяет образ `analystgym-app:release-7e37bf2` в локальном Docker на временной БД; создаёт и удаляет собственные контейнеры и сеть. Требует Docker и свободный порт 18082.

Проверки привязаны к релизу 7e37bf2 и каталогу из 16 задач. Перед проверкой следующих релизов актуализируйте ожидаемые значения и тег образа.

Архивы Docker-образов и скриншоты проверок в проекте не храним: они воспроизводимы из исходников.
