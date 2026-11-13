# ARCH-CACHE — Source Pack (карта утверждений → источники)

Проверка URL: 11.11.2026, все fetch-ились напрямую (webfetch), содержимое получено.

## Verified — ключевые утверждения

### SRC-NGINX-CONTENT-CACHING — F5 NGINX, «NGINX Content Caching» (Admin Guide)
URL: https://docs.nginx.com/nginx/admin-guide/content-cache/content-caching/ — verified 11.11.2026
- «Кэш хранит копии ответов и отвечает клиенту без повторного запроса к источнику» → Overview.
- «У копии задаётся срок валидности; после него данные снова берут у источника» → proxy_cache_valid, раздел Limit or Disable Caching.
- «Кэш сбрасывают принудительно (PURGE), чтобы не отдавать старое вперемешку с новым» → Purge Content From The Cache.
Оговорка: вендорский гайд — в лекцию только поведение (срок, сброс), не директивы.

### SRC-REDIS-CLIENT-SIDE-CACHING — Redis Docs, «Client-side caching introduction»
URL: https://redis.io/docs/latest/develop/clients/client-side-caching — verified 11.11.2026
- «Доступ к кэшу быстрее обращения к базе по сети; снижает нагрузку на базу» → intro.
- «При изменении данных сервер шлёт клиентам инвалидационные сообщения; копии выбрасываются и перечитываются из источника» → Updating the cache when the data changes.
- «Кэш выгоден, когда малая часть данных запрашивается намного чаще остальных» → intro (Pareto).
Оговорка: механику трекинга клиента не переносить; берём «кэш у приложения + механизм обновления копий».

### SRC-REDIS-SOLUTIONS-CACHING — redis.io «Caching» (solutions page, updated 2026-04-16)
URL: https://redis.io/solutions/caching — verified 11.11.2026
- Перечень кэш-паттернов (cache-aside, query caching, write-behind, write-through) → подтверждение, что паттерны — отдельный слой теории (в doNotCover брифа).

### SRC-AWS-CACHING-OVERVIEW — AWS «Caching Overview»
URL: https://aws.amazon.com/caching/ — verified 11.11.2026
- Определение кэша → "What is Caching?": "high-speed data storage layer which stores a subset of data… served up faster than… primary storage location".
- hit/miss/TTL → Best Practices: "A successful cache results in a high hit rate… A cache miss occurs when the data fetched was not present in the cache. Controls such as TTLs (Time to live)".
- Кэши на многих уровнях: таблица Client-Side (browser) / DNS / Web (CDN, reverse proxies) / App / Database → источник «где живут кэши» (LO2).
- Выгоды: скорость и разгрузка базы → Benefits ("Reduce Database Cost", "Eliminate Database Hotspots").

### SRC-AWS-CLOUDFRONT-CACHE-KEY — AWS CloudFront Developer Guide, «Understand the cache key»
URL: https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/understanding-the-cache-key.html — verified 11.11.2026
- hit: "A cache hit occurs when a viewer request generates the same cache key… and the object… is in the edge location's cache and valid" + выгоды (меньше нагрузка на origin, меньше задержка).
- miss: "If the requested object is not in the cache (a cache miss), then CloudFront sends a request to the origin to get the object".

### SRC-IETF-RFC9111 — RFC 9111 «HTTP Caching» (IETF Standards Track, June 2022, obsoletes RFC 7234)
URL: https://www.rfc-editor.org/rfc/rfc9111.html — verified 11.11.2026
- Определение HTTP-кэша: "local store of response messages and the subsystem that controls storage, retrieval, and deletion"; private vs shared → §1.
- Свежесть: fresh/stale, freshness lifetime, "response_is_fresh = (freshness_lifetime > current_age)" → §4.2 — первоисточник идеи «время жизни» в HTTP.
- Директивы-запреты no-cache/no-store; Validation (§4.3) и Invalidating Stored Responses (§4.4) — опоры антикейса «кэш ради кэша» и сброса кэша.
- Авторизованные ответы общий кэш не переиспользует без явного разрешения → §3.5 — опора «персональные данные не кэшируем» в Compliance.
Оговорка: технический текст; в лекции пересказ идей без цитат, ссылка словами «стандарт HTTP».

## LO → источники
LO1 → AWS определение+benefits, Redis intro, nginx Overview; LO2 → AWS таблица уровней, RFC §1; LO3 → AWS hit/miss, CloudFront; LO4 → RFC §4.2, nginx срок+purge, Redis invalidation; LO5 → Redis Pareto, RFC §3.5 (персональное), nginx срок/сброс; LO6 → RFC stale, Redis invalidation, оговорка Карлтон ниже.

## Не цитировать / не привлекалось
- https://redis.io/glossary/cache/ и https://redis.io/glossary/caching/ — 404 (webfetch 11.11.2026).
- Microsoft Learn — не потребовался (закрыто AWS/RFC), отдельно не проверялся.
- Цитата Фила Карлтона (cache invalidation and naming things) — приписываемая, первоисточника нет: в лекции только вскользь с пометкой «приписываемая».

## Gaps
- SRC-AUTHOR-MATERIALS — missing: авторских материалов по кэшу нет; не ссылаться, не выдавать за прочитанное.
- Профильного источника по кэшу в реестре нет (срез: только SRC-AUTHOR-MATERIALS); внешние добавлены решением автора 11.11.2026.
- Источники вендорские (nginx, Redis, AWS) + стандарт IETF: только общий обзор, без тарифов/цифр конфигурации (doNotCover).
