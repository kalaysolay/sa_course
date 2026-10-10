package ru.analystgym.identity.service;

import java.security.SecureRandom;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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
import ru.analystgym.identity.security.Roles;
import ru.analystgym.notify.service.NotificationService;

/**
 * Сценарии входа: регистрация, логин, ротация refresh, выход, сброс пароля.
 * Email нормализуем в lower-case на входе — UNIQUE в БД лишь страховка.
 * Сырые refresh-токены возвращаем один раз (в куку); в БД — только SHA-256.
 */
@Service
public class AuthService {

    private static final Logger log = LoggerFactory.getLogger(AuthService.class);

    private final UserRepository users;
    private final RefreshTokenRepository sessions;
    private final PasswordResetRepository resets;
    private final PasswordEncoder passwords;
    private final JwtService jwt;
    private final long refreshTtlSeconds;
    private final NotificationService notify;
    /** Bootstrap суперадминов: email из app.admin-emails (нижний регистр). */
    private final java.util.Set<String> adminEmails;
    private final SecureRandom random = new SecureRandom();

    public AuthService(
            UserRepository users,
            RefreshTokenRepository sessions,
            PasswordResetRepository resets,
            PasswordEncoder passwords,
            JwtService jwt,
            @Value("${app.jwt.refresh-ttl-seconds:2592000}") long refreshTtlSeconds,
            @Value("${app.admin-emails:}") String adminEmailsCsv,
            NotificationService notify) {
        this.users = users;
        this.sessions = sessions;
        this.resets = resets;
        this.passwords = passwords;
        this.jwt = jwt;
        this.refreshTtlSeconds = refreshTtlSeconds;
        this.notify = notify;
        java.util.Set<String> admins = new java.util.HashSet<>();
        for (String raw : adminEmailsCsv.split(",")) {
            String email = raw.trim().toLowerCase(java.util.Locale.ROOT);
            if (!email.isEmpty()) {
                admins.add(email);
            }
        }
        this.adminEmails = java.util.Set.copyOf(admins);
    }

    /** Пара токенов для установки в куки. Access — JWT, refresh — JWT + запись в БД. */
    public record TokenPair(String access, String refresh) {
    }

    @Transactional
    public User register(String email, String rawPassword, String name) {
        String norm = normalize(email);
        users.findByEmail(norm).ifPresent(u -> {
            throw new EmailTakenException();
        });
        User user = User.of(norm, passwords.encode(rawPassword), name.trim());
        // Первый вход команды: email из bootstrap-списка сразу суперадмин.
        if (adminEmails.contains(norm)) {
            user.setRole(Roles.SUPERADMIN);
        }
        return users.save(user);
    }

    @Transactional
    public TokenPair login(String email, String rawPassword) {
        User user = users.findByEmail(normalize(email)).orElseThrow(InvalidCredentialsException::new);
        if (!passwords.matches(rawPassword, user.getPasswordHash())) {
            throw new InvalidCredentialsException();
        }
        return issuePair(user);
    }

    /** Ротация: старый refresh отзывается, выдаётся новая пара (защита от переиспользования). */
    @Transactional
    public TokenPair refresh(String rawRefresh) {
        RefreshToken session = sessions
                .findByTokenHashAndRevokedFalse(TokenHash.sha256(rawRefresh))
                .filter(s -> s.isAlive(Instant.now()))
                .orElseThrow(InvalidSessionException::new);
        session.revoke();
        return issuePair(session.getUser());
    }

    @Transactional
    public void logout(String rawRefresh) {
        if (rawRefresh == null) {
            return;
        }
        sessions.findByTokenHashAndRevokedFalse(TokenHash.sha256(rawRefresh))
                .ifPresent(RefreshToken::revoke);
    }

    /** «Выйти везде»: отзываем все живые сессии пользователя. */
    @Transactional
    public void logoutAll(UUID userId) {
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
        User user = users.findByEmail(normalize(email)).orElseThrow(InvalidCredentialsException::new);
        String raw = randomToken();
        Instant expires = Instant.now().plusSeconds(3600);
        resets.save(new PasswordResetToken(TokenHash.sha256(raw), user, expires));
        notify.passwordReset(user.getId(), user.getEmail(), raw);
        return raw;
    }

    @Transactional
    public void confirmReset(String rawToken, String newPassword) {
        PasswordResetToken reset = resets
                .findByTokenHashAndUsedFalse(TokenHash.sha256(rawToken))
                .filter(t -> t.isAlive(Instant.now()))
                .orElseThrow(InvalidSessionException::new);
        reset.markUsed();
        User user = reset.getUser();
        user.setPasswordHash(passwords.encode(newPassword));
        // Смена пароля вышибает все сессии — угонщик с украденным refresh вылетает.
        logoutAll(user.getId());
    }

    private TokenPair issuePair(User user) {
        String access = jwt.accessToken(user.getId(), user.getRole());
        String refresh = jwt.refreshToken(user.getId());
        Instant expires = Instant.now().plusSeconds(refreshTtlSeconds);
        sessions.save(new RefreshToken(TokenHash.sha256(refresh), user, expires));
        return new TokenPair(access, refresh);
    }

    private static String normalize(String email) {
        return email == null ? "" : email.trim().toLowerCase();
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
