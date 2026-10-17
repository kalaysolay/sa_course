package ru.analystgym.identity.security;

import java.nio.charset.StandardCharsets;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/** Единые ограничения для bcrypt: не допускаем незаметного усечения после 72 байт. */
public final class PasswordPolicy {
    private PasswordPolicy() {
    }

    /** Проверяется во всех сценариях установки пароля, включая сброс по ссылке. */
    public static void validate(String password) {
        if (password == null || password.isBlank() || password.length() < 8
                || password.getBytes(StandardCharsets.UTF_8).length > 72) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "bad password");
        }
    }
}
