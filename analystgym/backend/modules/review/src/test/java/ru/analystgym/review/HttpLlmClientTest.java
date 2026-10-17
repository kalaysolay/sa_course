package ru.analystgym.review;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

/** HTTP-ошибки различаются по возможности повтора; размер ответа ограничен до парсинга. */
class HttpLlmClientTest {
    @Test void временныеИПостоянныеОшибкиИБольшойОтветОбрабатываютсяБезСекретов() throws Exception {
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        var status = new java.util.concurrent.atomic.AtomicInteger(429);
        var content = new java.util.concurrent.atomic.AtomicReference<>("x".repeat(1_048_577));
        server.createContext("/chat/completions", exchange -> {
            exchange.getRequestBody().readAllBytes();
            byte[] body = (status.get() == 200 ? content.get() : "private-provider-message").getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(status.get(), body.length);
            try (var output = exchange.getResponseBody()) { output.write(body); }
        });
        server.start();
        try {
            var client = new HttpLlmClient("http://127.0.0.1:" + server.getAddress().getPort(), "stub", "", new ObjectMapper()) {
                @Override protected String apiKey() { return "local-only"; }
            };
            var request = new LlmClient.LlmRequest("stub", "s", "u", 10, 10);
            for (int code : new int[] {429, 502, 401, 200}) {
                status.set(code);
                assertThatThrownBy(() -> client.call(request)).isInstanceOfSatisfying(LlmClient.LlmFailedException.class, e -> {
                    assertThat(e.retryable()).isEqualTo(code != 401);
                    assertThat(e.getMessage()).doesNotContain("local-only", "private-provider-message");
                });
            }
            content.set("{\"choices\":[],\"usage\":{\"prompt_tokens\":9,\"completion_tokens\":1},\"model\":\"actual\"}");
            var empty = client.call(request);
            assertThat(empty.text()).isEmpty(); assertThat(empty.inputTokens()).isEqualTo(9);
            assertThat(empty.outputTokens()).isEqualTo(1); assertThat(empty.model()).isEqualTo("actual");
        } finally { server.stop(0); }
    }
}
