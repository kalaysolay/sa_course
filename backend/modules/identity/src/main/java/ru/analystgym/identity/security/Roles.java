package ru.analystgym.identity.security;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import ru.analystgym.identity.domain.User;

/**
 * Роли доступа (UC-A01). Проверка — по свежей роли из БД, а не по клайму
 * JWT: отзыв прав должен срабатывать до протухания access-токена.
 * Составных прав нет: каждому эндпоинту хватает списка допустимых ролей.
 */
public final class Roles {

    public static final String STUDENT = "STUDENT";
    public static final String METHODIST = "METHODIST";
    public static final String REVIEWER = "REVIEWER";
    public static final String LLM_ADMIN = "LLM_ADMIN";
    public static final String SUPERADMIN = "SUPERADMIN";

    private Roles() {
    }

    /** Кидает 403, если роли пользователя нет среди допустимых. */
    public static void require(User user, String... allowed) {
        if (user == null) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        for (String role : allowed) {
            if (role.equals(user.getRole())) {
                return;
            }
        }
        throw new ResponseStatusException(HttpStatus.FORBIDDEN);
    }
}
