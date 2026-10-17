package ru.analystgym.identity.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import java.util.UUID;
import java.time.Instant;
import ru.analystgym.identity.repo.RefreshTokenRepository;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Достаёт access-JWT из httpOnly-куки {@code ag_access} и кладёт пользователя
 * в SecurityContext. Токена нет или он битый — молча пропускаем дальше
 * анонимом: решать 401/403 будет слой авторизации, не этот фильтр.
 */
@Component
public class JwtAuthFilter extends OncePerRequestFilter {

    /** Имя cookie с access-токеном (refresh живёт отдельно, см. AuthService). */
    public static final String ACCESS_COOKIE = "ag_access";

    private final JwtService jwtService;
    private final RefreshTokenRepository sessions;

    public JwtAuthFilter(JwtService jwtService, RefreshTokenRepository sessions) {
        this.jwtService = jwtService;
        this.sessions = sessions;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String token = readCookie(request, ACCESS_COOKIE);
        if (token != null) {
            jwtService.parseAccess(token).ifPresent(claims -> {
                // subject — UUID пользователя, role — строка вида STUDENT.
                // Доверяем подписи, а не клиенту: роль перепроверяется по БД
                // только в чувствительных местах (Фаза 3+, админка).
                UUID userId = UUID.fromString(claims.getSubject());
                UUID sessionId = UUID.fromString(claims.get("sid", String.class));
                if (!sessions.existsBySessionIdAndUserIdAndRevokedFalseAndExpiresAtAfter(
                        sessionId, userId, Instant.now())) {
                    return;
                }
                String role = String.valueOf(claims.getOrDefault("role", "STUDENT"));
                UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(
                        userId, null, List.of(new SimpleGrantedAuthority("ROLE_" + role)));
                SecurityContextHolder.getContext().setAuthentication(auth);
            });
        }
        String expectedUser = request.getHeader("X-Account-ID");
        var authentication = SecurityContextHolder.getContext().getAuthentication();
        if (expectedUser != null && authentication != null
                && !expectedUser.equals(String.valueOf(authentication.getPrincipal()))) {
            response.setStatus(409);
            response.setContentType("application/json");
            response.getWriter().write("{\"error\":\"account_changed\"}");
            return;
        }
        chain.doFilter(request, response);
    }

    private static String readCookie(HttpServletRequest request, String name) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) {
            return null;
        }
        for (Cookie cookie : cookies) {
            if (name.equals(cookie.getName())) {
                return cookie.getValue();
            }
        }
        return null;
    }
}
