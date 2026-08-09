# Course Publisher — техническая спецификация v0.3

**Рабочее название:** «Издательство курса»  
**Назначение:** агентный конвейер для проектирования, написания, проверки и упаковки учебного курса по бизнес- и системному анализу на сквозном учебном проекте «Автоматизация комплаенс».  
**Целевая среда первой реализации:** Codex + файловая система репозитория.  
**Статус:** draft for implementation.  
**Версия:** 0.3.

## Что добавлено в v0.3

v0.3 сохраняет Curriculum, Source Library, Course Progress/GAP Registry и Next Topic Resolver из v0.2 и добавляет отдельную роль **Content Critic / Coverage Reviewer**.

Критик отвечает не за корректность уже написанного текста, а за полноту содержания:

```text
Subject Reviewer     → Всё написанное правда?
Content Critic       → Ничего важного не забыли?
Methodology Reviewer → Этому можно научиться?
Editorial Reviewer   → Это хорошо читается и звучит?
```

Content Critic работает в двух контрольных точках:

1. **Brief Scope Review** — после Methodologist и до Writer. Проверяет, не упущены ли фундаментальные части темы ещё в Lesson Brief.
2. **Lecture Coverage Review** — после Writer. Проверяет, раскрывает ли лекция весь утверждённый scope, `mustCover` и Learning Outcomes.

Критик может создавать `content_gap`, `coverage_gap`, `prerequisite_gap` и `curriculum_gap`, но не имеет права самостоятельно менять Curriculum.

---

# 1. Идея продукта

Course Publisher — это не «агент, который пишет лекции», а автоматизированное образовательное издательство.

Пользователь задаёт команду уровня:

```text
Сгенерируй лекцию №14 «Заинтересованные лица»
```

После этого система самостоятельно:

1. находит тему в структуре курса;
2. определяет, что студент уже должен знать к этому моменту;
3. получает состояние сквозного проекта Compliance;
4. формирует методическое ТЗ на лекцию;
5. Content Critic проверяет полноту Lesson Brief;
6. собирает и проверяет источники;
7. пишет полную лекцию человеческим языком;
8. проводит предметное, содержательное, методическое и редакторское ревью;
9. при необходимости отправляет лекцию на переработку;
10. создаёт задания и тесты;
11. проверяет задания;
12. создаёт или обновляет артефакты сквозного проекта;
13. проверяет согласованность проектных артефактов;
14. формирует итоговый Lesson Package;
15. сохраняет историю работы и журнал выполнения.

Курс должен восприниматься как последовательное участие студента в реальном проекте, а не как набор независимых теоретических тем.

---

# 2. Главный продукт конвейера

Основная единица производства — **Lesson Package**.

```text
Lesson Package
├── lecture.md
├── exercises.md
├── answers.md
├── sources.md
├── lesson-manifest.json
├── project/
│   ├── task.md
│   ├── solution/
│   └── diff/
└── visuals/              # post-MVP
```

`lecture.md` — полноценная учебная лекция, пригодная:

- для самостоятельного чтения;
- как основа для записи видеоурока;
- как источник для конспектов;
- как источник для тестов и практических заданий.

Лекция не должна выглядеть как README, шпаргалка или перечень определений.

---

# 3. Принципы архитектуры

## 3.1. Orchestrator ≠ Methodologist

Оркестратор управляет последовательностью действий, состоянием run, retries, валидацией и журналированием.

Он **не пишет и не редактирует содержание лекции**.

Методические решения принимает отдельная роль — `Lesson Architect / Methodologist`.

## 3.2. Автор не утверждает собственную работу

Запрещено:

```text
Writer -> Writer self-review -> Approved
```

Для каждого значимого артефакта существует независимый reviewer.

## 3.3. Структурированные контракты вместо «чата агентов»

Reviewer возвращает не свободный комментарий, а валидируемый результат:

```json
{
  "verdict": "REJECTED",
  "issues": [
    {
      "id": "METH-001",
      "severity": "major",
      "category": "methodology",
      "location": "section-3",
      "problem": "Термин influence используется до объяснения.",
      "requiredChange": "Сначала объяснить влияние stakeholder на примере Compliance."
    }
  ]
}
```

## 3.4. Полная трассируемость

Должно быть возможно восстановить:

- входной контекст;
- версию prompt/skill;
- draft;
- reviewer verdict;
- замечания;
- revision;
- финальный вариант.

## 3.5. Ограниченные revision loops

По умолчанию:

```yaml
max_revision_cycles:
  lecture: 3
  assessment: 2
  project_artifacts: 3
```

После исчерпания лимита:

```text
NEEDS_HUMAN_REVIEW
```

## 3.6. Сквозной проект является частью курса

Каждая подходящая тема должна отвечать на вопрос:

> Что после этого урока изменилось в проекте Compliance?

Примеры:

- Stakeholders → `stakeholders.md`;
- требования → `functional-requirements.md`;
- Use Case → сценарии;
- БД → data model и data dictionary;
- REST → OpenAPI;
- Kafka → контракт события;
- архитектура → архитектурные схемы.

## 3.7. Формат хранения не является методикой обучения

Внутри Publisher используются Markdown, PlantUML, YAML, JSON и SQL.

Это внутреннее решение издательства. Git / Docs as Code преподаются позднее как отдельные темы.

## 3.8. Правильный текст может быть неполным

Отдельно проверяются:

- **correctness** — правда ли то, что написано;
- **completeness** — не забыта ли фундаментальная часть темы.

Subject Reviewer не считается достаточной заменой Content Critic.

Пример: лекция по Sequence Diagram может технически корректно объяснить участников и сообщения, но упустить lifeline или combined fragments. Такой материал должен быть отклонён как содержательно неполный, даже если в нём нет фактической ошибки.

---

# 4. Цели MVP v0.3

MVP успешен, если одной командой можно стабильно создать качественный Lesson Package для:

```text
REQ-STAKEHOLDERS — «Заинтересованные лица» (текущий course_order: 14)
```

без ручного переноса текста между агентами.

Обязательные части v0.3:

1. структура курса;
2. контекст аудитории;
3. Lesson Architect / Methodologist;
4. Researcher;
5. Lesson Writer;
6. Subject Reviewer;
7. Content Critic / Coverage Reviewer;
8. Methodology Reviewer;
9. Editorial Reviewer;
10. revision loop;
11. Assessment Author;
12. Assessment Reviewer;
13. Project Artifact Author — experimental;
14. Project Artifact Reviewer — experimental;
15. Package Assembler;
16. run history;
17. structured logs;
18. schema validation;
19. resume после контролируемого сбоя.

Итого в v0.3:

```text
9 основных агентных ролей
+
2 experimental Project Artifact roles
=
11 ролей

Orchestrator в число агентов не входит:
это управляющий workflow/code layer.
```

---

# 5. Не входит в v0.3

До стабилизации основного pipeline не реализовывать:

- Google Docs / Drive publishing;
- Confluence publishing;
- LMS;
- web UI;
- массовую генерацию всего курса;
- генерацию целого модуля одной командой;
- распределённую orchestration;
- Kafka и PostgreSQL для самого Publisher;
- vector DB «на всякий случай»;
- полноценный student Git-flow;
- многоагентные дебаты для каждого шага;
- генерацию видео и TTS;
- сложную систему памяти;
- самостоятельное изменение curriculum агентами;
- генерацию иллюстраций до стабилизации текстового pipeline.

Состояние v0.3 хранится в файловой системе.

---

# 6. Архитектура верхнего уровня

Course Publisher работает поверх четырёх управляемых источников состояния и знаний:

```text
+-------------------------------------------------------+
|                    COURSE PUBLISHER                   |
|                                                       |
|  1. CURRICULUM                                        |
|     Что, в каком порядке и с какой целью изучаем      |
|                                                       |
|  2. SOURCE / REFERENCE LIBRARY                        |
|     На какие источники и примеры опираемся            |
|                                                       |
|  3. COURSE PROGRESS & GAP REGISTRY                    |
|     Что готово, что не готово, что следующее          |
|                                                       |
|  4. COMPLIANCE PROJECT                                |
|     Сквозной учебный проект и его текущее состояние   |
+---------------------------+---------------------------+
                            |
                            v
                    +---------------+
                    | ORCHESTRATOR  |
                    +---------------+
                            |
                    +-------+-------+
                    | Context Builder|
                    +-------+-------+
                            |
                            v
                    Lesson Architect
                            |
                            v
                     Lesson Brief
                            |
                            v
                  Content Critic #1
                   SCOPE_REVIEW
                            |
                            v
                    Source Resolver
                            |
                            v
                       Researcher
                            |
                            v
                      Lesson Writer
                            |
          +-----------------+-----------------+
          |                 |                 |
          v                 v                 v
     Subject Review   Content Critic #2  Methodology Review
                       COVERAGE_REVIEW
          \                 |                 /
           \                |                /
            +---------------+---------------+
                            |
                            v
                     Editorial Review
                            |
                            v
                   Consolidated Review
                            |
                     revision loop
                            |
                            v
                    Approved Lecture
                      /           \
                     v             v
             Assessment Flow   Experimental
                               Project Artifact Flow
                      \           /
                       v         v
                      Package Assembler
                            |
                            v
                      Lesson Package
```

Reviewer-функции логически независимы. Если orchestration runtime поддерживает безопасный параллельный запуск, Subject Review, Coverage Review, Methodology Review и Editorial Review могут выполняться параллельно после создания draft.

Content Critic до Writer — отдельный quality gate: плохой Lesson Brief нельзя компенсировать хорошим Writer.

Главное правило: agent pipeline **не является источником Curriculum**. Он исполняет авторскую программу курса и сообщает о GAP, но не переписывает её сам.

Post-MVP:

```text
Approved Lesson
      |
      +--> Visual Director
      +--> Image Generator
      +--> Visual Reviewer
      |
      `--> Publish Adapter
              |- Google Docs
              `- other targets
```

---

# 7. Роли

## 7.1. Orchestrator

### Назначение

Orchestrator — управляющий редакционный процесс. Он не только запускает агентов, но и ведёт состояние производства курса.

Он обязан знать:

- полную карту курса;
- порядок тем;
- статус каждой темы;
- последний успешно выпущенный урок;
- существующие GAP'ы;
- заблокированные уроки;
- незакрытые замечания;
- какой урок является следующим кандидатом на выпуск.

### Ответственность

- принять запрос пользователя;
- разрешить запрос вида `publish <topic_id>`, `publish next`, `continue course`;
- определить `topic_id` и `course_order`;
- проверить prerequisites;
- проверить Course Progress & GAP Registry;
- создать `run_id`;
- пометить тему `in_progress`;
- загрузить Topic Passport;
- разрешить Source Map темы через Source Registry;
- сформировать минимально достаточный контекст;
- запускать стадии pipeline;
- проверять обязательные выходы;
- валидировать JSON/YAML;
- собирать verdict reviewer'ов;
- инициировать rework;
- считать revisions;
- останавливать run при критической ошибке;
- сохранять журнал;
- собирать Lesson Package;
- после успешного выпуска обновлять Course Progress;
- закрывать связанные GAP'ы;
- вычислять следующую тему;
- при обнаружении проблемы создавать новую запись GAP.

### Не имеет права

- писать лекцию;
- самостоятельно придумывать содержание темы;
- менять learning outcomes без Methodologist;
- исправлять факты вместо Writer;
- додумывать отсутствующие project facts;
- автоматически менять curriculum;
- автоматически удалять тему из курса;
- тихо пропускать незавершённую тему;
- считать тему `completed`, пока не сформирован валидный Lesson Package.

### Ключевой принцип

`next lesson` определяется не по имени файла и не просто как `last + 1`, а по:

