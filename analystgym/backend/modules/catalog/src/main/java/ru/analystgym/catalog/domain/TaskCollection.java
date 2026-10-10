package ru.analystgym.catalog.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * Подборка задач (домен: интеграции, SQL, ...). Состав — упорядоченный
 * массив id: порядок задаёт методист, join-таблица с позициями для MVP
 * избыточна (пересмотрим, если понадобятся персональные подборки).
 */
@Entity
@Table(name = "\"collections\"")
public class TaskCollection {

    @Id
    private String id;

    @Column(nullable = false)
    private String title;

    @Column(nullable = false)
    private String tagline = "";

    @Column(nullable = false)
    private String description = "";

    @Column(nullable = false)
    private String icon = "";

    @Column(nullable = false)
    private String audience = "";

    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(name = "task_ids", nullable = false)
    private String[] taskIds = new String[0];

    @Column(nullable = false)
    private boolean active = true;

    /** Публичный для тестов и инструментов; в проде сущность собираем сеттерами. */
    public TaskCollection() {
    }

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getTagline() {
        return tagline;
    }

    public void setTagline(String tagline) {
        this.tagline = tagline;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getIcon() {
        return icon;
    }

    public void setIcon(String icon) {
        this.icon = icon;
    }

    public String getAudience() {
        return audience;
    }

    public void setAudience(String audience) {
        this.audience = audience;
    }

    public String[] getTaskIds() {
        return taskIds;
    }

    public void setTaskIds(String[] taskIds) {
        this.taskIds = taskIds;
    }

    public boolean isActive() {
        return active;
    }

    public void setActive(boolean active) {
        this.active = active;
    }
}
