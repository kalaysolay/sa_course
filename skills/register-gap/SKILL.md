# Скилл: зарегистрировать GAP (register-gap)

## Назначение

Записать проблему в `course/gap-registry.yaml` без изменения curriculum.

## Когда

- нет Topic Passport;
- недоступен обязательный primary source;
- обнаружен curriculum/source/prerequisite gap на ревью или preflight.

## Правила

- Orchestrator/агент может создать GAP, но не может сам править программу курса.
- Severity `critical`/`major` блокирует тему; `minor` — фиксируется и не останавливает run по умолчанию.
