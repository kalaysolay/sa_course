package ru.analystgym.review.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

/**
 * LLM-провайдер (OpenAI-совместимый API). Ключ НЕ храним: только имя
 * env-переменной (keyEnv), значение читается из окружения в рантайме.
 */
@Entity
@Table(name = "providers")
public class Provider {

    @Id
    private String id;

    @Column(nullable = false)
    private String name = "";

    @Column(name = "base_url", nullable = false)
    private String baseUrl = "";

    @Column(nullable = false)
    private String model = "";

    @Column(name = "key_env", nullable = false)
    private String keyEnv = "";

    @Column(name = "timeout_sec", nullable = false)
    private int timeoutSec = 120;

    @Column(nullable = false)
    private boolean enabled = true;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public Provider() {
    }

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getBaseUrl() {
        return baseUrl;
    }

    public void setBaseUrl(String baseUrl) {
        this.baseUrl = baseUrl;
    }

    public String getModel() {
        return model;
    }

    public void setModel(String model) {
        this.model = model;
    }

    public String getKeyEnv() {
        return keyEnv;
    }

    public void setKeyEnv(String keyEnv) {
        this.keyEnv = keyEnv;
    }

    public int getTimeoutSec() {
        return timeoutSec;
    }

    public void setTimeoutSec(int timeoutSec) {
        this.timeoutSec = timeoutSec;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
