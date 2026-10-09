package ru.analystgym.identity.security;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;

/**
 * Карта доступа Фазы 1. Открыто: auth-эндпоинты, чтение каталога,
 * статика и health. Всё остальное API — только с валидным JWT.
 * CSRF включён осознанно: куки шлёт браузер сам, поэтому каждый
 * не-GET запрос фронта обязан слать заголовок X-XSRF-TOKEN
 * (значение — из readable-куки XSRF-TOKEN, см. api.js в Фазе 1).
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    private final JwtAuthFilter jwtAuthFilter;

    public SecurityConfig(JwtAuthFilter jwtAuthFilter) {
        this.jwtAuthFilter = jwtAuthFilter;
    }

    @Bean
    PasswordEncoder passwordEncoder() {
        // BCrypt с дефолтной стоимостью: баланс скорость/стойкость для логина.
        return new BCryptPasswordEncoder();
    }

    @Bean
    SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
                .csrf(csrf -> csrf
                        // CsrfTokenRequestAttributeHandler здесь дефолтный:
                        // кладёт токен в атрибут запроса, фронт читает куку XSRF-TOKEN.
                        .csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse()))
                .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/api/auth/**").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/tasks/**", "/api/collections/**", "/api/dictionaries/**").permitAll()
                        .requestMatchers("/", "/*.html", "/assets/**", "/docs/**", "/actuator/health", "/favicon.ico").permitAll()
                        .anyRequest().authenticated())
                .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class)
                .exceptionHandling(e -> e.authenticationEntryPoint((request, response, ex) -> {
                    // Для API отдаём JSON 401, а не редирект на форму логина (её нет и не будет).
                    response.setStatus(HttpStatus.UNAUTHORIZED.value());
                    response.setContentType("application/json");
                    response.getWriter().write("{\"error\":\"unauthorized\"}");
                }));
        return http.build();
    }
}
