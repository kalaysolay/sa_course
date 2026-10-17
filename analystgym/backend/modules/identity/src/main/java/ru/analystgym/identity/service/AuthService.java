package ru.analystgym.identity.service;

import java.security.SecureRandom;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ru.analystgym.identity.domain.PasswordResetToken;
import ru.analystgym.identity.domain.RefreshToken;
import ru.analystgym.identity.domain.User;
import ru.analystgym.identity.repo.PasswordResetRepository;
import ru.analystgym.identity.repo.RefreshTokenRepository;
import ru.analystgym.identity.repo.UserRepository;
import ru.analystgym.identity.security.JwtService;
import ru.analystgym.identity.security.PasswordPolicy;
import ru.analystgym.notify.service.NotificationService;

/**
 * Сценарии входа: регистрация, логин, ротация refresh, выход, сброс пароля.
 * Email нормализуем в lower-case на входе — UNIQUE в БД лишь страховка.
 * Сырые refresh-токены возвращаем один раз (в куку); в БД — только SHA-256.
 */
@Service
public class AuthService {

    private final UserRepository users;
    private final RefreshTokenRepository sessions;
    private final PasswordResetRepository resets;
    private final PasswordEncoder passwords;
    private final JwtService jwt;
    private final long refreshTtlSeconds;
    private final NotificationService notify;
    private final SecureRandom random = new SecureRandom();

    public AuthService(
            UserRepository users,
            RefreshTokenRepository sessions,
            PasswordResetRepository resets,
            PasswordEncoder passwords,
            JwtService jwt,
            @Value("${app.jwt.refresh-ttl-seconds:2592000}") long refreshTtlSeconds,
            NotificationService notify) {
        this.users = users;
        this.sessions = sessions;
        this.resets = resets;
        this.passwords = passwords;
        this.jwt = jwt;
        this.refreshTtlSeconds = refreshTtlSeconds;
        this.notify = notify;
    }

    /** Пара токенов для установки в куки. Access — JWT, refresh — JWT + запись в БД. */
    public record TokenPair(String access, String refresh) {
    }

    @Transactional
    public User register(String email, String rawPassword, String name) {
        PasswordPolicy.validate(rawPassword);
        String norm = normalize(email);
        users.findByEmail(norm).ifPresent(u -> {
            throw new EmailTakenException();
        });
        User user = User.of(norm, passwords.encode(rawPassword), name.trim());
        return users.save(user);
    }

    @Transactional
    public TokenPair login(String email, String rawPassword) {
        UUID userId = users.findIdByEmail(normalize(email)).orElseThrow(InvalidCredentialsException::new);
        User user = lockUser(userId);
        if (!passwords.matches(rawPassword, user.getPasswordHash())) {
            throw new InvalidCredentialsException();
        }
        return issuePair(user, UUID.randomUUID());
    }

    /**
     * Вход через внешнего провайдера (Google): аккаунт находится по email
     * или создаётся; парольный вход такому аккаунту недоступен — вместо
     * хэша лежит случайный мусор (подобрать нельзя, проверить нельзя).
     * Доверяем только подтверждённой почте (проверяет вызывающий).
     */
    @Transactional
    public OAuthLogin oauthLogin(String email, String name) {
        String norm = normalize(email);
        User user = users.findByEmail(norm).orElse(null);
        if (user == null) {
            user = User.of(norm, passwords.encode("oauth-" + UUID.randomUUID()), name.trim());
            users.save(user);
        } else {
            user = lockUser(user.getId());
        }
        return new OAuthLogin(user, issuePair(user, UUID.randomUUID()));
    }

    /** Пользователь + свежая пара токенов для установки в куки. */
    public record OAuthLogin(User user, TokenPair pair) {
    }

    /** Ротация: старый refresh отзывается, выдаётся новая пара (защита от переиспользования). */
    @Transactional
    public TokenPair refresh(String rawRefresh) {
        var claims = jwt.parseRefresh(rawRefresh).orElseThrow(InvalidSessionException::new);
        User user = lockUser(UUID.fromString(claims.getSubject()));
        RefreshToken session = sessions
                .findByTokenHashAndRevokedFalse(TokenHash.sha256(rawRefresh))
                .filter(s -> s.isAlive(Instant.now()))
                .filter(s -> s.getSessionId().toString().equals(claims.get("sid", String.class)))
                .filter(s -> user.getId().equals(s.getUser().getId()))
                .orElseThrow(InvalidSessionException::new);
        session.revoke();
        return issuePair(user, session.getFamilyId());
    }

