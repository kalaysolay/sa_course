# Sources: REQ-SPECIFICATION

Карта утверждений для лекции 17. Пересказов нет.

## Claims → sources

1. **У Compliance уже есть ранний скелет ТЗ: назначение, пользователи, область MVP, ссылка на реестр и открытые вопросы; документ явно не финальный.** Разделы про процессы, сценарии, данные, API и NFR помечены как будущие.  
   → `project/compliance/specification/technical-assignment.md`

2. **Реестр требований — отдельный артефакт со статусами `candidate` / `confirmed` / `open` / `deferred` и критерием проверки; на этапе курса записи в основном `candidate`.** Спецификация ссылается на реестр, а не подменяет его.  
   → `project/compliance/requirements/requirements-register.md`

3. **Открытые вопросы (статусы MVP, владелец продления сроков, аудит, дашборд, источники данных о сотрудниках) нельзя закрывать в тексте ТЗ без подтверждения.**  
   → `project/compliance/requirements/open-questions.md`  
   → `project/compliance/specification/technical-assignment.md` (§5)

4. **Спецификация в логике курса — связный документ для читателей (бизнес, разработка, проверка), собранный из подтверждённых формулировок и ссылок на модели; неподтверждённое остаётся вопросом.**  
   → опора на каркас проекта выше; авторских материалов нет (см. Availability). Учебное определение курса, не цитата стандарта.

5. **Согласование документа: молчание и фраза «в целом ок, детали потом» не равны утверждению раздела.** Рабочие ходы аналитика — короткий черновик на правку, фиксация блокера, эскалация через спонсора без эмоций.  
   → методическое требование brief / reality-friction; внешнего источника в slice нет.

## Availability

- Passport: `primary: []`, `secondary: [SRC-AUTHOR-MATERIALS]`, `allow_external_research: false`.
- `SRC-AUTHOR-MATERIALS` в slice помечен available, каталог `references/author-materials` отсутствует. Текстом источника лекция пользоваться не может.
- `SRC-WIEGERS-REQUIREMENTS` в общем реестре `missing`, в slice темы не передан — не использовать как evidence.
- Публичные страницы BABOK/IEEE/Wiegers в этот pack не включаем: внешний research запрещён.
- GAP (minor): нет primary и нет читаемого secondary; claims 1–3 опираются на артефакты Compliance, claims 4–5 — на курс/brief с явной оговоркой.
