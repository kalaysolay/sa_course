package ru.analystgym.review;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

/**
 * Вызов LLM через OpenAI-совместимый /chat/completions в JSON-режиме.
 * Ключ читается из env при каждом вызове (ротация без рестарта),
 * в памяти дольше запроса не живёт, в логи не попадает.
 */
public class HttpLlmClient implements LlmClient {

    private final String baseUrl;
    private final String defaultModel;
    private final String keyEnv;
    private final HttpClient http;
    private final ObjectMapper mapper;

    public HttpLlmClient(String baseUrl, String defaultModel, String keyEnv, ObjectMapper mapper) {
        String base = baseUrl == null ? "" : baseUrl.trim();
        this.baseUrl = base.endsWith("/") ? base.substring(0, base.length() - 1) : base;
        this.defaultModel = defaultModel;
        this.keyEnv = keyEnv;
        this.http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
        this.mapper = mapper;
    }

    /** Базовый URL для тестов со стабом (по умолчанию — боевое API). */
    protected String apiUrl() {
        return baseUrl + "/chat/completions";
    }

    /** Точка подмены только для локального HTTP-стаба в тестах. */
    protected String apiKey() { return keyEnv == null || keyEnv.isBlank() ? "" : System.getenv(keyEnv); }

    @Override
    public LlmAnswer call(LlmRequest request) {
        String key = apiKey();
        if (key == null || key.isBlank()) {
            throw new LlmClient.LlmFailedException("llm_key_missing", false);
        }
        String model = request.model() == null || request.model().isBlank()
                ? defaultModel : request.model();
        ArrayNode messages = mapper.createArrayNode();
        if (request.system() != null && !request.system().isBlank()) {
            ObjectNode system = mapper.createObjectNode();
            system.put("role", "system");
            system.put("content", request.system());
            messages.add(system);
        }
        ObjectNode message = mapper.createObjectNode();
        message.put("role", "user");
        message.put("content", request.user());
        messages.add(message);
        ObjectNode format = mapper.createObjectNode();
        format.put("type", "json_object");
        ObjectNode body = mapper.createObjectNode();
        body.put("model", model);
        body.set("messages", messages);
        body.set("response_format", format);
        body.put("temperature", 0.2);
        body.put("max_tokens", request.maxOutputTokens());
        HttpRequest httpRequest;
        try {
            httpRequest = HttpRequest.newBuilder(URI.create(apiUrl()))
                    .timeout(Duration.ofSeconds(Math.max(10, request.timeoutSeconds())))
                    .header("Authorization", "Bearer " + key)
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)))
                    .build();
            HttpResponse<byte[]> response = http.send(httpRequest, ignored -> boundedBody());
            if (response.statusCode() == 429) {
                throw new LlmClient.LlmFailedException("provider_rate_limited");
            }
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new LlmClient.LlmFailedException("provider_status_" + response.statusCode(), response.statusCode() >= 500);
            }
            JsonNode node = mapper.readTree(response.body());
            if (node == null || !node.isObject()) throw new LlmClient.LlmFailedException("provider_invalid_envelope", false);
            JsonNode choices = node.get("choices");
            String text = choices == null || !choices.isArray() || choices.isEmpty() ? ""
                    : choices.get(0).path("message").path("content").asText("");
            int inTokens = tokens(node.path("usage").path("prompt_tokens"));
            int outTokens = tokens(node.path("usage").path("completion_tokens"));
            // Даже пустое сообщение отдаём валидатору с usage: уже оплаченный вызов не теряет учёт.
            return new LlmAnswer(text, node.path("model").asText(model), inTokens, outTokens);
        } catch (IOException | InterruptedException e) {
            if (e instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            throw new LlmClient.LlmFailedException("provider unreachable");
        }
    }

    private static int tokens(JsonNode value) {
        if (value.isMissingNode() || value.isNull()) return 0;
        return value.isIntegralNumber() && value.canConvertToInt() ? value.intValue() : -1;
    }

    /** Ограничиваем память до декодирования JSON, сохраняя timeout всего HTTP-запроса. */
    private static HttpResponse.BodySubscriber<byte[]> boundedBody() {
        var delegate = HttpResponse.BodySubscribers.ofByteArray();
        return new HttpResponse.BodySubscriber<>() {
            private java.util.concurrent.Flow.Subscription subscription;
            private long bytes;
            public java.util.concurrent.CompletionStage<byte[]> getBody() { return delegate.getBody(); }
            public void onSubscribe(java.util.concurrent.Flow.Subscription s) { subscription = s; delegate.onSubscribe(s); }
            public void onNext(java.util.List<java.nio.ByteBuffer> items) {
                for (var item : items) bytes += item.remaining();
                if (bytes > 1_048_576) {
                    subscription.cancel(); delegate.onError(new IOException("provider_response_too_large"));
                } else delegate.onNext(items);
            }
            public void onError(Throwable error) { delegate.onError(error); }
            public void onComplete() { delegate.onComplete(); }
        };
    }
}
