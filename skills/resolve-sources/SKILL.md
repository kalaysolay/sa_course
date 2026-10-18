# Скилл: разрешить источники (resolve-sources)

## Назначение

По Topic Passport собрать срез `references/source-registry.yaml` и проверить availability.

## Поведение

- Primary `missing` + политика block/major → блокирующий GAP, production не стартует.
- Primary `missing` + `continue_with_secondary_and_register_minor_gap` → minor GAP, продолжаем на secondary/external.
- Результат кладётся в `00-input/source-registry-slice.json` при `/prepare-codex-*`.