```text
Curriculum order
+
Topic status
+
Prerequisites
+
Open GAPs
+
Blocking state
```

Если в курсе существует незакрытая обязательная дыра, Orchestrator должен явно сообщить о ней, а не скрывать её переходом к следующему номеру.

---

## 7.2. Lesson Architect / Methodologist

### Назначение

Преобразует запись темы curriculum в подробное методическое ТЗ — `lesson-brief.json`.

### Вход

- `course.yaml`;
- `curriculum.yaml`;
- Topic Passport выбранной темы;
- `audience.md`;
- `course-style.md`;
- module/section context;
- Course Progress;
- список реально завершённых prerequisite topics;
- Source Map темы;
- `project-state.yaml`;
- glossary;
- при необходимости passports/briefs соседних тем.

### Выход

- prerequisites;
- learning outcomes;
- scope;
- must-cover;
- should-cover;
- do-not-cover;
- misconceptions;
- рекомендуемая структура;
- типы примеров;
- место Compliance-кейса;
- project artifacts to create/update;
- требования к заданиям;
- целевая глубина и длительность.

Не пишет полный текст лекции.

---

## 7.3. Researcher / Source Curator

### Назначение

Создаёт `source-pack.md` для Writer и reviewer'ов.

### Приоритет источников

1. стандарты и официальные спецификации;
2. официальная документация;
3. признанные профессиональные книги;
4. локальная библиотека примеров;
5. дополнительные веб-источники, если разрешены конфигурацией.

### Обязанности

- отделять факт от интерпретации;
- фиксировать источники;
- отмечать спорные трактовки;
- выявлять устаревшие сведения;
- не писать готовую лекцию вместо Writer.

---

## 7.4. Lesson Writer

Создаёт большой связный `lecture.md`.

Получает:

- lesson brief;
- source pack;
- course style;
- glossary;
- relevant Compliance context;
- approved reference examples;
- reviewer feedback при revision.

### Главное редакционное требование

Writer пишет **лекцию**, а не справочник.

Материал должен включать:

- вход через проблему;
- объяснение «зачем это аналитику»;
- человеческие переходы;
- рабочие ситуации;
- определения после контекста, где уместно;
- примеры и антипримеры;
- типовые ошибки;
- Compliance-кейс;
- промежуточные выводы;
- итоговый вывод.

Таблицы и списки — вспомогательный формат.

---

## 7.5. Subject / Technical Reviewer

Проверяет:

- фактическую корректность;
- профессиональную терминологию;
- стандарты;
- отсутствие технических заблуждений;
- корректность упрощений;
- соответствие Source Pack.

Не занимается литературным редактированием.

---

## 7.6. Methodology Reviewer

Проверяет:

- достигаются ли learning outcomes;
- соответствует ли материал аудитории;
- соблюдаются ли prerequisites;
- не используется ли термин до объяснения;
- есть ли движение от простого к сложному;
- хватает ли примеров;
- есть ли практика;
- не перегружен ли урок.

---

## 7.7. Editorial Reviewer

Проверяет:

- читается ли материал как лекция;
- можно ли по нему записать видео;
- не похож ли текст на документацию;
- нет ли чрезмерных bullets/tables;
- есть ли связное повествование;
- достаточно ли историй и ситуаций;
- нет ли канцелярита и нейросетевой стерильности;
- нет ли бесполезной воды;
- не удалена ли полезная объяснительная «вода» только ради краткости.

---

## 7.8. Content Critic / Coverage Reviewer

### Назначение

Content Critic — независимый критик полноты содержания.

Его главный вопрос:

> Если студент изучит только этот материал, какие фундаментальные части темы он не узнает?

Он не дублирует других reviewer'ов:

```text
Subject Reviewer     -> корректность фактов
Content Critic       -> полнота содержания
Methodology Reviewer -> качество обучения
Editorial Reviewer   -> качество повествования
```

### Режим 1: `SCOPE_REVIEW`

Запускается после Methodologist и до Researcher/Writer.

Вход:

- Topic Passport;
- Lesson Brief;
- Curriculum context;
- prerequisites;
- previous/next topics;
- Source Map;
- при необходимости краткий outline назначенных primary sources.

Проверяет:

- не пропущены ли фундаментальные понятия;
- не слишком ли узок `mustCover`;
- не скрыт ли обязательный prerequisite;
- не вынесен ли важный элемент за рамки темы без будущего места в Curriculum;
- не перегружен ли урок чрезмерным scope;
- согласуется ли тема с соседними темами.

### Режим 2: `COVERAGE_REVIEW`

Запускается после Writer.

Вход:

- approved Lesson Brief;
- lecture draft;
- Learning Outcomes;
- `mustCover`;
- `doNotCover`.

Проверяет:

- раскрыт ли каждый `mustCover`;
- покрыты ли Learning Outcomes;
- не исчезли ли обязательные элементы;
- не заменено ли важное объяснение формальным упоминанием;
- соответствует ли фактический scope лекции approved brief.

### Категории замечаний

```text
missing_fundamental_concept
missing_required_section
insufficient_depth
scope_gap
coverage_gap
prerequisite_gap
curriculum_gap
```

### Работа с Curriculum GAP

Критик не должен превращать каждую тему в энциклопедию.

Он обязан различать:

```text
фундаментальный элемент текущей темы
vs
продвинутый материал
vs
материал отдельной будущей темы
```

Если важный материал намеренно присутствует в другой теме Curriculum, это не GAP.

Если фундаментальный материал отсутствует и в текущей, и в будущих темах, Critic создаёт предложение `curriculum_gap`.

### Права

Content Critic может:

- REJECT Lesson Brief;
- REJECT lecture draft;
- создавать GAP;
- предлагать split topic;
- предлагать расширение/сужение scope.

Content Critic не может:

- менять Curriculum;
- менять Topic Passport;
- переписывать лекцию;
- утверждать собственное исправление;
- подменять Subject Reviewer в вопросе фактической истины.

---

## 7.9. Course Consistency Reviewer

В v0.3 может быть опциональным либо встроенным в Project Reviewer.

Проверяет:

- единообразие терминов;
- glossary;
- отсутствие противоречий предыдущим урокам;
- соответствие project state;
- отсутствие внезапных технологий, ролей и бизнес-правил.

---

## 7.10. Assessment Author

Запускается **только после APPROVED lecture**.

Типы заданий:

1. knowledge;
2. understanding;
3. application;
4. analysis;
5. project case.

Каждое задание связано минимум с одним Learning Outcome.

---

## 7.11. Assessment Reviewer

Проверяет:

- однозначность;
- корректность ответа;
- distractors;
- отсутствие нескольких случайно правильных вариантов;
- соответствие лекции;
- соответствие LO;
- адекватность сложности;
- отсутствие вопросов на неизученный материал.

---

## 7.12. Project Artifact Author

Роль БА/СА сквозного проекта.

Создаёт/обновляет:

```text
stakeholders.md
business-requirements.md
business-rules.md
use-cases/*.md
diagrams/*.puml
database/data-dictionary.md
database/schema.sql
api/openapi.yaml
integrations/kafka-events.md
architecture/*.puml
```

Работает только с файлами, разрешёнными `lesson-brief.json` / Project Change Contract.

---

## 7.13. Project Artifact Reviewer

Проверяет:

- соответствие предыдущим артефактам;
- соответствие лекции и заданию;
- терминологию;
- traceability;
- корректность моделей;
- отсутствие необоснованных решений;
- отсутствие тихого изменения project facts.

---

## 7.14. Visual Director — post-MVP

Сначала решает, нужна ли иллюстрация вообще. Если нужна — создаёт visual brief.

## 7.15. Image Generator — post-MVP

Получает visual brief. Базовые правила:

- без текста;
- без случайных логотипов;
- без декоративных деталей, не несущих учебной функции.

---

# 8. Agent vs Skill

**Agent** — роль, например Methodologist, Writer, System Analyst.

**Skill** — повторяемая процедура:

```text
design-learning-outcomes
write-narrative-lesson
review-technical-accuracy
review-teaching-quality
create-mcq
create-case-exercise
design-use-case
design-data-model
review-traceability
```

Не создавать отдельного агента на каждую мелкую операцию.

---

# 9. Структура репозитория v0.3

```text
course-publisher/
|
|-- AGENTS.md
|-- README.md
|-- publisher.yaml
|
|-- docs/
|   `-- course-publisher-spec-v0.3.md
|
|-- course/
|   |-- course.yaml
|   |-- curriculum.yaml
|   |-- progress.yaml
|   |-- gap-registry.yaml
|   |-- audience.md
|   |-- course-style.md
|   |-- glossary.yaml
|   |
|   `-- modules/
|       |-- M01-profession/
|       |   |-- module.yaml
|       |   `-- sections/
|       |       `-- S01-role/
|       |           |-- section.yaml
|       |           `-- topics/
|       |               |-- analyst-role.yaml
|       |               `-- analyst-lifecycle.yaml
|       |
|       `-- M03-requirements/
|           `-- sections/
|               |-- S01-basics/
|               `-- S02-elicitation/
|                   |-- section.yaml
|                   `-- topics/
|                       |-- stakeholders.yaml
|                       `-- elicitation-methods.yaml
|
|-- project/
|   `-- compliance/
|       |-- project.yaml
|       |-- project-state.yaml
|       |-- facts.md
|       |-- glossary.yaml
|       |-- business-analysis/
|       |-- system-analysis/
|       |-- diagrams/
|       |-- database/
|       |-- api/
|       |-- integrations/
|       `-- architecture/
|
|-- references/
|   |-- README.md
|   |-- source-registry.yaml
|   |
|   |-- books/
|   |   |-- requirements/
|   |   |-- business-analysis/
|   |   |-- databases/
|   |   |-- architecture/
|   |   `-- integrations/
|   |
|   |-- standards/
|   |-- official-docs/
|   |-- author-materials/
|   |
|   `-- artifact-examples/
|       |-- requirements/
|       |-- stakeholder-registers/
|       |-- use-cases/
|       |-- api/
|       |-- database/
|       `-- architecture/
|
|-- agents/
|   |-- methodologist/AGENT.md
|   |-- researcher/AGENT.md
|   |-- lesson-writer/AGENT.md
|   |-- subject-reviewer/AGENT.md
|   |-- methodology-reviewer/AGENT.md
|   |-- editorial-reviewer/AGENT.md
|   |-- content-critic/AGENT.md
|   |-- assessment-author/AGENT.md
|   |-- assessment-reviewer/AGENT.md
|   |-- project-artifact-author/AGENT.md
|   `-- project-artifact-reviewer/AGENT.md
|
|-- skills/
|   |-- resolve-next-topic/SKILL.md
|   |-- update-course-progress/SKILL.md
|   |-- register-gap/SKILL.md
|   |-- design-lesson/SKILL.md
|   |-- resolve-sources/SKILL.md
|   |-- research-topic/SKILL.md
|   |-- write-lesson/SKILL.md
|   |-- revise-lesson/SKILL.md
|   |-- review-subject/SKILL.md
|   |-- review-methodology/SKILL.md
|   |-- review-editorial/SKILL.md
|   |-- review-lesson-scope/SKILL.md
|   |-- review-lesson-coverage/SKILL.md
|   |-- create-assessment/SKILL.md
|   |-- review-assessment/SKILL.md
|   |-- update-project-artifact/SKILL.md
|   |-- review-project-artifact/SKILL.md
|   `-- assemble-lesson-package/SKILL.md
|
|-- schemas/
|   |-- curriculum.schema.json
|   |-- topic-passport.schema.json
|   |-- progress.schema.json
|   |-- gap-registry.schema.json
|   |-- source-registry.schema.json
|   |-- lesson-brief.schema.json
|   |-- review.schema.json
|   |-- assessment.schema.json
|   |-- project-change.schema.json
|   `-- lesson-manifest.schema.json
|
|-- runs/
|-- output/
|-- scripts/
`-- tests/
```

