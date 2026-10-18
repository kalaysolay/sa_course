# Lean-ревью лекции: REQ-MANAGEMENT

Задача: Прочитать лекцию один раз и вынести два вердикта: content/coverage и learning/editorial.
Ожидаемые результаты:
- `03-lecture/review-v1/content.json`
- `03-lecture/review-v1/learning.json`
- `03-lecture/final.md`

## Жёсткие ограничения

- Пиши только внутри каталога этого run.
- Учебный контент для студента — на русском.
- Сквозной кейс примеров и практики — проект Compliance.
- Не пропускай молча отсутствующие prerequisites или source gaps; фиксируй явно.
- Не открывай `docs/course-publisher-spec-v0.3.md`, пока объявленных входов хватает.

## Контекст темы

- Модуль: M03 — Требования к ПО
- Раздел: M03-S05 — Управление
- Тема: 18. Управление требованиями (REQ-MANAGEMENT)

## Сначала прочитай

- `01-brief/lesson-brief-final.json`
- `02-research/source-pack.md`
- `03-lecture/draft-v1.md`
- `00-input/course-style.md`

## Правила lean

- Для одобренной перспективы держи её JSON короче 600 символов.
- Rewrite запускают только critical и major. Minor фиксируй без переписывания.
- Если нужна доработка — сохрани draft, сделай точечную следующую версию и перезапусти только упавшую перспективу.
- Не больше одного полного rewrite. Одобренный текст скопируй в 03-lecture/final.md.
