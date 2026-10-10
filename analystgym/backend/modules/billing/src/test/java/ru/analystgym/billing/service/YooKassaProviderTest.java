package ru.analystgym.billing.service;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Клиент кассы против локального стаба (встроенный JDK HttpServer,
 * без новых зависимостей): проверяем авторизацию, ключ идемпотентности
 * и разбор ответа. Настоящие ключи для этого не нужны.
 */
class YooKassaProviderTest {

    private HttpServer stub;

    @AfterEach
    void stop() {
        if (stub != null) {
            stub.stop(0);
        }
    }

    @Test
    void созданиеПлатежаШлётКлючИЧитаетОтвет() throws IOException {
        // given: стаб кассы, проверяющий заголовки;
        var seen = new java.util.concurrent.ConcurrentHashMap<String, String>();
        stub = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        stub.createContext("/v3/payments", exchange -> {
            seen.put("auth", String.join(",", exchange.getRequestHeaders().getOrDefault(
                    "Authorization", java.util.List.of(""))));
            seen.put("idem", String.join(",", exchange.getRequestHeaders().getOrDefault(
                    "Idempotence-Key", java.util.List.of(""))));
            byte[] body = ("{\"id\":\"pay-123\",\"status\":\"pending\","
                    + "\"confirmation\":{\"confirmation_url\":\"https://pay/confirm\"}}")
                    .getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, body.length);
            try (OutputStream out = exchange.getResponseBody()) {
                out.write(body);
            }
        });
        stub.start();
        YooKassaProvider provider = new YooKassaProvider("shop", "secret", new ObjectMapper()) {
            @Override
            protected String apiUrl() {
                return "http://127.0.0.1:" + stub.getAddress().getPort() + "/v3/payments";
            }
        };

        // when: создаём платёж;
        var created = provider.createPayment(UUID.randomUUID(), 990, "RUB", "Pro", "https://x/return");

        // then: id и ссылка из ответа, авторизация и ключ на месте.
        assertThat(created.providerPaymentId()).isEqualTo("pay-123");
        assertThat(created.confirmationUrl()).isEqualTo("https://pay/confirm");
        assertThat(seen.get("auth")).startsWith("Basic ");
        assertThat(seen.get("idem")).isNotBlank();
    }

    @Test
    void ошибкаКассыНеПроходитТихо() throws IOException {
        // given: касса отвечает 401;
        stub = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        stub.createContext("/v3/payments", exchange -> {
            exchange.sendResponseHeaders(401, -1);
            exchange.close();
        });
        stub.start();
        YooKassaProvider provider = new YooKassaProvider("shop", "bad", new ObjectMapper()) {
            @Override
            protected String apiUrl() {
                return "http://127.0.0.1:" + stub.getAddress().getPort() + "/v3/payments";
            }
        };

        // when/then: заказ не создаём, отдаём 502, а не 500.
        assertThatThrownBy(() -> provider.createPayment(UUID.randomUUID(), 990, "RUB", "Pro", "https://x/return"))
                .isInstanceOf(ResponseStatusException.class);
    }
}
