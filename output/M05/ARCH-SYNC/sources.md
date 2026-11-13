# Source pack — ARCH-SYNC (Синхронное взаимодействие)

Проверка URL: 11.11.2026 (webfetch, полный текст). Ниже — карта утверждений → источники.

## SRC-HTTP-9110 — RFC 9110 «HTTP Semantics» (IETF, STD 97, июнь 2022)

URL: https://www.rfc-editor.org/rfc/rfc9110.html — доступен, verified 11.11.2026

- **Идемпотентность** (§9.2.2): метод идемпотентен, если «the intended effect on the server of multiple identical requests … is the same as the effect for a single such request» → повтор даёт тот же эффект, что и один запрос.
- **Не все методы идемпотентны**: PUT, DELETE и безопасные — идемпотентны, POST — нет; «A client SHOULD NOT automatically retry a request with a non-idempotent method unless it has some means to know that the request semantics are actually idempotent» → почему «создать обращение» нельзя повторять без гарантий.
- **Запрос/ответ и цепочка**: §1.3, §3.4 — сообщение это запрос или ответ; §3.7 — запрос идёт через посредников (шлюз/прокси), ответ возвращается по той же цепочке; §15.5.9 (408 Request Timeout) и §15.6.5 (504 Gateway Timeout) — коды таймаута.

## SRC-GRPC-CORE — gRPC «Core concepts, architecture and lifecycle»

URL: https://grpc.io/docs/what-is-grpc/core-concepts/ — доступен, verified 11.11.2026

- **Синхронный вызов** (§Synchronous vs. asynchronous): «Synchronous RPC calls that block until a response arrives from the server» → синхронность = блокировка до ответа.
- **Таймаут** (§Deadlines/Timeouts): клиент задаёт срок ожидания; по истечении вызов завершается ошибкой `DEADLINE_EXCEEDED`, сервер может проверить, истёк ли срок.
- **Граница отмены** (§RPC termination, §Cancelling an RPC): клиент и сервер «make independent and local determinations of the success of the call», изменения до отмены не откатываются → таймаут вызывающего не прекращает работу на другой стороне. Опора для границы аналогии «телефонный звонок».

## SRC-AWS-TIMEOUTS — AWS Builders' Library «Timeouts, retries, and backoff with jitter»

URL: https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/ — доступен, verified 11.11.2026

- **Ожидание занимает ресурс**: клиент, пока ждёт, держит память, потоки, соединения; «Timeouts are the maximum amount of time that a client waits for a request to complete» → определение таймаута и цена ожидания.
- **Повторы усиливают отказ**: «A retry can increase the load on the system being called, if the system is already failing»; решение — backoff (пауза растёт) и jitter (случайный сдвиг, чтобы клиенты не били одновременно) → «шторм повторов».
- **Повтор и побочные эффекты**: «APIs with side effects aren't safe to retry unless they provide idempotency»; повторы в слоях мультиплицируются (числа не переносить) → идемпотентность и «повторять в одном слое».

## SRC-AZURE-RETRY — Azure Architecture Center «Retry pattern»

URL: https://learn.microsoft.com/en-us/azure/architecture/patterns/retry — доступен, verified 11.11.2026

- **Повтор после паузы**: кратковременные сбои (потеря связи, занятость сервиса, таймаут) обычно проходят; стратегии — отмена, повтор сразу, повтор с задержкой.
- **Двойной эффект**: «a service might receive the request, process the request successfully, but fail to send a response» → повтор выполнит операцию второй раз.
- **Что показывать пользователю**: для интерактивного приложения лучше быстро завершиться и показать «please try again later», чем долго повторять → требование «что пользователь видит при таймауте».

## SRC-MDN-HTTP — MDN «Обзор протокола HTTP» (рус.)

URL: https://developer.mozilla.org/ru/docs/Web/HTTP/Overview — доступен, verified 11.11.2026

- **Клиент спросил — сервер ответил**: HTTP — клиент-серверный протокол; сообщения клиента — запросы, сообщения сервера — ответы.
- **Посредники**: между клиентом и сервером стоят прокси, шлюзы и кэши, ответ идёт по тому же маршруту → опора для схемы «цепочка вызовов» и суммирования времени ответа.

## Недоступные / не цитировать

- `grpc.io/docs/guides/retry/` и `developer.mozilla.org/ru/docs/Web/HTTP/What_is_HTTP` — в этом прогоне не проверялись; взята страница MDN «Обзор протокола HTTP».
- Профильных источников в реестре курса нет; `SRC-AUTHOR-MATERIALS` — availability `missing`. Внешние источники разрешены решением автора от 11.11.2026 и не выдаются за авторские.

## Пробелы и оговорки

- **Каскад таймаутов** (внутренний таймаут меньше внешнего) — прямой формулировки в источниках нет; это следствие суммирования времени ответа и своего предела ожидания у каждого звена. Давать как вывод из разбора цепочки, а не как цитату.
- **«Залипший вызов блокирует очередь»** — источники подтверждают удержание ресурсов во время ожидания, но не формулируют блокировку очереди. Давать как следствие ограниченности ресурсов.
- **Идемпотентность по RFC 9110 — свойство HTTP-методов**, а не абстрактных операций: перенос на прикладной уровень допустим, но нельзя приписывать RFC такую формулировку.
- Числа из примеров AWS (243×, p99.9, «20 миллисекунд») в лекцию не переносятся — без вендорских цифр.
