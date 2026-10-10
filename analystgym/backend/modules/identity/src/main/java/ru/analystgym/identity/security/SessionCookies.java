package ru.analystgym.identity.security;

import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;
import ru.analystgym.identity.web.AuthController;

/**
 * Сборка auth-кук в одном месте: контроллер входа и OAuth2-хендлер
 * ставят одинаковые куки (флаги, Lax, время жизни).
 */
@Component
public class SessionCookies {

    private final boolean secure;
    private final long accessMaxAge;
    private final long refreshMaxAge;

    public SessionCookies(
            @Value("${app.cookies.secure:false}") boolean secure,
            @Value("${app.jwt.access-ttl-seconds:900}") long accessMaxAge,
            @Value("${app.jwt.refresh-ttl-seconds:2592000}") long refreshMaxAge) {
        this.secure = secure;
        this.accessMaxAge = accessMaxAge;
        this.refreshMaxAge = refreshMaxAge;
    }

    public ResponseCookie access(String value) {
        return base(JwtAuthFilter.ACCESS_COOKIE, value, accessMaxAge).build();
    }

    public ResponseCookie refresh(String value) {
        return base(AuthController.REFRESH_COOKIE, value, refreshMaxAge).build();
    }

    public ResponseCookie clearAccess() {
        return clear(JwtAuthFilter.ACCESS_COOKIE);
    }

    public ResponseCookie clearRefresh() {
        return clear(AuthController.REFRESH_COOKIE);
    }

    private ResponseCookie clear(String name) {
        return ResponseCookie.from(name, "")
                .httpOnly(true)
                .secure(secure)
                .sameSite("Lax")
                .path("/")
                .maxAge(0)
                .build();
    }

    private ResponseCookie.ResponseCookieBuilder base(String name, String value, long maxAge) {
        // Secure=false по умолчанию: локалка ходит по http, а Secure-куки браузер по http не отдаёт.
        // В проде ставим APP_COOKIES_SECURE=true (см. deploy/.env.example).
        return ResponseCookie.from(name, value)
                .httpOnly(true)
                .secure(secure)
                .sameSite("Lax")
                .path("/")
                .maxAge(Duration.ofSeconds(maxAge));
    }
}
