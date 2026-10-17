package ru.analystgym.practice.domain;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import com.fasterxml.jackson.databind.JsonNode;
import ru.analystgym.review.LlmClient;

/** Журнал реальных обращений, включая невалидные ответы и неопределённый исход при потере воркера. */
@Entity
@Table(name = "review_calls")
public class ReviewCall {
    @Id private UUID id;
    @Column(name = "attempt_id", nullable = false) private UUID attemptId;
    @Column(name = "lease_token", nullable = false) private UUID leaseToken;
    @Column(name = "agent_id", nullable = false) private String agentId;
    @Column(nullable = false) private String provider;
    @Column(name = "requested_model", nullable = false) private String requestedModel;
    @Column(name = "actual_model") private String actualModel;
    @Column(name = "prompt_key", nullable = false) private String promptKey;
    @Column(name = "prompt_version", nullable = false) private int promptVersion;
    @Column(nullable = false) private String status = "started";
    @JdbcTypeCode(SqlTypes.JSON) @Column(nullable = false, columnDefinition = "jsonb") private JsonNode request;
    @Column(columnDefinition = "TEXT") private String response;
    @JdbcTypeCode(SqlTypes.JSON) @Column(name = "parsed_answer", columnDefinition = "jsonb") private JsonNode parsedAnswer;
    @Column(name = "reserved_tokens", nullable = false) private int reservedTokens;
    @Column(name = "charged_tokens", nullable = false) private int chargedTokens;
    @Column(name = "input_tokens") private Integer inputTokens;
    @Column(name = "output_tokens") private Integer outputTokens;
    @Column(columnDefinition = "TEXT") private String error;
    @Column(name = "started_at", nullable = false) private Instant startedAt = Instant.now();
    @Column(name = "finished_at") private Instant finishedAt;

    public ReviewCall() { }

    public ReviewCall(UUID attemptId, UUID leaseToken, String agentId, String provider, String model,
                      String promptKey, int promptVersion, JsonNode request, int reservedTokens) {
        this.id = UUID.randomUUID(); this.attemptId = attemptId; this.leaseToken = leaseToken;
        this.agentId = agentId; this.provider = provider; this.requestedModel = model;
        this.promptKey = promptKey; this.promptVersion = promptVersion; this.request = request;
        this.reservedTokens = reservedTokens; this.chargedTokens = reservedTokens;
    }

    /** Известный расход учитывается и при невалидном JSON; без usage остаётся весь резерв. */
    public void answered(LlmClient.LlmAnswer answer, JsonNode parsed, String error) {
        actualModel = answer.model(); response = answer.text(); parsedAnswer = parsed;
        inputTokens = answer.inputTokens(); outputTokens = answer.outputTokens();
        long used = (long) Math.max(0, inputTokens) + Math.max(0, outputTokens);
        // Невозможный usage не должен откатывать журнал и создавать бесплатные бесконечные повторы.
        chargedTokens = inputTokens >= 0 && outputTokens >= 0 && used > 0 && used <= reservedTokens ? (int) used : reservedTokens;
        status = parsed == null ? "invalid" : "accepted";
        this.error = error; finishedAt = Instant.now();
    }

    /** Сетевой сбой/смерть процесса не доказывают отсутствие расхода: резерв не возвращаем. */
    public void failed(String error, boolean unknown) {
        this.error = error; status = unknown ? "unknown" : "failed"; finishedAt = Instant.now();
    }

    public UUID getId() { return id; }
    public UUID getAttemptId() { return attemptId; }
    public UUID getLeaseToken() { return leaseToken; }
    public String getAgentId() { return agentId; }
    public String getProvider() { return provider; }
    public String getRequestedModel() { return requestedModel; }
    public String getActualModel() { return actualModel; }
    public String getPromptKey() { return promptKey; }
    public int getPromptVersion() { return promptVersion; }
    public String getStatus() { return status; }
    public JsonNode getRequest() { return request; }
    public String getResponse() { return response; }
    public JsonNode getParsedAnswer() { return parsedAnswer; }
    public int getReservedTokens() { return reservedTokens; }
    public int getChargedTokens() { return chargedTokens; }
    public Integer getInputTokens() { return inputTokens; }
    public Integer getOutputTokens() { return outputTokens; }
    public String getError() { return error; }
    public Instant getStartedAt() { return startedAt; }
    public Instant getFinishedAt() { return finishedAt; }
}
