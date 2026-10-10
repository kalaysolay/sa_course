package ru.analystgym.practice.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import com.fasterxml.jackson.databind.JsonNode;

/**
 * Готовое ревью попытки (1:1 к попытке, только append — поверх не правим).
 * Быстрые поля grade/score дублируют JSON для списков и истории.
 */
@Entity
@Table(name = "reviews")
public class Review {

    @Id
    @Column(name = "attempt_id", nullable = false)
    private UUID attemptId;

    @Column(nullable = false)
    private String engine = "mock-agents/v1";

    @Column(name = "grade_code", nullable = false)
    private int gradeCode;

    @Column(nullable = false)
    private int score;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    private JsonNode result;

    /** Провайдер/модель LLM (у mock пусто, движок говорит сам). */
    @Column(nullable = false)
    private String provider = "";

    @Column(nullable = false)
    private String model = "";

    /** Версии промптов ревью (ключ → v): воспроизводимость из коробки. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "prompt_versions", nullable = false, columnDefinition = "jsonb")
    private JsonNode promptVersions;

    @Column(name = "input_tokens", nullable = false)
    private int inputTokens;

    @Column(name = "output_tokens", nullable = false)
    private int outputTokens;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    public Review() {
    }

    public UUID getAttemptId() {
        return attemptId;
    }

    public void setAttemptId(UUID attemptId) {
        this.attemptId = attemptId;
    }

    public String getEngine() {
        return engine;
    }

    public void setEngine(String engine) {
        this.engine = engine;
    }

    public int getGradeCode() {
        return gradeCode;
    }

    public void setGradeCode(int gradeCode) {
        this.gradeCode = gradeCode;
    }

    public int getScore() {
        return score;
    }

    public void setScore(int score) {
        this.score = score;
    }

    public JsonNode getResult() {
        return result;
    }

    public void setResult(JsonNode result) {
        this.result = result;
    }

    public String getProvider() {
        return provider;
    }

    public void setProvider(String provider) {
        this.provider = provider;
    }

    public String getModel() {
        return model;
    }

    public void setModel(String model) {
        this.model = model;
    }

    public JsonNode getPromptVersions() {
        return promptVersions;
    }

    public void setPromptVersions(JsonNode promptVersions) {
        this.promptVersions = promptVersions;
    }

    public int getInputTokens() {
        return inputTokens;
    }

    public void setInputTokens(int inputTokens) {
        this.inputTokens = inputTokens;
    }

    public int getOutputTokens() {
        return outputTokens;
    }

    public void setOutputTokens(int outputTokens) {
        this.outputTokens = outputTokens;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
