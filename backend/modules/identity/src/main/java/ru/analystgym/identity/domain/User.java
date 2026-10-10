package ru.analystgym.identity.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/**
 * Пользователь платформы. Роль — одной строкой (STUDENT по умолчанию;
 * методистов/ревьюеров назначает SUPERADMIN или bootstrap-список
 * app.admin-emails при регистрации). Составных прав нет — проверка
 * через Roles.require (Фаза 3, UC-A01).
 * Email всегда храним в нижнем регистре (приводит сервис, UNIQUE страхует).
 */
@Entity
@Table(name = "users")
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.AUTO)
    private UUID id;

    @Column(nullable = false, unique = true)
    private String email;

    /** Только bcrypt-хэш, открытого пароля нет нигде (см. миграции). */
    @Column(name = "password_hash", nullable = false)
    private String passwordHash;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    private String role = "STUDENT";

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected User() {
        // Конструктор для Hibernate: сущность создаём через of(...).
    }

    private User(String email, String passwordHash, String name) {
        this.email = email;
        this.passwordHash = passwordHash;
        this.name = name;
    }

    /** Единственный способ создать пользователя: email уже нормализован вызывающим. */
    public static User of(String email, String passwordHash, String name) {
        return new User(email, passwordHash, name);
    }

    @PrePersist
    void onCreate() {
        createdAt = Instant.now();
    }

    public UUID getId() {
        return id;
    }

    public String getEmail() {
        return email;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public void setPasswordHash(String passwordHash) {
        this.passwordHash = passwordHash;
    }

    public String getName() {
        return name;
    }

    public String getRole() {
        return role;
    }

    /** Назначение роли — только из админки или bootstrap (см. AuthService). */
    public void setRole(String role) {
        this.role = role;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
