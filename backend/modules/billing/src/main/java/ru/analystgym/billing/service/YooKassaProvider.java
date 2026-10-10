package ru.analystgym.billing.service;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import java.util.UUID;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/**
 * Клиент ЮKassa (Create payment API v3): Basic-авторизация shopId:secret,
 * ключ идемпотентности — orderId, захват сразу (capture=true).
 * Секреты — только из env (YOOKASSA_SHOP_ID/YOOKASSA_SECRET_KEY),
 * в БД и логах их нет. Без настроенных ключей бин не создаётся
 * (см. BillingConfig): заказы тогда идут через fake-провайдер.
 */
public class YooKassaProvider implements PaymentProvider {

    private static final String API = "https://api.yookassa.ru/v3/payments";

    private final String auth;
    private final HttpClient http;
    private final ObjectMapper mapper;

    public YooKassaProvider(String shopId, String secretKey, ObjectMapper mapper) {
        String credentials = shopId + ":" + secretKey;
        this.auth = "Basic " + Base64.getEncoder()
                .encodeToString(credentials.getBytes(StandardCharsets.UTF_8));
        this.http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
        this.mapper = mapper;
    }

    /** Базовый URL для тестов со стабом (по умолчанию — боевое API). */
    protected String apiUrl() {
        return API;
    }

    @Override
    public String name() {
        return "yookassa";
    }

    @Override
    public CreatedPayment createPayment(UUID orderId, int amountMinor, String currency,
                                        String description, String returnUrl) {
        ObjectNode amount = mapper.createObjectNode();
        amount.put("value", String.format(java.util.Locale.ROOT, "%d.00", amountMinor));
        amount.put("currency", currency);
        ObjectNode confirmation = mapper.createObjectNode();
        confirmation.put("type", "redirect");
        confirmation.put("return_url", returnUrl);
        ObjectNode body = mapper.createObjectNode();
        body.set("amount", amount);
        body.put("capture", true);
        body.put("description", description.length() > 128 ? description.substring(0, 128) : description);
        body.set("confirmation", confirmation);
        HttpRequest request;
        try {
            request = HttpRequest.newBuilder(URI.create(apiUrl()))
                    .timeout(Duration.ofSeconds(20))
                    .header("Authorization", auth)
                    .header("Idempotence-Key", orderId.toString())
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)))
                    .build();
            HttpResponse<String> response =
                    http.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (response.statusCode() != 200 && response.statusCode() != 201) {
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "payment provider error");
            }
            JsonNode node = mapper.readTree(response.body());
            String id = node.path("id").asText("");
            String url = node.path("confirmation").path("confirmation_url").asText("");
            String status = node.path("status").asText("pending");
            if (id.isEmpty() || url.isEmpty()) {
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "bad provider response");
            }
            return new CreatedPayment(id, url, PaymentProvider.normalizeStatus(status));
        } catch (IOException | InterruptedException e) {
            if (e instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "provider unreachable");
        }
    }
}