    @Transactional
    public void logout(String rawRefresh) {
        if (rawRefresh == null) {
            return;
        }
        var claims = jwt.parseRefresh(rawRefresh).orElse(null);
        if (claims == null) {
            return;
        }
        lockUser(UUID.fromString(claims.getSubject()));
        sessions.findById(TokenHash.sha256(rawRefresh)).ifPresent(session ->
                sessions.findByFamilyIdAndRevokedFalse(session.getFamilyId()).forEach(RefreshToken::revoke));
    }

    /** «Выйти везде»: отзываем все живые сессии пользователя. */
    @Transactional
    public void logoutAll(UUID userId) {
        lockUser(userId);
        List<RefreshToken> alive = sessions.findByUserIdAndRevokedFalse(userId);
        alive.forEach(RefreshToken::revoke);
    }

    /**
     * Сброс через notify-канал: в dev письмо уходит в лог (там же токен
     * для тестов), в проде — тем же вызовом через SMTP-провайдера.
     * В ответах API токена нет и не будет.
     */
    @Transactional
    public String requestReset(String email) {
        User found = users.findByEmail(normalize(email)).orElseThrow(InvalidCredentialsException::new);
        User user = lockUser(found.getId());
        resets.invalidateForUser(user.getId());
        String raw = randomToken();
        Instant expires = Instant.now().plusSeconds(3600);
        resets.save(new PasswordResetToken(TokenHash.sha256(raw), user, expires));
        notify.passwordReset(user.getId(), user.getEmail(), raw);
        return raw;
    }

    @Transactional
    public void confirmReset(String rawToken, String newPassword) {
        PasswordPolicy.validate(newPassword);
        String tokenHash = TokenHash.sha256(rawToken == null ? "" : rawToken);
        UUID userId = resets.userIdOf(tokenHash).orElseThrow(InvalidSessionException::new);
        User user = lockUser(userId);
        PasswordResetToken reset = resets
                .findByTokenHashAndUsedFalse(tokenHash)
                .filter(t -> t.isAlive(Instant.now()))
                .orElseThrow(InvalidSessionException::new);
        reset.markUsed();
        user.setPasswordHash(passwords.encode(newPassword));
        resets.invalidateForUser(userId);
        // Смена пароля вышибает все сессии — угонщик с украденным refresh вылетает.
        logoutAll(user.getId());
    }

    /** Смена пароля и отзыв всех сессий выполняются в одной транзакции. */
    @Transactional
    public void changePassword(UUID userId, String currentPassword, String newPassword) {
        PasswordPolicy.validate(newPassword);
        User user = lockUser(userId);
        if (currentPassword == null || !passwords.matches(currentPassword, user.getPasswordHash())) {
            throw new InvalidCredentialsException();
        }
        user.setPasswordHash(passwords.encode(newPassword));
        resets.invalidateForUser(userId);
        logoutAll(userId);
    }

    private TokenPair issuePair(User user, UUID familyId) {
        UUID sessionId = UUID.randomUUID();
        String access = jwt.accessToken(user.getId(), user.getRole(), sessionId);
        String refresh = jwt.refreshToken(user.getId(), sessionId);
        Instant expires = Instant.now().plusSeconds(refreshTtlSeconds);
        sessions.save(new RefreshToken(TokenHash.sha256(refresh), sessionId, familyId, user, expires));
        return new TokenPair(access, refresh);
    }

    private static String normalize(String email) {
        return email == null ? "" : email.trim().toLowerCase(java.util.Locale.ROOT);
    }

    private User lockUser(UUID userId) {
        return users.lockById(userId).orElseThrow(InvalidSessionException::new);
    }

    private String randomToken() {
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        return HexFormat.of().formatHex(bytes);
    }

    /** Email уже занят — фронт показывает «войдите или сбросьте пароль», не 500. */
    public static class EmailTakenException extends RuntimeException {
    }

    /** Неверная пара email/пароль — одно исключение на оба случая (не раскрываем, что именно). */
    public static class InvalidCredentialsException extends RuntimeException {
    }

    /** Битый/просроченный/отозванный токен — контроллер отдаёт 401. */
    public static class InvalidSessionException extends RuntimeException {
    }
}
