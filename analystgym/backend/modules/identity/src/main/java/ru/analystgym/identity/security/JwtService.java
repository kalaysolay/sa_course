package ru.analystgym.identity.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.Optional;
import java.util.UUID;
import javax.crypto.SecretKey;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Подпись и проверка JWT. Секрет — только из env ({@code app.jwt.secret}),
 * дефолт laminate лишь чтобы приложение стартовало локально без секрета;
 * в проде без настоящего секрета стартовать нельзя (см. README деплоя).
 * Алгоритм фиксирован HS256 — negotiate с клиентом не ведём.
 */
@Component
public class JwtService {

    private final SecretKey key;
    private final long accessTtlSeconds;
    private final long refreshTtlSeconds;

    public JwtService(
            @Value("${app.jwt.secret:dev-secret-change-me-in-prod-00000000}") String secret,
            @Value("${app.jwt.access-ttl-seconds:900}") long accessTtlSeconds,
            @Value("${app.jwt.refresh-ttl-seconds:2592000}") long refreshTtlSeconds) {
        // HMAC-SHA256 требует ключ ≥256 бит (32 байта), иначе падаем сразу при старте,
        // а не первым загадочным 401 в проде.
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.accessTtlSeconds = accessTtlSeconds;
        this.refreshTtlSeconds = refreshTtlSeconds;
    }

    /** Короткоживущий токен для API (15 минут по умолчанию). */
    public String accessToken(UUID userId, String role, UUID sessionId) {
        Instant now = Instant.now();
        return Jwts.builder()
                .subject(userId.toString())
                .id(UUID.randomUUID().toString())
                .claim("type", "access")
                .claim("sid", sessionId.toString())
                .claim("role", role)
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plusSeconds(accessTtlSeconds)))
                .signWith(key)
                .compact();
    }

    /** Долгоживущий токен для httpOnly-cookie (30 дней); в БД храним его SHA-256. */
    public String refreshToken(UUID userId, UUID sessionId) {
        Instant now = Instant.now();
        return Jwts.builder()
                .subject(userId.toString())
                .id(UUID.randomUUID().toString())
                .claim("type", "refresh")
                .claim("sid", sessionId.toString())
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plusSeconds(refreshTtlSeconds)))
                .signWith(key)
                .compact();
    }

    public long refreshTtlSeconds() {
        return refreshTtlSeconds;
    }

    /** Принимает только access: refresh и старые токены без назначения запрещены. */
    public Optional<Claims> parseAccess(String token) {
        return parse(token, "access");
    }

    /** Принимает только refresh с корректными идентификаторами пользователя и сессии. */
    public Optional<Claims> parseRefresh(String token) {
        return parse(token, "refresh");
    }

    private Optional<Claims> parse(String token, String type) {
        try {
            Claims claims = Jwts.parser()
                    .verifyWith(key)
                    .build()
                    .parseSignedClaims(token)
                    .getPayload();
            if (!type.equals(claims.get("type")) || claims.getId() == null
                    || claims.getSubject() == null || claims.get("sid") == null) {
                return Optional.empty();
            }
            UUID.fromString(claims.getSubject());
            UUID.fromString(claims.get("sid", String.class));
            return Optional.of(claims);
        } catch (JwtException | IllegalArgumentException e) {
            return Optional.empty();
        }
    }
}
