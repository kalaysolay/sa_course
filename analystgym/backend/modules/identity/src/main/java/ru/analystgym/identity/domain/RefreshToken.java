package ru.analystgym.identity.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/**
 * Refresh-сессия. Храним только SHA-256 хэш токена: утечка базы
 * не должна давать готовые сессии. Сам токен живёт в httpOnly-cookie.
 * Выход — флаг revoked; «выйти везде» — revoke всех записей пользователя.
 */
@Entity
@Table(name = "refresh_tokens")
public class RefreshToken {

    @Id
    @Column(name = "token_hash")
    private String tokenHash;

    @Column(name = "session_id", nullable = false, unique = true)
    private UUID sessionId;

    @Column(name = "family_id", nullable = false)
    private UUID familyId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id")
    private User user;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(nullable = false)
    private boolean revoked = false;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected RefreshToken() {
    }

    public RefreshToken(String tokenHash, UUID sessionId, UUID familyId, User user, Instant expiresAt) {
        this.tokenHash = tokenHash;
        this.sessionId = sessionId;
        this.familyId = familyId;
        this.user = user;
        this.expiresAt = expiresAt;
    }

    @PrePersist
    void onCreate() {
        createdAt = Instant.now();
    }

    /** Просрочка проверяется по времени, а не удалением строк (нужно для аудита). */
    public boolean isAlive(Instant now) {
        return !revoked && expiresAt.isAfter(now);
    }

    public void revoke() {
        this.revoked = true;
    }

    public String getTokenHash() {
        return tokenHash;
    }

    /** Идентификатор пары токенов; её отзыв немедленно закрывает и access. */
    public UUID getSessionId() {
        return sessionId;
    }

    /** Цепочка ротаций одного входа; выход закрывает и уже обновлённые токены этого входа. */
    public UUID getFamilyId() {
        return familyId;
    }

    public User getUser() {
        return user;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }

    public boolean isRevoked() {
        return revoked;
    }
}
