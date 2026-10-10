package ru.analystgym.practice.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import java.io.Serializable;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.type.SqlTypes;
import com.fasterxml.jackson.databind.JsonNode;

/**
 * Черновик решения: один на пользователя и задачу (upsert).
 * Вкладки храним JSONB как есть — структуру проверяет сервис.
 */
@Entity
@Table(name = "drafts")
@IdClass(Draft.DraftId.class)
public class Draft {

    @Id
    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Id
    @Column(name = "task_id", nullable = false)
    private String taskId;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    private JsonNode tabs;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public Draft() {
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

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    /** Составной ключ (user_id, task_id) для @IdClass. */
    public static class DraftId implements Serializable {
        private UUID userId;
        private String taskId;

        public DraftId() {
        }

        public DraftId(UUID userId, String taskId) {
            this.userId = userId;
            this.taskId = taskId;
        }

        @Override
        public boolean equals(Object other) {
            if (this == other) {
                return true;
            }
            if (!(other instanceof DraftId that)) {
                return false;
            }
            return Objects.equals(userId, that.userId) && Objects.equals(taskId, that.taskId);
        }

        @Override
        public int hashCode() {
            return Objects.hash(userId, taskId);
        }
    }
}
