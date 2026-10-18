# Sources: REQ-MANAGEMENT

Карта утверждений для лекции 18. Пересказов нет.

## Claims → sources

1. **У Compliance уже есть каркас ТЗ (не финальный) и реестр со статусами `candidate` / `confirmed` / `open` / `deferred`; спецификация ссылается на реестр и открытые вопросы.** Урок управления берёт эти артефакты как вход: смысл уже зафиксирован каркасом, дальше — изменения.  
   → `project/compliance/specification/technical-assignment.md`  
   → `project/compliance/requirements/requirements-register.md`  
   → `project/compliance/requirements/open-questions.md`

2. **В реестре есть поля ID, формулировка, источник, статус, критерий проверки — минимальная база, чтобы при изменении не потерять «какая строка» и «в каком статусе».** Учебное обновление статусов при change опирается на эту структуру, не на ALM.  
   → `project/compliance/requirements/requirements-register.md`

3. **Открытые вопросы (сроки, статусы MVP, владелец продления и др.) — типичные точки, где «офицер меняет правило» бьёт по уже записанному или ещё не закрытому.** Change не должен молча закрывать OQ стилем в ТЗ.  
   → `project/compliance/requirements/open-questions.md`  
   → `project/compliance/specification/technical-assignment.md`

4. **В project-state запланирован `requirements/traceability-matrix.md`, но файла ещё нет.** Базовая трассировка в лекции — учебный минимум (требование → спека/вопрос/роль), не полный матричный артефакт.  
   → `project/compliance/project-state.yaml` (`planned_artifacts`)

5. **Учебные определения курса: baseline = согласованный срез смысла на дату; change request = оформленное изменение с влиянием и решателем; тишина и «в целом ок» ≠ approve изменения.** Не цитаты стандарта; опора на brief и reality-friction курса. Внешнего evidence в slice нет.  
   → методическое требование brief / `lesson-reality-friction`; авторских материалов нет (см. Availability).

6. **Предыдущий урок явно отложил версии, baseline и change request в REQ-MANAGEMENT** — мост без повтора каркаса спецификации.  
   → `output/M03/REQ-SPECIFICATION/lecture.md` (итог / граница темы)

## Availability

- Passport: `primary: []`, `secondary: [SRC-AUTHOR-MATERIALS]`, `allow_external_research: false`.
- `SRC-AUTHOR-MATERIALS` в slice помечен available, каталог `references/author-materials` отсутствует. Текстом источника лекция пользоваться не может.
- Публичные BABOK / IEEE / Wiegers в pack не включаем: внешний research запрещён.
- GAP (minor): нет primary и нет читаемого secondary; claims 1–4 — артефакты Compliance / project-state; claims 5–6 — курс/brief с оговоркой. Run не блокируем.
