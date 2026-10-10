package ru.analystgym.identity.service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

/**
 * SHA-256 хэширование токенов перед записью в БД.
 * В базе лежат только хэши: утечка дампа не отдаёт готовые сессии.
 * Сырой токен знает только владелец httpOnly-cookie.
 */
public final class TokenHash {

    private TokenHash() {
    }

    public static String sha256(String raw) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(raw.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            // SHA-256 обязан быть в любой JRE; если его нет — среда сломана.
            throw new IllegalStateException("SHA-256 not available", e);
        }
    }
}