`course/` отвечает на вопрос «что и в каком порядке учим».  
`references/` — «на основании чего пишем».  
`project/compliance/` — «на каком кейсе практикуемся».  
`runs/` — «как конкретный выпуск был произведён».

---

# 10. Curriculum Model: Модуль → Раздел → Тема

Карта курса является **author-controlled source of truth**.

Основная структура:

```text
Курс
└── Модуль
    └── Раздел
        └── Тема
```

Publisher не имеет права самовольно добавлять, удалять или переставлять темы.

Для стабильности идентификатор темы не должен зависеть от её текущего номера.

Во всех внутренних контрактах v0.3 используется поле `topicId`.
Человеческий номер лекции (`course_order`) — изменяемый presentation/order attribute.

Пример:

```text
topic_id: REQ-STAKEHOLDERS
course_order: 14
```

Если позднее перед темой будет вставлен новый урок, `course_order` может измениться, но `topic_id` остаётся прежним.

`course/curriculum.yaml`:

```yaml
course_id: system-analysis

modules:
  - id: M01
    title: О профессии системного аналитика
    order: 1

    sections:
      - id: M01-S01
        title: Профессия и роль аналитика
        order: 1

        topics:
          - id: PROF-ROLE
            title: Роль системного аналитика и его типовые задачи
            order: 1
            course_order: 1

          - id: PROF-LIFECYCLE
            title: Жизненный цикл работы аналитика
            order: 2
            course_order: 2

  - id: M03
    title: Требования к ПО
    order: 3

    sections:
      - id: M03-S01
        title: Основы требований
        order: 1
        topics:
          - id: REQ-INTRO
            title: Что такое требования и какие они бывают
            order: 1
            course_order: 12

          - id: REQ-FNFR
            title: Функциональные и нефункциональные требования
            order: 2
            course_order: 13

      - id: M03-S02
        title: Выявление требований
        order: 2
        topics:
          - id: REQ-STAKEHOLDERS
            title: Заинтересованные лица
            order: 1
            course_order: 14

          - id: REQ-ELICITATION
            title: Способы выявления требований
            order: 2
            course_order: 15
```

---

# 11. `course/course.yaml`

`course.yaml` хранит метаданные и общие правила, но не заменяет curriculum tree.

```yaml
course:
  id: system-analysis
  title: Системный анализ на практике
  language: ru
  project: compliance

audience:
  level: beginner
  assumed_it_background: none

curriculum:
  file: curriculum.yaml

progress:
  file: progress.yaml

gaps:
  file: gap-registry.yaml

sources:
  registry: ../references/source-registry.yaml

principles:
  - practice_first
  - explain_before_formalize
  - one_end_to_end_project
  - business_to_system_analysis
  - no_unexplained_terms
  - curriculum_is_author_controlled
```

---

# 12. Topic Passport

Одного названия темы недостаточно для качественной генерации.

Для каждой темы хранится небольшой **Topic Passport**. Это авторское намерение: что именно должна дать тема и чего из неё делать не надо.

Пример `course/modules/M03-requirements/sections/S02-elicitation/topics/stakeholders.yaml`:

```yaml
id: REQ-STAKEHOLDERS
title: Заинтересованные лица
course_order: 14

purpose: >
  Научить начинающего аналитика понимать,
  кто влияет на проект, кому важен его результат
  и от кого необходимо получать информацию и требования.

scope:
  include:
    - понятие stakeholder
    - способы выявления заинтересованных лиц
    - внутренние и внешние stakeholders
    - интерес и влияние
    - stakeholder register
    - выбор способа взаимодействия

  exclude:
    - сложные enterprise governance frameworks
    - глубокое управление политическими конфликтами
    - RACI как самостоятельную большую тему

prerequisites:
  topics:
    - REQ-FNFR

previous_topics:
  - REQ-FNFR

next_topics:
  - REQ-ELICITATION

project:
  stage: business_analysis
  case: >
    Аналитик подключён к проекту автоматизации комплаенса
    и должен понять, с кем необходимо работать
    перед полноценным выявлением требований.

  expected_artifacts:
    - business-analysis/stakeholders.md

author_notes:
  - Не превращать тему в классификацию ради классификации.
  - Показать, почему пользователь системы и stakeholder — не одно и то же.
  - Разобрать заказчика, сотрудника, комплаенс-офицера и руководителя.

sources:
  primary:
    - SRC-WIEGERS-REQUIREMENTS

  secondary:
    - SRC-PUT-ANALYTIKA

  examples:
    - REF-MY-STAKEHOLDER-DOC-01

  allow_external_research: true
```

Topic Passport не является Lesson Brief.

```text
Topic Passport
      |
      | авторский scope и intent
      v
Methodologist
      |
      v
Lesson Brief
```

Methodologist может детализировать способ преподавания, но не имеет права тихо расширять scope за пределы паспорта.

---

# 13. Course Progress & GAP Registry

Publisher обязан вести состояние производства курса независимо от Project State.

## 13.1. `course/progress.yaml`

Это machine-readable источник текущего прогресса.

```yaml
course_id: system-analysis

updated_at: 2026-08-09T00:00:00+05:00

summary:
  total_topics: 60
  completed: 13
  in_progress: 0
  blocked: 0
  needs_revision: 0
  planned: 47

last_completed:
  topic_id: REQ-FNFR
  course_order: 13
  run_id: 2026-08-08T220000_REQ-FNFR_x1y2z3

next_candidate:
  topic_id: REQ-STAKEHOLDERS
  course_order: 14

topics:
  PROF-ROLE:
    course_order: 1
    status: completed
    output: output/M01/PROF-ROLE/

  REQ-FNFR:
    course_order: 13
    status: completed
    output: output/M03/REQ-FNFR/

  REQ-STAKEHOLDERS:
    course_order: 14
    status: planned

  REQ-ELICITATION:
    course_order: 15
    status: planned
```

Допустимые статусы:

```text
planned
in_progress
review
completed
needs_revision
blocked
skipped
```

`skipped` допустим только по явному решению автора курса и не должен считаться `completed`.

---

## 13.2. `course/gap-registry.yaml`

GAP Registry хранит не только «пропущенные лекции», но любые обнаруженные дыры курса.

```yaml
gaps:
  - id: GAP-0007
    status: open
    severity: major
    type: prerequisite_gap

    detected_during:
      topic_id: REQ-ELICITATION
      run_id: 2026-08-10T100000_REQ-ELICITATION_ab12cd

    description: >
      В лекции требуется понятие stakeholder influence,
      но ни одна завершённая тема не вводит его
      на достаточном уровне.

    affected_topics:
      - REQ-ELICITATION

    suggested_action: >
      Проверить Topic Passport REQ-STAKEHOLDERS
      и при необходимости расширить его scope.

    created_at: ...
    resolved_at: null
```

Типы GAP:

```text
missing_topic
prerequisite_gap
content_gap
source_gap
terminology_gap
assessment_gap
project_consistency_gap
curriculum_conflict
blocked_topic
manual_review_required
```

Orchestrator имеет право **создать GAP**, но не имеет права самостоятельно изменить Curriculum, чтобы его закрыть.

---

## 13.3. Human-readable progress

Дополнительно Orchestrator может автоматически поддерживать:

```text
course/PROGRESS.md
```

Пример:

```markdown
# Course Progress

Готово: 13 / 60 тем.

Последняя готовая тема:
13. Функциональные и нефункциональные требования

Следующая:
14. Заинтересованные лица

Открытые GAP:
- GAP-0007 — prerequisite_gap — major

Blocked:
- нет
```

`PROGRESS.md` — удобное представление для человека.

Source of truth остаются `progress.yaml` и `gap-registry.yaml`.

---

# 14. Next Topic Resolver

Orchestrator должен уметь работать без явного номера лекции.

Поддерживаемые команды:

```text
/publish-topic REQ-STAKEHOLDERS
/publish-lesson 14
/publish-next
/continue-course
/course-status
/list-gaps
```

Естественные эквиваленты:

```text
Сгенерируй тему про заинтересованных лиц
Сгенерируй лекцию №14
Продолжай курс
Сделай следующую лекцию
Где мы остановились?
Какие в курсе сейчас есть пробелы?
```

Алгоритм `resolve-next-topic`:

```text
1. Прочитать curriculum.yaml.
2. Прочитать progress.yaml.
3. Прочитать gap-registry.yaml.
4. Найти темы не в состоянии completed/skipped.
5. Отсортировать по course_order.
6. Проверить prerequisites первой темы-кандидата.
7. Проверить blocking GAPs.
8. Если тема доступна -> вернуть next_candidate.
9. Если тема blocked -> вернуть BLOCKED + причины.
10. Никогда не перепрыгивать через обязательную тему молча.
```

После `COMPLETED`:

```text
update progress
    ->
close resolved gaps
    ->
recalculate next_candidate
    ->
write PROGRESS.md
```

---

# 15. Source / Knowledge Library

Researcher не должен начинать каждую тему с «общих знаний модели» или произвольного веб-поиска.

Publisher использует управляемую библиотеку:

```text
references/
├── source-registry.yaml
├── books/
├── standards/
├── official-docs/
├── author-materials/
└── artifact-examples/
```

Типы материалов:

### `knowledge_source`

Источник предметных знаний:

- Wiegers / Beatty;
- «Путь аналитика»;
- BABOK;
- UML Specification;
- RFC;
- PostgreSQL docs;
- OpenAPI Specification;
- другие авторитетные материалы.

### `author_material`

Материал автора курса:

- собственные методички;
- заметки;
- ранее написанные объяснения;
- принятые подходы курса.

### `artifact_example`

Реальный или учебный документ БА/СА, используемый как пример формы/структуры/реализма, но не обязательно как источник универсальной истины.

### `anti_example`

Специально плохой или спорный пример для разбора.

---

# 16. Source Registry

`references/source-registry.yaml` — единая карта источников.

```yaml
sources:

  - id: SRC-WIEGERS-REQUIREMENTS
    type: book
    title: Software Requirements
    authors:
      - Karl Wiegers
      - Joy Beatty
    authority: high

    domains:
      - requirements
      - elicitation
      - stakeholders
      - requirements_quality

    location:
      type: local_file
      path: references/books/requirements/software-requirements.pdf

    usage:
      factual_source: true
      structural_reference: false

  - id: SRC-PUT-ANALYTIKA
    type: book
    title: Путь аналитика
    authority: recommended

    domains:
      - business_analysis
      - system_analysis

    location:
      type: local_file
      path: references/books/business-analysis/put-analitika.pdf

  - id: REF-MY-STAKEHOLDER-DOC-01
    type: artifact_example
    title: Пример реестра заинтересованных лиц автора курса
    authority: contextual

    location:
      type: local_file
      path: references/artifact-examples/stakeholder-registers/example-01.md

    use_for:
      - structure
      - realism

    do_not_use_for:
      - universal_methodology
```

В будущем `location.type` может быть:

```text
local_file
google_drive
web
other_connector
```

Логика агентов должна опираться на `source_id`, а не быть жёстко привязана к физическому пути.

---

# 17. Source Map темы

Topic Passport задаёт приоритеты источников:

```yaml
sources:
  primary:
    - SRC-WIEGERS-REQUIREMENTS

  secondary:
    - SRC-PUT-ANALYTIKA

  author:
    - SRC-AUTHOR-REQ-NOTES

  examples:
    - REF-MY-STAKEHOLDER-DOC-01

  allow_external_research: true
```

