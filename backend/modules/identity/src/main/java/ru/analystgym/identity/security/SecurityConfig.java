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
 * Карта доступа (Фазы 1–2). Открыто: auth-эндпоинты, чтение каталога
 * и полные тела задач (без эталона), статика и health.
 * Черновики/попытки/эталон — только своим. Всё остальное API — с JWT.
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
                        .csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse())
                        // Stateless-JWT: дефолтная CsrfAuthenticationStrategy при КАЖДОМ запросе
                        // с валидным JWT чистит куку XSRF-TOKEN (saveToken(null) + ремаскировка),
                        // ломая следующий POST фронта, — проверено живьём вплоть до байткода.
                        // «События логина» в stateless-мире нет, ротировать некому — гасим.
                        .sessionAuthenticationStrategy((authentication, request, response) -> {
                        }))
                .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        // /me — только своим: иначе аноним падает в NPE вместо 401.
                        .requestMatchers("/api/auth/me").authenticated()
                        .requestMatchers("/api/auth/**").permitAll()
                        // Health обязан быть публичным: его дёргают Caddy, compose-healthcheck
                        // и CI-smoke без кук (контракт Фазы 0).
                        .requestMatchers("/api/health").permitAll()
                        // Контур практики: черновики/попытки/эталон — только своим.
                        // Стоит раньше публичного GET /api/tasks/**: первое совпадение
                        // побеждает, иначе гейт эталона был бы открыт гостям.
                        .requestMatchers("/api/tasks/*/draft", "/api/tasks/*/attempts",
                                "/api/tasks/*/reference", "/api/attempts/**",
                                "/api/assessment/**", "/api/complaints/**",
                                "/api/admin/**").authenticated()
                        .requestMatchers(HttpMethod.GET, "/api/tasks/**", "/api/collections/**", "/api/dictionaries/**").permitAll()
                        // /error обязан быть публичным: иначе контейнерный error-dispatch
                        // на 404 контроллера пере-проверяется цепочкой и маскарадит 404 в 401.
                        .requestMatchers("/error").permitAll()
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
