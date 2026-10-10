package ru.analystgym.identity.web;

import jakarta.validation.Valid;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import ru.analystgym.identity.domain.User;
import ru.analystgym.identity.repo.UserRepository;
import ru.analystgym.identity.security.JwtAuthFilter;
import ru.analystgym.identity.security.JwtService;
import ru.analystgym.identity.service.AuthService;
import org.springframework.security.web.csrf.CsrfToken;

/**
 * Auth API: регистрация, вход, ротация сессии, выход, профиль, сброс пароля.
 * Токены едут только в httpOnly-куках — в JSON их нет (XSS не должен их достать).
 * Кука refresh живёт отдельно от access: угон access даёт лишь 15 минут.
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    /** Имя cookie с refresh-токеном (access — см. JwtAuthFilter.ACCESS_COOKIE). */
    public static final String REFRESH_COOKIE = "ag_refresh";

    private final AuthService auth;
    private final UserRepository users;
    private final JwtService jwt;
    private final boolean cookieSecure;
    private final long accessMaxAge;
    private final long refreshMaxAge;

    public AuthController(
            AuthService auth,
            UserRepository users,
            JwtService jwt,
            @Value("${app.cookies.secure:false}") boolean cookieSecure,
            @Value("${app.jwt.access-ttl-seconds:900}") long accessMaxAge,
            @Value("${app.jwt.refresh-ttl-seconds:2592000}") long refreshMaxAge) {
        this.auth = auth;
        this.users = users;
        this.jwt = jwt;
        this.cookieSecure = cookieSecure;
        this.accessMaxAge = accessMaxAge;
        this.refreshMaxAge = refreshMaxAge;
    }

    @PostMapping("/register")
    public ResponseEntity<MeResponse> register(@Valid @RequestBody RegisterRequest req) {
        User user = auth.register(req.email(), req.password(), req.name());
        AuthService.TokenPair pair = auth.login(req.email(), req.password());
        return withCookies(pair, HttpStatus.CREATED, toMe(user));
    }

    @PostMapping("/login")
    public ResponseEntity<MeResponse> login(@Valid @RequestBody LoginRequest req) {
        User user = users.findByEmail(req.email().trim().toLowerCase())
                .orElseThrow(AuthService.InvalidCredentialsException::new);
        AuthService.TokenPair pair = auth.login(req.email(), req.password());
        return withCookies(pair, HttpStatus.OK, toMe(user));
    }

    /** Ротация по refresh-куке: новая пара + обновлённые куки. Тела с токенами нет. */
    @PostMapping("/refresh")
    public ResponseEntity<MeResponse> refresh(
            @CookieValue(name = REFRESH_COOKIE, required = false) String rawRefresh) {
        if (rawRefresh == null) {
            throw new AuthService.InvalidSessionException();
        }
        AuthService.TokenPair pair = auth.refresh(rawRefresh);
        UUID userId = userIdOf(pair.access());
        User user = users.findById(userId).orElseThrow(AuthService.InvalidSessionException::new);
        return withCookies(pair, HttpStatus.OK, toMe(user));
    }

    @PostMapping("/logout")
    public ResponseEntity<Map<String, String>> logout(
            @CookieValue(name = REFRESH_COOKIE, required = false) String rawRefresh) {
        auth.logout(rawRefresh);
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, clearCookie(JwtAuthFilter.ACCESS_COOKIE).toString())
                .header(HttpHeaders.SET_COOKIE, clearCookie(REFRESH_COOKIE).toString())
                .body(Map.of("status", "ok"));
    }

    /** Профиль для шапки фронта. Без куки сюда не пускает цепочка (401 раньше метода). */
    @GetMapping("/me")
    public MeResponse me(Authentication authentication) {
        // Страховка от NPE: если матчинг в SecurityConfig однажды разъедется,
        // аноним получит понятный 401, а не 500 (проверено живьём).
        if (authentication == null || !(authentication.getPrincipal() instanceof UUID userId)) {
            throw new AuthService.InvalidSessionException();
        }
        User user = users.findById(userId).orElseThrow(AuthService.InvalidSessionException::new);
        return toMe(user);
    }

    /**
     * Маячок CSRF для фронта: само обращение к токену заставляет
     * CookieCsrfTokenRepository записать readable-куку XSRF-TOKEN
     * (на обычных GET токен ленивый и кука не пишется — проверено живьём).
     * api.js дёргает его при старте перед первым POST.
     */
    @GetMapping("/csrf")
    public Map<String, String> csrf(CsrfToken token) {
        return Map.of("token", token.getToken());
    }

    /** Заглушка Фазы 1: всегда 202, существует ли email — не раскрываем. */
    @PostMapping("/password/request")
    public ResponseEntity<Map<String, String>> requestReset(@RequestBody Map<String, String> body) {
        try {
            auth.requestReset(body.getOrDefault("email", ""));
        } catch (AuthService.InvalidCredentialsException ignored) {
            // Намеренно молчим: перечисление пользователей — подарок спамерам.
        }
        return ResponseEntity.accepted().body(Map.of("status", "accepted"));
    }

    @PostMapping("/password/confirm")
    public ResponseEntity<Map<String, String>> confirmReset(@RequestBody Map<String, String> body) {
        auth.confirmReset(body.getOrDefault("token", ""), body.getOrDefault("password", ""));
        return ResponseEntity.ok(Map.of("status", "ok"));
    }

    @ExceptionHandler(AuthService.EmailTakenException.class)
    @ResponseStatus(HttpStatus.CONFLICT)
    Map<String, String> emailTaken() {
        return Map.of("error", "email_taken");
    }

    @ExceptionHandler({AuthService.InvalidCredentialsException.class, AuthService.InvalidSessionException.class})
    @ResponseStatus(HttpStatus.UNAUTHORIZED)
    Map<String, String> unauthorized() {
        return Map.of("error", "unauthorized");
    }

    private ResponseEntity<MeResponse> withCookies(
            AuthService.TokenPair pair, HttpStatus status, MeResponse body) {
        // Две куки одним ответом: Spring склеит оба Set-Cookie заголовка сам.
        return ResponseEntity.status(status)
                .header(HttpHeaders.SET_COOKIE, accessCookie(pair.access()).toString())
                .header(HttpHeaders.SET_COOKIE, refreshCookie(pair.refresh()).toString())
                .body(body);
    }

    private ResponseCookie accessCookie(String value) {
        return baseCookie(JwtAuthFilter.ACCESS_COOKIE, value, accessMaxAge).build();
    }

    private ResponseCookie refreshCookie(String value) {
        return baseCookie(REFRESH_COOKIE, value, refreshMaxAge).build();
    }

    private ResponseCookie.ResponseCookieBuilder baseCookie(String name, String value, long maxAge) {
        // Secure=false по умолчанию: локалка ходит по http, а Secure-куки браузер по http не отдаёт.
        // В проде ставим APP_COOKIES_SECURE=true (см. deploy/.env.example).
        return ResponseCookie.from(name, value)
                .httpOnly(true)
                .secure(cookieSecure)
                .sameSite("Lax")
                .path("/")
                .maxAge(Duration.ofSeconds(maxAge));
    }

    private ResponseCookie clearCookie(String name) {
        return ResponseCookie.from(name, "")
                .httpOnly(true)
                .secure(cookieSecure)
                .sameSite("Lax")
                .path("/")
                .maxAge(0)
                .build();
    }

    private UUID userIdOf(String accessToken) {
        // Access — свежий JWT из issuePair: подпись обязана сойтись (иначе баг наш, не клиента).
        return jwt.parse(accessToken)
                .map(c -> UUID.fromString(c.getSubject()))
                .orElseThrow(AuthService.InvalidSessionException::new);
    }

    private static MeResponse toMe(User user) {
        return new MeResponse(user.getId(), user.getEmail(), user.getName(), user.getRole());
    }
}