Resolver преобразует это в Source Context.

Политика:

```text
Primary sources
    >
Secondary sources
    >
Author materials
    >
External research
```

При противоречии источников Researcher не должен тихо выбирать удобную трактовку. Он фиксирует расхождение в Source Pack.

---

# 18. Reference и Artifact Examples

Реальные документы БА/СА хранить полезно, но они не становятся «правильными» только потому, что использовались в рабочем проекте.

Metadata:

```yaml
id: REF-TZ-001
type: artifact_example
artifact_type: technical_specification
quality: mixed

use_for:
  - structure
  - examples
  - realism

do_not_use_for:
  - universal_template

notes: >
  ТЗ создано в формальном проекте.
  Структуру нельзя преподносить как единственно
  возможный способ фиксации бизнес- и системных требований.
```

Перед добавлением реальных документов удалить:

- персональные данные;
- секреты;
- закрытые URL;
- токены;
- реальные customer IDs;
- чувствительную корпоративную информацию.

---

# 19. `audience.md` и `course-style.md`

`audience.md` фиксирует образ студента.

```markdown
# Аудитория

Курс рассчитан на человека без опыта работы системным аналитиком.

Допускается отсутствие:
- опыта разработки;
- знания SQL;
- знания HTTP;
- опыта работы с UML;
- опыта IT-проектов.

Технические понятия нельзя использовать как очевидные до их изучения.
Новая терминология вводится через проблему, контекст и пример.
```

`course-style.md` — отдельный source of truth редакционной подачи.

Основные правила:

- лекция звучит как рассказ преподавателя;
- сначала проблема и смысл, затем формализация;
- подробное объяснение не считается «водой»;
- пустые повторы удаляются;
- таблица не заменяет объяснение;
- Compliance используется естественно;
- разрешены бытовые и рабочие истории;
- термины из будущих тем не считаются известными;
- текст должен быть пригоден как основа видеоурока.

---

# 20. Compliance Project

## 20.1. `project.yaml`

```yaml
project:
  id: compliance
  title: Автоматизация комплаенс

description: >
  Учебный проект, на котором студент проходит путь
  от бизнес-анализа до системной спецификации,
  а позднее передаёт спецификацию coding agents.

roles:
  - employee
  - compliance_officer
  - manager

current_stage: business_analysis
```

## 20.2. `facts.md`

Содержит только канонические факты.

На ранних уроках файл намеренно неполный: нельзя заранее раскрывать студенту решения, которые он должен спроектировать позднее.

## 20.3. `project-state.yaml`

Project State не заменяет Course Progress.

```text
Course Progress:
какие учебные темы выпущены?

Project State:
до какого состояния дошёл Compliance-проект?
```

Пример:

```yaml
project_id: compliance
checkpoint_topic: REQ-FNFR

approved_artifacts:
  - business-analysis/project-context.md
  - business-analysis/business-goals.md

known_terms:
  - business_goal

decisions: []
```

Project Artifact ветка в v0.3 остаётся experimental: approved proposed artifact не обязан автоматически записываться в canonical project без настройки `experimental_project_auto_merge=true`.

---

# 21. Pipeline / State Machine

```text
NEW
 |
 v
TOPIC_RESOLVED
 |
 v
PROGRESS_CHECKED
 |
 v
CONTEXT_READY
 |
 v
BRIEF_READY
 |
 v
BRIEF_SCOPE_REVIEW
 |       \
 |        \ major/critical
 |         v
 |      BRIEF_REWORK
 |         |
 |         `----> BRIEF_SCOPE_REVIEW
 |
 | approved
 v
RESEARCH_READY
 |
 v
LECTURE_DRAFTED
 |
 v
LECTURE_REVIEW
 |  checks:
 |  - subject
 |  - content coverage
 |  - methodology
 |  - editorial
 |       \
 |        \ major/critical
 |         v
 |      LECTURE_REWORK
 |         |
 |         `----> LECTURE_REVIEW
 |
 | approved
 v
LECTURE_APPROVED
 |
 +--> ASSESSMENT_DRAFTED
 |       |
 |       v
 |   ASSESSMENT_REVIEW
 |       |
 |       v
 |   ASSESSMENT_APPROVED
 |
 +--> PROJECT_ARTIFACT_DRAFTED
         |
         v
     PROJECT_ARTIFACT_REVIEW
         |
         v
     PROJECT_ARTIFACT_APPROVED
 |
 v
PACKAGE_READY
 |
 v
COMPLETED
```

Служебные состояния:

```text
FAILED
NEEDS_HUMAN_REVIEW
CANCELLED
```

---

# 22. Run Structure

```text
runs/
`-- 2026-08-08T234200_REQ-STAKEHOLDERS_ab12cd/
    |-- run.json
    |-- events.jsonl
    |
    |-- 00-input/
    |   |-- request.md
    |   |-- course-context.yaml
    |   `-- project-state.yaml
    |
    |-- 01-brief/
    |   |-- lesson-brief-v1.json
    |   |-- scope-review-v1.json
    |   |-- revision-request-v1.json        # optional
    |   `-- lesson-brief-final.json
    |
    |-- 02-research/
    |   `-- source-pack.md
    |
    |-- 03-lecture/
    |   |-- draft-v1.md
    |   |-- review-v1/
    |   |   |-- subject.json
    |   |   |-- coverage.json
    |   |   |-- methodology.json
    |   |   `-- editorial.json
    |   |-- revision-request-v1.json
    |   |-- draft-v2.md
    |   `-- final.md
    |
    |-- 04-assessment/
    |   |-- draft.json
    |   |-- review.json
    |   |-- exercises.md
    |   `-- answers.md
    |
    |-- 05-project/
    |   |-- task.md
    |   |-- before/
    |   |-- proposed/
    |   |-- reviews/
    |   |-- diff/
    |   `-- approved/
    |
    |-- 06-visuals/
    |
    `-- 99-package/
        `-- lesson-manifest.json
```

Промежуточные файлы после успешного run не удаляются.

---

# 23. `run.json`

```json
{
  "runId": "2026-08-08T234200_REQ-STAKEHOLDERS_ab12cd",
  "topicId": "REQ-STAKEHOLDERS",
  "status": "LECTURE_REVIEW",
  "startedAt": "2026-08-08T23:42:00+05:00",
  "updatedAt": "2026-08-08T23:50:11+05:00",
  "revision": {
    "lecture": 2,
    "assessment": 0,
    "projectArtifacts": 0
  },
  "errors": []
}
```

---

# 24. Event log

`events.jsonl`, одна строка — одно событие.

```json
{"ts":"...","event":"RUN_CREATED","topicId":"REQ-STAKEHOLDERS"}
{"ts":"...","event":"AGENT_STARTED","agent":"methodologist"}
{"ts":"...","event":"ARTIFACT_CREATED","path":"01-brief/lesson-brief.json"}
{"ts":"...","event":"AGENT_FINISHED","agent":"methodologist"}
{"ts":"...","event":"REVIEW_REJECTED","reviewer":"editorial","major":2}
{"ts":"...","event":"REVISION_STARTED","revision":2}
```

Если runtime даёт model/tokens/cost, писать их как optional metadata.

---

# 25. Lesson Brief contract

```json
{
  "topicId": "REQ-STAKEHOLDERS",
  "title": "Заинтересованные лица",
  "moduleId": "M03",
  "audienceLevel": "beginner",

  "prerequisites": [
    "Студент понимает роль БА и СА",
    "Студент знаком с понятием бизнес-цели"
  ],

  "learningOutcomes": [
    {
      "id": "REQ-STAKEHOLDERS-LO1",
      "text": "Объяснять, кто является заинтересованным лицом проекта."
    },
    {
      "id": "REQ-STAKEHOLDERS-LO2",
      "text": "Выявлять основных заинтересованных лиц."
    },
    {
      "id": "REQ-STAKEHOLDERS-LO3",
      "text": "Анализировать их интерес и влияние."
    }
  ],

  "mustCover": [
    "понятие stakeholder",
    "способы выявления stakeholders",
    "внутренние и внешние stakeholders",
    "влияние и интерес",
    "stakeholder register"
  ],

  "doNotCover": [
    "сложные enterprise governance frameworks"
  ],

  "misconceptions": [
    "stakeholder — только пользователь системы",
    "stakeholder — только заказчик"
  ],

  "projectUsage": {
    "scenario": "Выявление stakeholders проекта Compliance",
    "artifactsToUpdate": [
      "business-analysis/stakeholders.md"
    ]
  },

  "assessmentRequirements": {
    "minKnowledgeQuestions": 3,
    "minApplicationQuestions": 2,
    "projectExerciseRequired": true
  },

  "editorialRequirements": {
    "useNarrativeOpening": true,
    "mustContainRealisticCases": true,
    "tablesMustHaveNarrativeExplanation": true
  },

  "target": {
    "videoMinutes": 45,
    "depth": "detailed"
  }
}
```

---

# 26. Review Contract

```json
{
  "reviewer": "methodology",
  "artifact": "03-lecture/draft-v1.md",
  "verdict": "REJECTED",
  "summary": "Структура в целом логична, но две цели обучения не обеспечены практикой.",
  "positiveNotes": [
    "Удачная вводная ситуация с первым днём аналитика на проекте."
  ],
  "issues": [
    {
      "id": "METH-001",
      "severity": "major",
      "category": "learning_outcome_coverage",
      "location": "section-5",
      "problem": "LO3 заявлен, но нет разбора influence/interest.",
      "requiredChange": "Добавить пошаговый разбор 3-4 stakeholders Compliance."
    }
  ]
}
```

Severity:

```text
critical
major
minor
suggestion
```

Для Content Critic дополнительно допускается поле:

```json
"gapProposal": {
  "type": "curriculum_gap",
  "suggestedAction": "..."
}
```

`gapProposal` не изменяет Curriculum автоматически. Orchestrator только регистрирует предложение в GAP Registry.

Правила:

- critical → REJECT;
- major → REJECT;
- minor → может быть принят;
- suggestion → не блокирует.

---

# 27. Review Aggregation

Lecture APPROVED, если:

```text
critical == 0
major == 0
```

Конфигурация minor:

```yaml
review_policy:
  max_minor_for_auto_approve: 5
```

Orchestrator объединяет issues в `revision-request.json`.

Reviewer'ы не переписывают материал вместо Writer.

---

# 28. Revision Request

```json
{
  "topicId": "REQ-STAKEHOLDERS",
  "revision": 2,
  "sourceDraft": "draft-v1.md",
  "mustFix": [
    {
      "source": "methodology",
      "issueId": "METH-001",
      "requiredChange": "..."
    }
  ],
  "preserve": [
    "Удачную вводную историю",
    "Пример с сотрудником Compliance"
  ]
}
```

`preserve` защищает удачные части от ненужной полной перегенерации.

---

# 29. Assessment Contract

```json
{
  "topicId": "REQ-STAKEHOLDERS",
  "items": [
    {
      "id": "REQ-STAKEHOLDERS-Q01",
      "type": "single_choice",
      "learningOutcomes": ["REQ-STAKEHOLDERS-LO1"],
      "difficulty": "basic",
      "question": "...",
      "options": [
        {"id":"A","text":"..."},
        {"id":"B","text":"..."},
        {"id":"C","text":"..."},
        {"id":"D","text":"..."}
      ],
      "correct": ["B"],
      "explanation": "..."
    },
    {
      "id": "REQ-STAKEHOLDERS-P01",
      "type": "project_case",
      "learningOutcomes": ["REQ-STAKEHOLDERS-LO2","REQ-STAKEHOLDERS-LO3"],
      "difficulty": "application",
      "task": "...",
      "expectedResult": "stakeholder register"
    }
  ]
}
```

