package ru.analystgym.app.ratelimit;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Регистрация перехватчика лимитов на четыре POST-точки.
 * Остальные эндпоинты без лимитов осознанно: каталог и чтение дешёвые,
 * а каждый лимит — это ложные 429 у честных пользователей.
 */
@Configuration
public class RateLimitConfig implements WebMvcConfigurer {

    private final RateLimitInterceptor interceptor;

    public RateLimitConfig(RateLimitInterceptor interceptor) {
        this.interceptor = interceptor;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(interceptor).addPathPatterns(
                "/api/auth/login",
                "/api/attempts",
                "/api/assessment/submissions",
                "/api/complaints");
    }
}
