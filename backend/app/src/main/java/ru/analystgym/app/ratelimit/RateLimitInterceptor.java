package ru.analystgym.app.ratelimit;

import java.util.Map;
import java.util.UUID;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Точки с лимитами: вход (перебор), отправка решений, диагностика, жалобы.
 * Ключ — пользователь, если вошёл, иначе IP. Ответ 429 с кодом,
 * фронт показывает тост и повторяет позже.
 */
@Component
public class RateLimitInterceptor implements HandlerInterceptor {

    private final RateLimiter limiter;
    private final ObjectMapper mapper;

    public RateLimitInterceptor(RateLimiter limiter, ObjectMapper mapper) {
        this.limiter = limiter;
        this.mapper = mapper;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response,
                             Object handler) throws Exception {
        if (!"POST".equalsIgnoreCase(request.getMethod())) {
            return true;
        }
        String path = request.getRequestURI();
        String bucket = null;
        if ("/api/auth/login".equals(path)) {
            bucket = "login";
        } else if ("/api/attempts".equals(path)) {
            bucket = "submit";
        } else if ("/api/assessment/submissions".equals(path)) {
            bucket = "assessment";
        } else if ("/api/complaints".equals(path)) {
            bucket = "complaints";
        }
        if (bucket == null) {
            return true;
        }
        if (!limiter.allow(bucket, key(request))) {
            response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            mapper.writeValue(response.getWriter(), Map.of("error", "rate_limited"));
            return false;
        }
        return true;
    }

    private static String key(HttpServletRequest request) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof UUID userId) {
            return "u:" + userId;
        }
        String forwarded = request.getHeader("X-Forwarded-For");
        String ip = forwarded != null && !forwarded.isBlank()
                ? forwarded.split(",")[0].trim() : request.getRemoteAddr();
        return "ip:" + ip;
    }
}
