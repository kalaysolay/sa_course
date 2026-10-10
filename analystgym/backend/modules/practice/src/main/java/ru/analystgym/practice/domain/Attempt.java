package ru.analystgym.practice.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.type.SqlTypes;
import com.fasterxml.jackson.databind.JsonNode;

/**
 * Попытка решения: снапшот вкладок + снапшот рубрики на момент отправки
 * (рубрику потом могут поправить — история не должна «плыть», ADR-06).
 * Статусы: queued | in_review | reviewed | failed.
 */
@Entity
@Table(name = "attempts")
public class Attempt {

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "task_id", nullable = false)
    private String taskId;

    /** Снапшот вкладок решения. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    private JsonNode tabs;

    /** Снапшот рубрики задачи на момент submit. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "rubric_snapshot", nullable = false, columnDefinition = "jsonb")
    private JsonNode rubricSnapshot;

    /** Ключ идемпотентности (заголовок Idempotency-Key), null — без гарантий. */
    @Column(name = "idempotency_key")
    private String idempotencyKey;

    @Column(nullable = false)
    private String status = "in_review";

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public Attempt() {
    }

    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
        this.id = id;
    }

    public UUID getUserId() {
        return userId;
    }

    public void setUserId(UUID userId) {
        this.userId = userId;
    }

    public String getTaskId() {
        return taskId;
    }

    public void setTaskId(String taskId) {
        this.taskId = taskId;
    }

    public JsonNode getTabs() {
        return tabs;
    }

    public void setTabs(JsonNode tabs) {
        this.tabs = tabs;
    }

    public JsonNode getRubricSnapshot() {
        return rubricSnapshot;
    }

    public void setRubricSnapshot(JsonNode rubricSnapshot) {
        this.rubricSnapshot = rubricSnapshot;
    }

    public String getIdempotencyKey() {
        return idempotencyKey;
    }

    public void setIdempotencyKey(String idempotencyKey) {
        this.idempotencyKey = idempotencyKey;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
