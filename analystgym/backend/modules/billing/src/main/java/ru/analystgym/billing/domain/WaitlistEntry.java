package ru.analystgym.billing.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.CreationTimestamp;

/**
 * Заявка на предзапись Pro: изучаем спрос до запуска платежей.
 * Только email + нормализованный телефон (+7XXXXXXXXXX), без денег.
 */
@Entity
@Table(name = "waitlist")
public class WaitlistEntry {

    @Id
    private UUID id;

    @Column(nullable = false)
    private String email = "";

    @Column(nullable = false)
    private String phone = "";

    @Column(nullable = false)
    private String source = "";

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    public WaitlistEntry() {
    }

    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
        this.id = id;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getPhone() {
        return phone;
    }

    public void setPhone(String phone) {
        this.phone = phone;
    }

    public String getSource() {
        return source;
    }

    public void setSource(String source) {
        this.source = source;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
