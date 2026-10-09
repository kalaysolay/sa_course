package ru.analystgym.identity.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import java.util.UUID;
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

    public JwtAuthFilter(JwtService jwtService) {
        this.jwtService = jwtService;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String token = readCookie(request, ACCESS_COOKIE);
        if (token != null) {
            jwtService.parse(token).ifPresent(claims -> {
                // subject — UUID пользователя, role — строка вида STUDENT.
                // Доверяем подписи, а не клиенту: роль перепроверяется по БД
                // только в чувствительных местах (Фаза 3+, админка).
                UUID userId = UUID.fromString(claims.getSubject());
                String role = String.valueOf(claims.getOrDefault("role", "STUDENT"));
                UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(
                        userId, null, List.of(new SimpleGrantedAuthority("ROLE_" + role)));
                SecurityContextHolder.getContext().setAuthentication(auth);
            });
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
