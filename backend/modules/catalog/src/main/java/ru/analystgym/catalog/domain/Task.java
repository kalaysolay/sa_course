package ru.analystgym.catalog.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.type.SqlTypes;

/**
 * Задача каталога, сводка для списка (Фаза 1).
 * Полные тела (условие, рубрика, эталон) приедут отдельной миграцией
 * в Фазе 2 — тогда же появится сервисный слой; пока контроллеры читают
 * репозитории напрямую (осознанно, см. catalog/build.gradle).
 */
@Entity
@Table(name = "tasks")
public class Task {

    @Id
    private String id;

    @Column(nullable = false)
    private String title;

    /** Ссылка строкой, не объектом: уровень подтягивает словарь отдельным запросом. */
    @Column(name = "level_id", nullable = false)
    private String levelId;

    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(nullable = false)
    private String[] tags = new String[0];

    @Column(nullable = false)
    private String status = "published";

    @Column(name = "time_min", nullable = false)
    private int timeMin = 30;

    @Column(name = "solved_rate", nullable = false)
    private int solvedRate = 0;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    /** Публичный для тестов и инструментов; в проде сущность собираем сеттерами. */
    public Task() {
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

    public String getLevelId() {
        return levelId;
    }

    public void setLevelId(String levelId) {
        this.levelId = levelId;
    }

    public String[] getTags() {
        return tags;
    }

    public void setTags(String[] tags) {
        this.tags = tags;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public int getTimeMin() {
        return timeMin;
    }

    public void setTimeMin(int timeMin) {
        this.timeMin = timeMin;
    }

    public int getSolvedRate() {
        return solvedRate;
    }

    public void setSolvedRate(int solvedRate) {
        this.solvedRate = solvedRate;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
