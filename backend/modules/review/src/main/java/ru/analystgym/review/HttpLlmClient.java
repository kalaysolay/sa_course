package ru.analystgym.review;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

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

    @Override
    public LlmAnswer call(LlmRequest request) {
        String key = keyEnv == null || keyEnv.isBlank() ? "" : System.getenv(keyEnv);
        if (key == null || key.isBlank()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "llm key missing");
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
        HttpRequest httpRequest;
        try {
            httpRequest = HttpRequest.newBuilder(URI.create(apiUrl()))
                    .timeout(Duration.ofSeconds(Math.max(10, request.timeoutSeconds())))
                    .header("Authorization", "Bearer " + key)
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)))
                    .build();
            HttpResponse<String> response =
                    http.send(httpRequest, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (response.statusCode() == 429) {
                throw new LlmClient.LlmFailedException("rate limited");
            }
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new LlmClient.LlmFailedException("provider status " + response.statusCode());
            }
            JsonNode node = mapper.readTree(response.body());
            JsonNode choices = node.get("choices");
            if (choices == null || !choices.isArray() || choices.isEmpty()) {
                throw new LlmClient.LlmFailedException("empty choices");
            }
            String text = choices.get(0).path("message").path("content").asText("");
            int inTokens = node.path("usage").path("prompt_tokens").asInt(0);
            int outTokens = node.path("usage").path("completion_tokens").asInt(0);
            if (text.isBlank()) {
                throw new LlmClient.LlmFailedException("empty content");
            }
            return new LlmAnswer(text, model, inTokens, outTokens);
        } catch (IOException | InterruptedException e) {
            if (e instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            throw new LlmClient.LlmFailedException("provider unreachable");
        }
    }
}
