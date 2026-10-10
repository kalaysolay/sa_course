package ru.analystgym.admin.domain;

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
 * Ревизия задачи: каждое сохранение методистом = новая запись со снапшотом
 * всего тела. Тихо не правим (принцип 3 product-spec): история видна,
 * попытки ссылаются на замороженный снапшот рубрики.
 */
@Entity
@Table(name = "task_revisions")
public class TaskRevision {

    @Id
    private UUID id;

    @Column(name = "task_id", nullable = false)
    private String taskId;

    @Column(nullable = false)
    private int rev;

    @Column(name = "author_id")
    private UUID authorId;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    private JsonNode snapshot;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    public TaskRevision() {
    }

    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
        this.id = id;
    }

    public String getTaskId() {
        return taskId;
    }

    public void setTaskId(String taskId) {
        this.taskId = taskId;
    }

    public int getRev() {
        return rev;
    }

    public void setRev(int rev) {
        this.rev = rev;
    }

    public UUID getAuthorId() {
        return authorId;
    }

    public void setAuthorId(UUID authorId) {
        this.authorId = authorId;
    }

    public JsonNode getSnapshot() {
        return snapshot;
    }

    public void setSnapshot(JsonNode snapshot) {
        this.snapshot = snapshot;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
