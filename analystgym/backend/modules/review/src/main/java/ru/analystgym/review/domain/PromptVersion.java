package ru.analystgym.review.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

/**
 * Версия промпта: active (100% трафика) / canary (>0%) / archived (0).
 * Трафик — доля запросов ревью на редакцию; сумма по промпту должна быть 100%.
 * Железное правило: каждое ревью знает версию промпта (иначе тюнинг вслепую).
 */
@Entity
@Table(name = "prompt_versions")
public class PromptVersion {

    @Id
    private UUID id;

    @Column(name = "prompt_key", nullable = false)
    private String promptKey = "";

    @Column(nullable = false)
    private int v;

    @Column(nullable = false)
    private String status = "archived";

    @Column(nullable = false)
    private int traffic;

    @Column(nullable = false)
    private String model = "";

    @Column(nullable = false, columnDefinition = "TEXT")
    private String changelog = "";

    @Column(nullable = false, columnDefinition = "TEXT")
    private String text = "";

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public PromptVersion() {
    }

    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
        this.id = id;
    }

    public String getPromptKey() {
        return promptKey;
    }

    public void setPromptKey(String promptKey) {
        this.promptKey = promptKey;
    }

    public int getV() {
        return v;
    }

    public void setV(int v) {
        this.v = v;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public int getTraffic() {
        return traffic;
    }

    public void setTraffic(int traffic) {
        this.traffic = traffic;
    }

    public String getModel() {
        return model;
    }

    public void setModel(String model) {
        this.model = model;
    }

    public String getChangelog() {
        return changelog;
    }

    public void setChangelog(String changelog) {
        this.changelog = changelog;
    }

    public String getText() {
        return text;
    }

    public void setText(String text) {
        this.text = text;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
