package ru.analystgym.quality.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

/**
 * Жалоба на ревью (UC-S08 → UC-Q03). Разбор заканчивается либо правкой
 * контента, либо ответом студенту — оба исхода фиксируются в resolution.
 * Статусы: new | review | resolved | rejected.
 */
@Entity
@Table(name = "complaints")
public class Complaint {

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "attempt_id", nullable = false)
    private UUID attemptId;

    @Column(name = "task_id", nullable = false)
    private String taskId;

    @Column(nullable = false)
    private int score;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String reason = "";

    /** Фрагмент решения на момент жалобы (замораживаем, решение могут доработать). */
    @Column(nullable = false, columnDefinition = "TEXT")
    private String excerpt = "";

    @Column(name = "prompt_version", nullable = false)
    private String promptVersion = "mock-agents/v1";

    @Column(nullable = false)
    private String status = "new";

    @Column(columnDefinition = "TEXT")
    private String resolution;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public Complaint() {
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

    public UUID getAttemptId() {
        return attemptId;
    }

    public void setAttemptId(UUID attemptId) {
        this.attemptId = attemptId;
    }

    public String getTaskId() {
        return taskId;
    }

    public void setTaskId(String taskId) {
        this.taskId = taskId;
    }

    public int getScore() {
        return score;
    }

    public void setScore(int score) {
        this.score = score;
    }

    public String getReason() {
        return reason;
    }

    public void setReason(String reason) {
        this.reason = reason;
    }

    public String getExcerpt() {
        return excerpt;
    }

    public void setExcerpt(String excerpt) {
        this.excerpt = excerpt;
    }

    public String getPromptVersion() {
        return promptVersion;
    }

    public void setPromptVersion(String promptVersion) {
        this.promptVersion = promptVersion;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getResolution() {
        return resolution;
    }

    public void setResolution(String resolution) {
        this.resolution = resolution;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
