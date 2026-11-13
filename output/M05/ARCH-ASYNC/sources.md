# Source pack: ARCH-ASYNC (урок 33, M05-S04 «Взаимодействие»)

Статус проверки: все URL проверены `webfetch` 11.11.2026. External research разрешён решением автора от 11.11.2026; ничего не выдаётся за авторские материалы.

## Источники (SRC-*)

- **SRC-01 Apache Kafka docs (Introduction)** — https://kafka.apache.org/intro — verified 11.11.2026.
- **SRC-02 Apache Kafka documentation** — https://kafka.apache.org/documentation/ — verified 11.11.2026.
- **SRC-03 AWS SNS Developer Guide** — https://docs.aws.amazon.com/sns/latest/dg/welcome.html — verified 11.11.2026.
- **SRC-04 Azure Service Bus overview** — https://learn.microsoft.com/en-us/azure/service-bus-messaging/service-bus-messaging-overview — verified 11.11.2026 (страница обновлена 2026-08-31).
- **SRC-05 RabbitMQ docs, Reliability and Data Safety** — https://www.rabbitmq.com/docs/reliability — verified 11.11.2026 (v4.4).
- **SRC-06 AWS SQS Developer Guide (visibility timeout)** — https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-visibility-timeout.html — verified 11.11.2026.

## Карта утверждений → источники

| Утверждение (для лекции) | Источник | Привязка |
| --- | --- | --- |
| Издатель не ждёт подписчика; производители и потребители полностью разделены; producent не ждёт потребителей | SRC-01, SRC-03 | «producers never need to wait for consumers»; SNS: «Publishers communicate asynchronously with subscribers» |
| Очередь хранит сообщение до тех пор, пока получатель не сможет его получить; доставка pull-режимом | SRC-04 | «Queues store messages until the receiving application is available»; «Messages are delivered in pull mode» |
| Топики/подписки — связь 1:*n* (издатель → несколько подписчиков) | SRC-04 | «Topics and subscriptions. Enable 1:*n* relationships between publishers and subscribers» |
| At-least-once доставка; без подтверждений — только at-most-once; подтверждение = получение + передача ответственности | SRC-05 | «Use of acknowledgements guarantees at least once delivery» |
| Потеря подтверждения → возможны дубликаты; обработчик должен дедублицировать или быть идемпотентным; флаг redelivered | SRC-05 | «consumer applications will need to perform deduplication or handle incoming messages in an idempotent manner» |
| Повторная отправка того же сообщения → дубли отбрасываются (duplicate detection) | SRC-04 | «Duplicate detection … discards any duplicate copies» |
| SQS: сообщение невидимо пока обрабатывается (visibility timeout), удаляется вручную после обработки (ack), при необработке возвращается в очередь; стандартная модель — at-least-once, нет абсолютной гарантии против повторной доставки | SRC-06 | «there's no absolute guarantee that a message won't be delivered more than once» |
| Fanout: одно сообщение в тему → много endpoints (SQS, Lambda, HTTP, email, SMS); A2A и A2P | SRC-03 | «The Fanout scenario … replicated and pushed to multiple endpoints» |

## Недоступные / не цитировать

- **AWS SQS Developer Guide (корень)** — https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/ — webfetch возвращал пустой ответ при двух попытках (11.11.2026); цитировать нельзя. Конкретная страница visibility timeout доступна (SRC-06).
- **SRC-AUTHOR-MATERIALS** — missing в реестре (папка `references/author-materials` отсутствует); авторских материалов курса нет.

## Примечания

- `SRC-AUTHOR-MATERIALS` — missing; первичных профильных источников в реестре нет. Внешние источники — только первичные официальные документации, проверенные webfetch; факты не придуманы, недоступности фиксированы честно.
- «Eventual consistency» объясняется по-русски, цитировать не требуется. Цифры SLA/таймаутов/тарифов не приводить — базовый уровень обзора.
