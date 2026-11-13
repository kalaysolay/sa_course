# Source Pack — ARCH-API-GATEWAY

Проверка ссылок: 11.11.2026, webfetch, контент получен по каждому URL из списка «Источники». Разрешение: решение автора от 11.11.2026 (внешние исследования разрешены). В реестре профильных источников нет, `SRC-AUTHOR-MATERIALS` — `availability: missing`.

## Источники

| ID | Источник | URL | Статус |
|----|----------|-----|--------|
| SRC-AWS-APIMGW | Amazon API Gateway Developer Guide, «What is Amazon API Gateway?» | https://docs.aws.amazon.com/apigateway/latest/developerguide/welcome.html | verified 11.11.2026 |
| SRC-AZURE-APIM | Microsoft Learn, «Azure API Management — Overview and key concepts» | https://learn.microsoft.com/en-us/azure/api-management/api-management-key-concepts | verified 11.11.2026 |
| SRC-KONG-GW | Kong Docs, «Kong Gateway» (обзорная страница) | https://docs.konghq.com/gateway/latest/ | verified 11.11.2026 |
| SRC-NGINX-RPX | NGINX Docs, «NGINX Reverse Proxy» (admin guide) | https://docs.nginx.com/nginx/admin-guide/web-server/reverse-proxy/ | verified 11.11.2026 |
| SRC-NGINX-PLUS | NGINX (F5), обзорная страница NGINX Plus (описание позиционирования) | https://www.nginx.com/products/nginx-plus/ | verified 11.11.2026; перенаправляет на обзорную страницу продуктов NGINX, не на профильную статью |

## Карта «утверждение → источник»

- **A1.** API Gateway — «front door» ко backend-сервисам; сам обрабатывает traffic management, authorization и access control, monitoring, API version management → **SRC-AWS-APIMGW**.
- **A2.** В Azure API Management запросы клиентов сначала проходят через gateway (data plane), который служит фасадом (facade) к backend-сервисам; обеспечивает единую настройку routing, security, throttling, caching, observability; в состав API Management входят gateway, management plane, developer portal → **SRC-AZURE-APIM**.
- **A3.** Gateway проверяет API keys и другие credentials (JWT, сертификаты), применяет usage quotas и rate limits, может преобразовывать запросы/ответы (policies), опционально кэширует ответы и формирует логи/метрики/трейсы → **SRC-AZURE-APIM**.
- **A4.** Прямая формулировка связи: «An API gateway is a reverse proxy that lets you manage, configure, and route requests to your APIs» — gateway строится на reverse proxy и добавляет управление и конфигурацию → **SRC-KONG-GW** (ключ к границе gateway vs reverse proxy в уроке).
- **A5.** Расширяемость плагинами (аутентификация, мониторинг); rate limiting по IP / API key / Consumer; балансировка с health checks и circuit breakers → **SRC-KONG-GW**.
- **A6.** Reverse proxy: передаёт запрос на указанный сервер и возвращает ответ; маршрутизация по `location` (`proxy_pass`); «common use of a reverse proxy is to provide load balancing» → **SRC-NGINX-RPX** (опора урок 28 и граница «proxy хватает»).
- **A7.** Вендорская позиция про соседство ролей: NGINX Plus описан как «load balancer, reverse proxy, web server, content cache, and API gateway» → **SRC-NGINX-PLUS**.

## Недоступные / не цитировать

- https://docs.nginx.com/api-management/ — 404 (11.11.2026).
- https://blog.nginx.org/blog/deploying-nginx-as-an-api-gateway-part-1 — 404.
- https://www.f5.com/company/blog/nginx/deploying-nginx-open-source-as-an-api-gateway-part-1-exposing-managing — 404.
- https://www.f5.com/company/blog/nginx/deploying-nginx-as-an-api-gateway-part-1-traffic-management — 404.
- https://www.nginx.com/blog/deploying-nginx-as-an-api-gateway-part-1-traffic-management/ — перенаправление на продуктовую страницу; архивная статья не восстановлена.

Вывод: позицию nginx в лекции подтверждать только SRC-NGINX-RPX и SRC-NGINX-PLUS; заявлять «nginx так позиционирует API gateway» по живым страницам выше.

## Оговорки для лектора

- Все источники — вендорские первичные документы; в лекции использовать их только как примеры («как это называют AWS/Azure/Kong»), не привязываясь к конкретным конфигурациям.
- Цифры лимитов и тарифов из документации не переносить; говорить о типовых возможностях.
- Смешение терминов: throttling (AWS), quotas (Azure), rate limiting (Kong) — в лекции унифицировать на русские типовые названия: «лимиты», «квоты».