---

# 30. Assessment Coverage

Assessment Reviewer формирует coverage matrix:

```text
LO1 -> Q01, Q02
LO2 -> Q03, P01
LO3 -> Q04, P01
```

Lesson Package не завершается автоматически, если обязательный LO вообще не проверяется.

---

# 31. Project Change Contract

```json
{
  "topicId": "REQ-STAKEHOLDERS",
  "changes": [
    {
      "artifact": "business-analysis/stakeholders.md",
      "operation": "create",
      "reason": "Практический результат урока",
      "learningOutcomes": ["REQ-STAKEHOLDERS-LO2","REQ-STAKEHOLDERS-LO3"]
    }
  ]
}
```

Если `operation=update`, до изменения обязательно сохраняется `before`.

---

# 32. Работа с Project Artifacts

Project Artifact Author не меняет canonical files напрямую.

```text
canonical
   |
   v
copy to run/before
   |
   v
create proposed
   |
   v
review
   |
   +-- REJECT -> revision
   |
   `-- APPROVE
           |
           v
     orchestrator merge
```

---

# 33. Diff

Для каждого изменённого project artifact формировать diff.

```diff
+ ## Stakeholders
+
+ ### Комплаенс-офицер
+ Интерес: высокий
+ Влияние: высокое
```

Diff нужен для:

- отладки Publisher;
- будущей демонстрации студенту;
- traceability.

---

# 34. `output/`

`runs/` — кухня издательства. `output/` — опубликованный результат.

```text
output/
`-- M03/
    `-- REQ-STAKEHOLDERS-stakeholders/
        |-- lecture.md
        |-- exercises.md
        |-- answers.md
        |-- sources.md
        |-- lesson-manifest.json
        `-- project/
            |-- task.md
            `-- solution/
```

Не публиковать:

- внутренние reviewer notes;
- debug prompts;
- промежуточные drafts;
- retries;
- скрытые рассуждения модели.

---

# 35. Логирование без private chain-of-thought

Логировать:

- команды;
- входные контексты;
- prompt/skill versions;
- outputs;
- reviewer issues;
- технические ошибки;
- статусы.

Не пытаться сохранять скрытый chain-of-thought модели. Для объяснимости достаточно наблюдаемых artifacts и structured rationale/verdict.

---

# 36. Root `AGENTS.md`

Стартовый смысл:

```markdown
# Course Publisher

Ты работаешь внутри агентного издательства учебного курса.

## Source of truth
- course/*
- project/compliance/*
- references/*
- schemas/*

## Основное правило
Не изменяй канонические файлы курса или проекта вне разрешённого pipeline.

## Publish lesson
При запросе сгенерировать урок:
1. идентифицируй topic_id;
2. создай run;
3. следуй state machine;
4. используй соответствующие agent/skill инструкции;
5. валидируй обязательные выходы;
6. заверши Lesson Package.

## Запрещено
- пропускать reviewer или Content Critic ради ускорения;
- считать собственный текст или Lesson Brief одобренным;
- менять curriculum без задания;
- придумывать неизвестные project facts;
- удалять промежуточные run artifacts.
```

Конкретный синтаксис адаптировать к актуальному механизму Codex.

---

# 37. Prompt: Methodologist

```text
Ты — главный методист курса по бизнес- и системному анализу.

Твоя задача — не написать лекцию, а спроектировать обучение по конкретной теме.

Используй:
- описание аудитории;
- структуру курса;
- уже пройденные темы;
- состояние сквозного проекта Compliance;
- редакционные правила.

Сформируй Lesson Brief.

Требования:
1. Learning outcomes должны описывать наблюдаемое умение студента.
2. Не включай материал, требующий ещё не изученных prerequisites.
3. Явно укажи misconceptions.
4. Определи, что студент должен сделать в Compliance-проекте.
5. Не пиши полный текст лекции.
6. Не меняй структуру курса.
7. Выход должен соответствовать lesson-brief schema.
```

---

# 38. Prompt: Researcher

```text
Ты — редактор-исследователь образовательного издательства.

Твоя задача — подготовить проверяемую фактологическую базу для автора лекции.

Приоритет источников:
1. стандарты;
2. официальная документация;
3. признанная профессиональная литература;
4. утверждённые references проекта.

Для существенных положений:
- укажи источник;
- отдели факт от интерпретации;
- отметь спорные определения;
- предупреди об устаревших сведениях.

Не пиши лекцию.
Не придумывай факты, отсутствующие в источниках.
```

---

# 39. Prompt: Lesson Writer

```text
Ты — автор учебника и преподаватель-практик по бизнес- и системному анализу.

Напиши полноценную лекцию по Lesson Brief.

Текст рассчитан на новичка и должен быть пригоден как основа для видеоурока.

Правила:
- пиши связным человеческим текстом;
- объясняй, зачем аналитику нужна тема;
- сначала создавай контекст и понимание, затем формализуй термин;
- используй истории, рабочие ситуации, кейсы и антипримеры;
- регулярно возвращайся к сквозному проекту Compliance;
- не превращай лекцию в набор таблиц и bullets;
- таблица не заменяет объяснение;
- не используй термины из будущих уроков как уже известные;
- не выдумывай project facts;
- не усложняй язык ради академичности;
- не сокращай полезное объяснение ради лаконичности.

Лекция должна покрыть все learning outcomes и must-cover.

Если это revision, исправь все mustFix и сохрани удачные части предыдущей версии.
```

---

# 40. Prompt: Subject Reviewer

```text
Ты — ведущий практикующий эксперт по теме лекции.

Не переписывай лекцию.

Проведи предметное ревью:
- понятия;
- техническая точность;
- терминология;
- соответствие источникам;
- вводящие в заблуждение упрощения;
- устаревшие утверждения.

Каждое замечание содержит severity, location, problem, requiredChange.

Не оценивай литературный стиль — это задача Editorial Reviewer.
```

---

# 41. Prompt: Methodology Reviewer

```text
Ты — методист образовательной программы для начинающих аналитиков.

Проверь:
- достигаются ли learning outcomes;
- подходит ли материал новичку;
- хватает ли предварительных объяснений;
- соблюдается ли движение от простого к сложному;
- достаточно ли примеров;
- нет ли когнитивной перегрузки;
- есть ли практика;
- связан ли урок с предыдущим опытом студента.

Не проводи литературное редактирование.
Не переписывай материал.
Возвращай structured review.
```

---

# 42. Prompt: Editorial Reviewer

```text
Ты — главный редактор образовательного издательства.

Проверь текст как материал, который студент будет читать, а преподаватель — использовать для записи видео.

Ищи:
- справочный стиль вместо лекционного;
- чрезмерные списки и таблицы;
- резкие переходы;
- сухие определения без контекста;
- искусственный AI-стиль;
- повторения;
- канцелярит;
- недостаток историй и примеров;
- текстовую воду, которая ничего не объясняет.

Важно: подробное объяснение — не вода.
Контекст, история, аналогия и разбор кейса полезны, если помогают понять предмет.

Не оценивай техническую корректность вместо Subject Reviewer.
```

---

# 43. Prompt: Content Critic

```text
Ты — Content Critic образовательного издательства.

Твоя специализация — полнота содержания.

Ты НЕ должен искать все возможные ошибки вообще.
Твой главный вопрос:

"Что фундаментально важное здесь отсутствует?"

Работай в одном из двух режимов.

MODE = SCOPE_REVIEW

Проверяй Topic Passport и Lesson Brief.

Ищи:
- пропущенные базовые понятия;
- фундаментальные элементы темы, которых нет в mustCover;
- скрытые prerequisites;
- элементы, которые исключены из темы, но нигде не изучаются позже;
- чрезмерно широкий scope, который разумно разделить;
- несоответствие scope соседним темам Curriculum.

Не требуй включить весь возможный продвинутый материал.
Если материал относится к другой явно существующей теме, не считай это GAP.

MODE = COVERAGE_REVIEW

Проверяй готовую лекцию относительно approved Lesson Brief.

Ищи:
- mustCover, которые не раскрыты;
- Learning Outcomes без достаточного объяснения;
- важные элементы, которые только упомянуты одной строкой;
- разделы, исчезнувшие при написании;
- слишком поверхностное раскрытие фундаментального понятия.

Для каждого issue верни:
- severity;
- category;
- location;
- problem;
- requiredChange;
- gapProposal (optional).

Допустимые категории:
- missing_fundamental_concept
- missing_required_section
- insufficient_depth
- scope_gap
- coverage_gap
- prerequisite_gap
- curriculum_gap

Не переписывай лекцию.
Не меняй Topic Passport.
Не меняй Curriculum.
Не подменяй Subject Reviewer.
```

---

# 44. Prompt: Assessment Author

```text
Ты — автор учебных заданий.

Создавай задания только по утверждённой лекции и её Learning Outcomes.

Нужен баланс:
- knowledge;
- understanding;
- application;
- analysis;
- project case.

Каждое задание:
- связано с LO;
- имеет объяснённый правильный ответ;
- не проверяет материал, которого не было в лекции;
- не содержит подсказку на правильный ответ.

Добавь практическое задание по Compliance, если это предусмотрено Lesson Brief.
```

---

# 45. Prompt: Assessment Reviewer

```text
Ты — независимый reviewer учебных заданий.

Проверь:
- существует ли однозначный правильный ответ;
- нет ли второго случайно правильного варианта;
- адекватны ли distractors;
- соответствует ли вопрос лекции;
- проверяет ли он заявленный Learning Outcome;
- соответствует ли difficulty;
- понятно ли сформулировано условие.

Для каждого дефекта дай structured issue.
```

---

# 46. Prompt: Project Artifact Author

```text
Ты — бизнес-/системный аналитик сквозного проекта Compliance.

На основании:
- текущего project state;
- утверждённой лекции;
- project task;
- canonical project facts;
- existing artifacts;
- reference examples

создай proposed версию только тех файлов, которые разрешены в Project Change Contract.

Не изменяй:
- канонические факты без явного основания;
- артефакты вне scope;
- терминологию проекта без необходимости.

Не записывай proposed changes напрямую в canonical project directory.
```

---

# 47. Prompt: Project Artifact Reviewer

```text
Ты — ведущий аналитик, принимающий работу по сквозному проекту Compliance.

Проверь proposed artifacts:
- соответствие требованиям;
- согласованность с existing artifacts;
- правильность терминов;
- traceability;
- отсутствие противоречий;
- соответствие уровню курса;
- обоснованность новых решений.

Не требуй решений, которые студент ещё не должен знать на текущем этапе курса.
```

---

# 48. Skills v0.3

```text
design-lesson
research-topic
write-lesson
revise-lesson
review-subject
review-lesson-scope
review-lesson-coverage
review-methodology
review-editorial
create-assessment
review-assessment
update-project-artifact
review-project-artifact
assemble-lesson-package
```

---

# 49. Skill Contract

Каждый `SKILL.md` должен иметь:

```text
Purpose
When to use
Required inputs
Optional inputs
Steps
Output contract
Validation
Failure conditions
Forbidden actions
Example
```

---

# 50. Пример `write-lesson/SKILL.md`

```markdown
# Skill: write-lesson

## Purpose
Создать lecture draft по утверждённому Lesson Brief.

## Required inputs
- lesson-brief.json
- source-pack.md
- audience.md
- course-style.md
- project context

## Steps
1. Проверить inputs.
2. Построить внутренний outline.
3. Написать narrative opening.
4. Покрыть must-cover.
5. Ввести понятия в порядке prerequisites.
6. Добавить кейсы.
7. Добавить Compliance example.
8. Проверить LO coverage.
9. Сохранить draft.

## Output
03-lecture/draft-vN.md

## Forbidden
- менять Lesson Brief;
- менять project state;
- выдавать draft за approved;
- пропускать сложную тему одной таблицей.
```

---

# 51. Команды

MVP поддерживает обращение как по стабильному `topic_id`, так и по человеческому порядковому номеру.

Минимально:

```text
/publish-topic REQ-STAKEHOLDERS
/publish-lesson 14
/publish-next
/continue-course
/course-status
/list-gaps
```

Операционные команды:

```text
/status <run_id>
/resume <run_id>
/review-topic REQ-STAKEHOLDERS
```

Естественные фразы должны поддерживаться без требования знать технические ID:

```text
Сгенерируй лекцию №14
Сгенерируй тему "Заинтересованные лица"
Продолжай курс
Сделай следующую лекцию
Где мы остановились?
Что у нас ещё не готово?
Какие GAP'ы сейчас открыты?
```

Правила разрешения:

```text
"лекция №14"
      ->
curriculum.course_order == 14
      ->
topic_id = REQ-STAKEHOLDERS
```

```text
"продолжай курс"
      ->
Next Topic Resolver
      ->
progress + gaps + prerequisites
      ->
следующая доступная обязательная тема
```

Если Next Topic Resolver обнаружил blocking GAP, Orchestrator должен сообщить об этом и не перепрыгивать к следующей теме молча.

---

# 52. Context Builder

Перед каждым agent call формируется **минимально достаточный контекст**.

До запуска Methodologist Orchestrator обязан разрешить:

```text
Curriculum node
+
Topic Passport
+
Course Progress
+
GAP state
+
Source Map
+
Compliance Project State
```

Если Topic Passport отсутствует, production останавливается:

```text
TOPIC_PASSPORT_MISSING
```

и регистрируется GAP.

Writer, например, получает:

```text
audience.md
course-style.md
lesson-brief.json
source-pack.md
relevant glossary entries
relevant project facts
relevant current artifacts
revision-request.json (optional)
```

Researcher получает:

```text
Topic Passport
Source Map
Source Registry entries
local source locations / connector references
research policy
```

Нельзя по умолчанию скармливать агенту весь репозиторий.

Context Builder обязан отделять:

- авторскую структуру курса;
- источники знаний;
- факты Compliance-проекта;
- уже выпущенный учебный материал.

Это снижает риск того, что модель случайно начнёт считать текст старой лекции более авторитетным, чем назначенный первичный источник.

---

# 53. Context Permissions

Логические разрешения по ролям.

```yaml
lesson_writer:
  read:
    - course/audience.md
    - course/course-style.md
    - runs/<run>/01-brief/**
    - runs/<run>/02-research/**
    - project/compliance/facts.md
  write:
    - runs/<run>/03-lecture/**
```

```yaml
project_artifact_author:
  read:
    - project/compliance/**
    - runs/<run>/03-lecture/final.md
    - runs/<run>/05-project/task.md
  write:
    - runs/<run>/05-project/proposed/**
```

Даже если FS не sandboxed, Orchestrator обязан соблюдать эти границы.

---

# 54. Research Policy

```yaml
research:
  local_source_registry_required: true
  web_enabled: true
  require_sources: true

  priority:
    - topic_primary_sources
    - topic_secondary_sources
    - author_materials
    - curated_artifact_examples
    - external_research

  preferred_source_types:
    - standard
    - official_documentation
    - professional_book

  allow_unsourced_common_knowledge: false
  cache_source_packs: true
```

Правила:

1. Researcher сначала разрешает Source Map темы через `source-registry.yaml`.
2. Primary sources имеют приоритет перед secondary.
3. Author materials могут задавать подачу и практический взгляд автора курса, но не должны автоматически перевешивать официальный стандарт в вопросе факта.
4. Artifact examples используются как примеры формы и практики, если metadata не говорит обратного.
5. Внешний web research используется только после назначенных локальных/подключённых источников, если он разрешён Topic Passport.
6. При расхождении авторитетных источников Researcher фиксирует конфликт, а не скрывает его.

Если web недоступен, run использует доступные curated sources и фиксирует ограничение в manifest.

---

# 55. `publisher.yaml`

```yaml
publisher:
  version: "0.2"

revisions:
  lecture: 3
  assessment: 2
  project_artifacts: 3

review:
  block_on:
    - critical
    - major
  max_minor_for_auto_approve: 5

features:
  visuals: false
  google_drive_publish: false
  whole_module_generation: false

  experimental_project_artifacts: true
  experimental_project_auto_merge: false

course_progress:
  auto_update: true
  maintain_human_readable_progress: true
  block_on_major_gap: true
  never_silently_skip_topic: true

curriculum:
  author_controlled: true
  require_topic_passport: true

sources:
  registry_required: true

logging:
  events_jsonl: true
  keep_drafts: true
  keep_reviews: true
```

`experimental_project_auto_merge: false` означает, что ветка Project Artifact в MVP создаёт proposed artifacts и review, но не получает автоматического права менять canonical Compliance project.

---

# 56. Failure Handling

## Invalid structured output

1. сохранить raw output;
2. не продолжать pipeline;
3. один repair attempt;
4. если repair неуспешен → `FAILED`.

## Missing artifact

```text
AGENT_OUTPUT_MISSING
```

Orchestrator ничего не додумывает.

## Reviewer disagreement

Один `major` означает `REJECTED`, даже если остальные reviewers поставили APPROVED.

## Revision limit reached

```text
NEEDS_HUMAN_REVIEW
```

Сохранить последний draft и unresolved issues.

## Research gap

Допускается один дополнительный цикл:

```text
RESEARCH_GAP -> Researcher -> Writer revision
```

---


## Content Critic обнаружил Curriculum GAP

Если в `SCOPE_REVIEW` Critic обнаружил fundamental gap, который нельзя исправить внутри Lesson Brief без изменения авторской программы:

1. сохранить review;
2. зарегистрировать GAP;
3. перевести тему в `blocked` или `needs_revision` согласно severity;
4. не менять Curriculum автоматически;
5. остановить production, если GAP имеет `critical`/`major` и политика `block_on_major_gap=true`.


# 57. Idempotency

Повторный `/publish-topic REQ-STAKEHOLDERS` создаёт новый run и не уничтожает старый.

`output/REQ-STAKEHOLDERS` обновляется только после `COMPLETED`.

---

# 58. Lesson Manifest

```json
{
  "topicId": "REQ-STAKEHOLDERS",
  "runId": "...",
  "status": "COMPLETED",
  "learningOutcomes": [
    "REQ-STAKEHOLDERS-LO1",
    "REQ-STAKEHOLDERS-LO2",
    "REQ-STAKEHOLDERS-LO3"
  ],
  "files": {
    "lecture": "lecture.md",
    "exercises": "exercises.md",
    "answers": "answers.md",
    "sources": "sources.md"
  },
  "projectChanges": [
    "business-analysis/stakeholders.md"
  ],
  "reviews": {
    "subject": "APPROVED",
    "methodology": "APPROVED",
    "editorial": "APPROVED",
    "assessment": "APPROVED",
    "project": "APPROVED"
  }
}
```

---

# 59. Deterministic Quality Gates

Дополнительно к LLM reviews:

- lecture не пустая;
- присутствуют обязательные секции/metadata;
- Compliance упомянут, если brief требует project usage;
- все LO IDs покрыты assessment;
- нет `[TODO]`;
- нет `Lorem ipsum`;
- нет JSON/YAML вместо lecture body;
- нет ссылок на отсутствующие local artifacts.

Не вводить бессмысленные метрики типа «не более 10 списков».

---

# 60. Тон лекции

> Преподаватель разговаривает с умным взрослым новичком — не с ребёнком и не с экспертом.

Запрещён тон:

- снисходительный;
- чрезмерно академический;
- рекламный;
- псевдомотивационный.

Лёгкий юмор допустим.

---

# 61. Рекомендуемая макроструктура лекции

Default, не жёсткий шаблон:

```text
1. Проблемная ситуация / вход в тему
2. Почему это важно аналитику
3. Основная идея
4. Термины
5. Пошаговое объяснение
6. Внешний пример
7. Compliance-кейс
8. Более сложный / граничный случай
9. Типовые ошибки
10. Практическая часть
11. Что изменилось в проекте
12. Итоги
```

Methodologist может менять структуру.

---

# 62. Размер лекции

Не задавать универсальный word count.

В brief:

```yaml
target:
  video_minutes: 45
  depth: detailed
```

Короткая тема может занять 20 минут, сложная — 90.

Цель — понимание, а не выполнение квоты слов.

---

# 63. Пример Run REQ-STAKEHOLDERS (лекция №14 в текущем Curriculum)

Пользователь:

```text
/publish-topic REQ-STAKEHOLDERS
```

1. Orchestrator создаёт run.
2. Context Builder определяет место темы, Progress, GAP и prerequisites.
3. Methodologist создаёт Lesson Brief.
4. Content Critic выполняет `SCOPE_REVIEW`.
5. Если scope неполон — brief отправляется на revision или создаётся GAP.
6. Researcher создаёт Source Pack.
7. Writer пишет лекцию.
8. Subject Reviewer проверяет факты.
9. Content Critic выполняет `COVERAGE_REVIEW`.
10. Methodology Reviewer проверяет обучение.
11. Editorial Reviewer проверяет качество повествования.
12. Writer получает consolidated revision request.
13. После approve создаются assessment и project exercise.
14. Project Artifact Author экспериментально создаёт proposed `business-analysis/stakeholders.md`.
15. Project Reviewer проверяет proposed artifact.
16. Assembler создаёт output.

Ожидаемый тип вводного текста Writer:

> Вас подключили к проекту автоматизации комплаенса. Заказчик уже сформулировал цель: сделать работу с обращениями сотрудников управляемой и прозрачной. Кажется, можно открывать ноутбук и начинать записывать требования. Но у нас пока есть более фундаментальная проблема: мы не знаем, кого спрашивать...

---

# 64. Acceptance Criteria MVP

## Functional

- [ ] Одна команда запускает pipeline.
- [ ] Создаётся уникальный run.
- [ ] Все стадии журналируются.
- [ ] Brief валиден по schema.
- [ ] Content Critic выполняет `SCOPE_REVIEW` до Writer.
- [ ] Major/critical scope issue блокирует переход к Writer.
- [ ] Source Pack создан.
- [ ] Lecture draft создан.
- [ ] Четыре review-функции лекции независимы.
- [ ] Content Critic выполняет `COVERAGE_REVIEW` после Writer.
- [ ] REJECT автоматически ведёт к revision.
- [ ] Revision limit соблюдается.
- [ ] Approved lecture не переписывается Assessment Author.
- [ ] Assessment review отдельный.
- [ ] Project artifact создаётся в proposed.
- [ ] Canonical project меняется только после approve.
- [ ] Формируется diff.
- [ ] Lesson Package попадает в output.
- [ ] Runs сохраняются.
- [ ] Run можно resume после контролируемого сбоя.

## Content Quality

- [ ] Лекция понятна новичку.
- [ ] По ней можно записать видео.
- [ ] Она не состоит преимущественно из списков.
- [ ] Все LO покрыты.
- [ ] Все `mustCover` действительно раскрыты, а не только упомянуты.
- [ ] Нет major/critical content coverage gaps.
- [ ] Есть содержательный Compliance case.
- [ ] Нет неизвестных prerequisites.
- [ ] Нет major/critical issues.
- [ ] Assessment покрывает обязательные LO.
- [ ] Project artifact соответствует уроку.

---

# 65. Automated Tests

## Unit

- state transitions;
- brief scope review transitions;
- lecture coverage review transitions;
- revision counters;
- review aggregation;
- config loading;
- schema validation;
- run creation;
- output publish conditions.

## Integration fixture

```text
REQ-STAKEHOLDERS: NEW -> ... -> COMPLETED
```

С fake-agent outputs.

Дополнительные сценарии:

```text
Incomplete Lesson Brief
-> Content Critic SCOPE_REVIEW major
-> BRIEF_REWORK
-> Scope approved
```

```text
Lecture omits mustCover
-> Content Critic COVERAGE_REVIEW major
-> LECTURE_REWORK
-> Coverage approved
```

```text
Content Critic finds missing future coverage
-> curriculum_gap registered
-> Curriculum unchanged
```

```text
Draft -> Editorial major -> Revision -> Approved
```

```text
3 failed revisions -> NEEDS_HUMAN_REVIEW
```

---

# 66. Prompt / Skill Versioning

Логировать:

```json
{
  "agent": "lesson-writer",
  "promptVersion": "1.0",
  "skill": "write-lesson",
  "skillVersion": "1.0"
}
```

Это нужно для диагностики деградации качества.

---

# 67. Воспроизводимость

Полной deterministic reproducibility от LLM не требуется.

Нужна **audit reproducibility**: восстановить input, config, prompt version, source pack, outputs и reviewer decisions.

---

# 68. Human Review

Human approval не обязателен на каждом этапе v0.3.

Но пользователь должен иметь возможность:

- посмотреть run;
- принять финал;
- отклонить;
- дать собственные замечания;
- запустить дополнительный revision.

Human feedback в будущем может использоваться для калибровки prompts/skills.

---

# 69. Запрет на тихое изменение фактов

Если агент считает canonical project fact ошибочным, он создаёт conflict:

```json
{
  "type": "PROJECT_FACT_CONFLICT",
  "fact": "...",
  "reason": "..."
}
```

Если конфликт существенен → `NEEDS_HUMAN_REVIEW`.

---

# 70. Anti-drift

По мере роста курса добавить:

```text
/glossary-check
/project-consistency-check
/course-consistency-check
```

Примеры drift:

```text
DONE vs COMPLETED
employee vs user
issue vs appeal
```

---

# 71. Почему reviewers разделены

```text
Subject:     Всё написанное правда?
Content:     Ничего фундаментального не забыли?
Methodology: Этому можно научиться?
Editorial:   Это можно нормально читать и слушать?
Project:     Это согласовано с нашей системой?
```

Ошибки этих типов независимы.

Например технически правильная лекция может быть:
- неполной;
- методически непонятной;
- плохо написанной.

Один универсальный reviewer склонен смешивать критерии и хуже диагностирует причину дефекта.

---

# 72. Почему один Writer в MVP

Для обычной лекции достаточно:

```text
1 Writer + independent reviews
```

Два автора увеличат стоимость и сложность без гарантии пользы.

Multi-proposal оставить для задач с реальным пространством решений:

- архитектура;
- сложная БД;
- спорный API;
- интеграционные решения.

---

# 73. Future Multi-Proposal

```text
             TASK
            /    \
        Analyst A Analyst B
            \    /
             \  /
        Decision Reviewer
                |
                v
        Approved proposal
```

Опциональный skill, не default pipeline.

---

# 74. Future Visuals

```text
approved lecture
      |
      v
Visual Director
      |
      v
visual-brief.json
      |
      v
Image Generator
      |
      v
Visual Reviewer
```

Visual Director сначала отвечает: нужна ли картинка вообще.

---

# 75. Future Google Drive

```text
Canonical Lesson Package
        |
        v
Publish Adapter
        |
        +--> Google Docs
        `--> Google Drive files
```

Google Docs не source of truth v0.3.

---

# 76. Future Coding-Agent Final Project

Финальное состояние Compliance project позднее передаётся coding agents.

Это становится проверкой качества системной спецификации:

> достаточно ли хорошо аналитик описал систему, чтобы другой исполнитель смог её реализовать?

Coding pipeline не входит в Course Publisher v0.3.

---

# 77. Порядок реализации в Codex

## Iteration 0 — Editorial foundation

До реализации agent pipeline создать и валидировать:

- `course/curriculum.yaml`;
- минимум первые 15 Topic Passports;
- `course/progress.yaml`;
- пустой `course/gap-registry.yaml`;
- `references/source-registry.yaml`;
- placeholder entries для Wiegers, «Путь аналитика» и author materials;
- skeleton Compliance project.

Цель: Codex уже до запуска агентов знает **что учить, что готово и откуда брать знания**.

---

## Iteration 1 — Skeleton

Создать:

- directory structure;
- configs;
- schemas;
- Run model;
- state machine;
- fake agent adapter.

**Цель:** полный pipeline должен пройти на fixtures **без реальных LLM**.

Это критично: сначала проверяем orchestration, затем качество агентов.

## Iteration 2 — Methodologist + Content Critic + Writer

```text
REQ-STAKEHOLDERS
-> lesson-brief
-> SCOPE_REVIEW
-> approved brief
-> draft.md
```

Подключить Content Critic сначала в режиме `SCOPE_REVIEW`.

## Iteration 3 — Review Panel

Добавить независимые review-функции и revision loop:

- Subject Reviewer;
- Content Critic в режиме `COVERAGE_REVIEW`;
- Methodology Reviewer;
- Editorial Reviewer.

## Iteration 4 — Assessment

Добавить задания, review и LO coverage.

## Iteration 5 — Project Artifact

Добавить before/proposed/review/approved/diff.

## Iteration 6 — Hardening

- schemas;
- failures;
- resume;
- logs;
- tests;
- prompt versioning.

После этого v0.3 считается готовой.

---

# 78. Первая инженерная задача для Codex

```text
Реализуй Course Publisher v0.3 согласно docs/course-publisher-spec-v0.3.md.

Работай итеративно и не начинай с подключения реальных LLM.

Iteration 0 / Editorial foundation:
1. создай структуру каталогов;
2. создай publisher.yaml;
3. создай course/course.yaml;
4. создай course/curriculum.yaml с иерархией:
   Module -> Section -> Topic;
5. перенеси в curriculum baseline программы из этой спецификации;
6. используй стабильные topic_id, не зависящие от номера темы;
7. создай Topic Passport для REQ-STAKEHOLDERS;
8. создай course/progress.yaml;
9. создай пустой course/gap-registry.yaml;
10. создай references/source-registry.yaml;
11. добавь placeholder source entries:
    - Wiegers / Beatty, Software Requirements;
    - книга "Путь аналитика";
    - author materials;
    - artifact examples;
12. создай skeleton project/compliance.

Iteration 1 / Workflow skeleton:
13. реализуй Curriculum Resolver;
14. реализуй Next Topic Resolver;
15. реализуй Course Progress updater;
16. реализуй GAP Registry writer;
17. реализуй Source Registry resolver;
18. реализуй модель Run и state machine;
19. реализуй fake agent adapter;
20. реализуй fake Content Critic с режимами:
    - SCOPE_REVIEW;
    - COVERAGE_REVIEW;
21. добавь schema validation.

Обязательные integration tests:
- "lesson 14" разрешается в REQ-STAKEHOLDERS;
- при completed topics 1..13 команда publish-next выбирает course_order=14;
- blocking major GAP не позволяет молча перейти к 15;
- missing Topic Passport останавливает run и создаёт GAP;
- source_id разрешается через Source Registry;
- incomplete Lesson Brief отклоняется Content Critic и переходит в BRIEF_REWORK;
- incomplete lecture отклоняется Content Critic и переходит в LECTURE_REWORK;
- curriculum_gap от Content Critic записывается в GAP Registry, но Curriculum не меняется;
- successful run переводит тему в completed;
- successful completion пересчитывает next_candidate;
- REQ-STAKEHOLDERS проходит NEW -> COMPLETED на fake agent outputs.

Не подключай реальные LLM до прохождения всех этих тестов.

Не реализуй:
- Google Drive;
- visuals;
- web UI;
- генерацию целого модуля;
- automatic curriculum rewriting.

Project Artifact Author / Reviewer оставить в MVP как experimental flow.
Не разрешай experimental flow автоматически менять canonical Compliance project.
```

---

# 79. Архитектурное решение v0.3 одним абзацем

Course Publisher v0.3 — файловое stateful образовательное издательство под управлением детерминированного Orchestrator. Перед production pipeline существуют четыре обязательных слоя: авторский Curriculum с Topic Passports, управляемая Source / Reference Library, Course Progress & GAP Registry и состояние сквозного Compliance-проекта. Methodologist проектирует Lesson Brief в рамках авторского Topic Passport; Content Critic сначала проверяет полноту самого замысла урока, затем Researcher собирает назначенные источники, Writer пишет лекцию, а четыре независимые review-функции проверяют correctness, completeness, teachability и editorial quality. Orchestrator умеет самостоятельно определять следующую тему, регистрировать GAP и вести progress, но не имеет права самовольно менять Curriculum. После утверждения создаются assessment и экспериментальные project artifacts. Каждый run полностью журналируется, а в `output` попадает только утверждённый Lesson Package.

---

# 80. Главный критерий продукта

Не:

> Все агенты успешно отработали.

А:

> **Получилась ли лекция, которую опытный преподаватель готов использовать для обучения человека с нулевым опытом, не переписывая её с нуля?**

Все технические решения Publisher должны обслуживать эту цель.

---

# 81. Definition of Done первой настоящей лекции

REQ-STAKEHOLDERS успешно выпущена, если:

1. автор курса считает её пригодной для видеоурока;
2. нет существенных фактологических ошибок;
3. новичок понимает, зачем нужны stakeholders;
4. студент после лекции способен выполнить project task;
5. assessment реально проверяет заявленные знания и умения;
6. создан корректный `stakeholders.md`;
7. run history полностью показывает редакционный процесс;
8. повторный запуск не уничтожает историю;
9. результат можно позднее перенести в Google Docs/LMS без перепроектирования pipeline.

---

# 82. Открытые решения, которые намеренно НЕ фиксируются в v0.3

Чтобы спецификация не привязала реализацию к случайной технологии, следующие решения выбираются при реализации:

- язык управляющего кода;
- конкретный API запуска subagents в Codex;
- синхронный или частично параллельный запуск reviewer'ов;
- библиотека JSON Schema validation;
- конкретная структура adapter interfaces;
- формат хранения локального source cache;
- механизм web research;
- конкретные модели для каждой роли.

Главное — соблюдать контракты и pipeline.

---

# 83. Рекомендуемая параллельность

Можно выполнять параллельно после появления lecture draft:

```text
Subject Reviewer
Methodology Reviewer
Editorial Reviewer
```

Они независимы.

После `LECTURE_APPROVED` можно параллельно готовить:

```text
Assessment draft
Project artifact draft
```

но финальный Package Assembler ждёт оба approved результата.

---

# 84. Resume Semantics

`/resume <run_id>` должен:

1. прочитать `run.json`;
2. проверить обязательные artifacts предыдущего состояния;
3. определить первый незавершённый stage;
4. продолжить с него;
5. не повторять успешно завершённые stages без явного `--force`.

---

# 85. Force / Regeneration

Полезные будущие режимы:

```text
/publish-topic REQ-STAKEHOLDERS --force-research
/publish-topic REQ-STAKEHOLDERS --force-lecture
/review-topic REQ-STAKEHOLDERS --editorial
```

В v0.3 необязательны, но архитектура не должна их блокировать.

---

# 86. Ключевая продуктовая метрика v0.3

После нескольких пробных запусков вручную оценивать:

```text
% финальных лекций, которые требуют только мелких человеческих правок
```

Дополнительные диагностические метрики:

- среднее число lecture revisions;
- issues по категориям;
- доля RESEARCH_GAP;
- coverage LO;
- частота HUMAN_REVIEW;
- частота project consistency conflicts.

Не оптимизировать систему по числу токенов раньше качества.

---

**Конец технической спецификации Course Publisher v0.3**

---

# 87. Fixture: Content Critic на теме Sequence Diagram

Этот пример является обязательным behavioral fixture для Content Critic.

## Вход

```yaml
topic:
  id: UML-SEQUENCE
  title: UML. Диаграмма последовательностей

lesson_brief:
  mustCover:
    - назначение Sequence Diagram
    - участники
    - сообщения
    - простой пример
```

## Ожидаемый `SCOPE_REVIEW`

Критик должен заметить, что brief может быть содержательно неполным.

Пример:

```json
{
  "verdict": "REJECTED",
  "issues": [
    {
      "severity": "major",
      "category": "missing_fundamental_concept",
      "location": "mustCover",
      "problem": "В Lesson Brief отсутствует lifeline — базовый элемент нотации Sequence Diagram.",
      "requiredChange": "Добавить lifeline и объяснение его роли."
    },
    {
      "severity": "major",
      "category": "scope_gap",
      "location": "mustCover",
      "problem": "Не определено, где студент изучает combined fragments, как минимум alt/opt/loop.",
      "requiredChange": "Либо включить базовые fragments в текущую тему, либо явно назначить отдельную будущую тему.",
      "gapProposal": {
        "type": "curriculum_gap",
        "suggestedAction": "Проверить необходимость отдельной темы для combined fragments."
      }
    }
  ]
}
```

Важно: fixture не утверждает, что `alt/opt/loop` обязательно должны находиться именно в одной лекции с основами Sequence Diagram.

Он проверяет другое:

> Издательство обязано понимать, **где студент это изучит**, и не должно терять фундаментальные части темы между уроками.

## Ожидаемый `COVERAGE_REVIEW`

Если approved Lesson Brief содержит:

```yaml
mustCover:
  - lifeline
  - activation
  - synchronous message
  - asynchronous message
  - alt
  - opt
  - loop
```

а Writer раскрыл только lifeline, activation и alt, Critic обязан вернуть `REJECTED` с `coverage_gap` для пропущенных обязательных элементов.

---

# 88. Baseline Curriculum Draft v0.3

Этот раздел является **seed-данными для первой реализации**, а не окончательно утверждённой программой курса.

Статус:

```yaml
curriculum_status: draft
ownership: author
agents_can_modify: false
agents_can_report_gaps: true
```

Orchestrator и Methodologist могут обнаруживать проблемы программы и создавать `curriculum_gap`, но не имеют права самостоятельно менять этот baseline.

Текущая рабочая карта:

```text
Модуль 1. О профессии системного аналитика
├── Раздел 1. Роль аналитика
│   ├── Роль системного аналитика и его типовые задачи
│   ├── Жизненный цикл работы аналитика
│   └── Навыки и компетенции системного аналитика
│
└── Раздел 2. БА и СА в одном проекте
    ├── Где заканчивается бизнес-анализ и начинается системный анализ
    └── Какие результаты и артефакты возникают по пути


Модуль 2. Процесс разработки ПО
├── Раздел 1. Команда
│   └── Команда разработки и роли участников
│
├── Раздел 2. Организация разработки
│   └── Модели управления разработкой ПО и гибкие методологии
│
└── Раздел 3. Жизненный цикл ПО
    └── Этапы разработки и жизненного цикла ПО


Модуль 3. Требования к ПО
├── Раздел 1. Основы требований
│   ├── Что такое требования и какие они бывают
│   └── Функциональные и нефункциональные требования
│
├── Раздел 2. Заинтересованные лица и выявление требований
│   ├── Заинтересованные лица
│   └── Способы выявления требований
│
├── Раздел 3. Формализация
│   └── Моделирование и формализация требований
│
├── Раздел 4. Спецификация
│   └── Спецификация и документирование требований
│
└── Раздел 5. Управление
    └── Управление требованиями


Модуль 4. Моделирование процессов и поведения
├── Раздел 1. Сценарии использования
│   └── UML. Диаграмма сценариев использования
│
├── Раздел 2. Процессы
│   └── UML. Диаграмма активности
│
├── Раздел 3. Жизненный цикл объекта
│   └── UML. Диаграмма состояний
│
└── Раздел 4. Взаимодействие компонентов
    └── UML. Диаграмма последовательностей


Модуль 5. Архитектура информационных систем
├── Раздел 1. Что такое информационная система
│   ├── Различные типы ИС: веб, десктоп, мобильные
│   └── Базовая схема client → frontend → backend → database
│
├── Раздел 2. Архитектурные стили
│   ├── Виды архитектуры информационных систем
│   ├── Монолит
│   └── Микросервисы
│
├── Раздел 3. Основные инфраструктурные компоненты
│   ├── Reverse proxy и балансировка — обзор
│   ├── API Gateway — обзор
│   ├── Кэш — обзор
│   └── Файловое/объектное хранилище — обзор
│
├── Раздел 4. Взаимодействие
│   ├── Синхронное взаимодействие
│   └── Асинхронное взаимодействие
│
└── Раздел 5. Безопасность доступа
    ├── Аутентификация
    └── Авторизация


Модуль 6. Интеграции
├── Раздел 1. Основы интеграций
│   └── Способы интеграции систем
│
├── Раздел 2. Синхронные API
│   ├── REST
│   └── SOAP
│
├── Раздел 3. Асинхронный обмен
│   └── Очереди сообщений / Message Queue
│
├── Раздел 4. Другие способы интеграции
│   ├── Интеграция через файлы
│   └── Интеграция через базы данных
│
└── Раздел 5. Проектирование контрактов
    └── Проектирование API и взаимодействия приложений


Модуль 7. Базы данных — базовый уровень
├── Раздел 1. Основы
│   ├── Введение
│   ├── Реляционные базы данных
│   ├── Структура баз данных
│   └── Подключение к PostgreSQL с помощью psql
│
├── Раздел 2. Таблицы и модель данных
│   ├── Таблицы, строки и столбцы
│   ├── Основные типы данных
│   ├── NULL и особые значения
│   ├── Первичный ключ
│   ├── Внешний ключ
│   └── Связи 1:1, 1:N, M:N
│
└── Раздел 3. Базовый SQL
    ├── Язык SQL
    ├── SELECT
    ├── WHERE
    ├── AND / OR
    ├── IN
    ├── BETWEEN
    ├── LIKE
    ├── Сортировка данных
    ├── Ограничение выборки
    ├── Уникальные строки
    └── Базовые JOIN


Модуль 8. Базы данных — продвинутый уровень
├── Раздел 1. Аналитические запросы
│   ├── Агрегатные функции
│   ├── GROUP BY
│   ├── HAVING
│   ├── Более сложные JOIN
│   └── Подзапросы / CTE — на необходимом аналитику уровне
│
├── Раздел 2. Изменение данных
│   ├── INSERT
│   ├── UPDATE
│   └── DELETE
│
├── Раздел 3. DDL и ограничения
│   ├── CREATE TABLE
│   ├── Основные ограничения полей
│   ├── ALTER TABLE
│   ├── Identity / sequence / автоинкремент
│   └── Индексы — концептуально
│
└── Раздел 4. Транзакционность
    ├── Что такое транзакция
    ├── ACID
    ├── COMMIT / ROLLBACK
    ├── Изоляция — базовая модель
    └── Блокировки — концептуально


Модуль 9. Качество требований и спецификации
├── Раздел 1. Критерии качества
│   ├── Атомарность
│   ├── Полнота
│   ├── Однозначность
│   ├── Консистентность
│   ├── Проверяемость
│   ├── Выполнимость
│   └── Краткость без потери смысла
│
├── Раздел 2. Ревью требований
│   ├── Как проводить ревью
│   ├── Типовые дефекты требований
│   └── Critical / Major / Minor замечания
│
└── Раздел 3. Согласованность спецификации
    ├── Traceability
    └── Поиск противоречий между требованиями, моделями, API и данными


Модуль 10. AI для аналитика
└── Статус: PLACEHOLDER
    ├── Содержание проектируется после основной части курса
    └── Предполагаемые направления: LLM, prompts, tools, skills, MCP, агенты, review


Модуль 11. Финальный проект: реализация системы coding agents
└── Раздел 1. Передача спецификации в разработку
    ├── Подготовка итогового пакета спецификации Compliance
    ├── Передача спецификации coding agents
    ├── Разбор неоднозначностей и ошибок реализации
    └── Приёмка результата относительно требований
```

## 86.1. Что Codex должен сделать с baseline

На Iteration 0 Codex должен преобразовать этот раздел в `course/curriculum.yaml`, сохранив:

- иерархию;
- формулировки;
- порядок;
- `draft` status.

Он **не должен** самостоятельно детализировать каждую строку ещё на десятки уроков.

Если конкретная тема слишком широка для одной лекции, Methodologist создаёт GAP:

```text
type: curriculum_gap
suggested_action: split_topic
```

Решение о разделении принимает автор курса.

## 86.2. Нумерация лекций

`course_order` присваивается автоматически по текущему порядку тем curriculum.

Номер — presentation attribute.

Стабильным идентификатором остаётся `topic_id`.

Пример:

```yaml
id: REQ-STAKEHOLDERS
course_order: 14   # пример; может измениться после окончательной сборки curriculum
```

До окончательной стабилизации программы пользователь может ссылаться и по названию темы.

---

# 89. Source Availability и Source GAP

Наличие записи в Source Registry не означает, что файл уже доступен.

Рекомендуемая модель:

```yaml
- id: SRC-WIEGERS-REQUIREMENTS
  type: book
  title: Software Requirements
  availability: missing

  location:
    type: local_file
    path: references/books/requirements/software-requirements.pdf
```

Статусы:

```text
available
missing
unreadable
restricted
deprecated
```

Если Topic Passport требует primary source со статусом `missing`, Orchestrator / Source Resolver:

1. не притворяется, что книга прочитана;
2. создаёт `source_gap`;
3. либо останавливает production, если источник обязательный;
4. либо продолжает на secondary sources только если политика темы это разрешает.

Пример GAP:

```yaml
id: GAP-SOURCE-001
type: source_gap
severity: major
topic_id: REQ-STAKEHOLDERS
source_id: SRC-WIEGERS-REQUIREMENTS
description: Primary source зарегистрирован, но локальный файл отсутствует.
```

Это позволяет заранее занести в Registry:

- Wiegers / Beatty;
- «Путь аналитика»;
- другие книги;
- документы автора;

а физически добавлять материалы постепенно.

---

# 90. Orchestrator как выпускающий редактор

Orchestrator должен вести курс между пользовательскими сессиями через файлы состояния.

Пользователь не обязан помнить:

- какой урок был последним;
- какой run завершился;
- какие темы были отклонены;
- где обнаружился GAP.

Типичный сценарий:

```text
Пользователь:
"Продолжай курс"

Orchestrator:
curriculum.yaml
      +
progress.yaml
      +
gap-registry.yaml
      |
      v
Последняя completed: topic #13
Следующая candidate: topic #14
Blocking GAPs: none
      |
      v
Запуск production run #14
```

После успешного выпуска:

```text
topic #14 -> completed
last_completed -> #14
next_candidate -> #15
PROGRESS.md -> обновлён
```

Если выпуск не завершён:

```text
topic #14 -> needs_revision / blocked
next_candidate не перепрыгивает молча к #15
```

Это и есть долговременная «редакционная память» Publisher.

