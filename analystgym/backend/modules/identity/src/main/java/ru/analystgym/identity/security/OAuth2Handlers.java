package ru.analystgym.identity.security;

import java.io.IOException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.security.web.authentication.AuthenticationFailureHandler;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;
import org.springframework.stereotype.Component;
import ru.analystgym.identity.service.AuthService;

/**
 * Финал Google-входа: берём подтверждённый email, находим/создаём
 * пользователя и ставим те же JWT-куки, что обычный вход. Дальше фронт
 * неотличим: шапка, кабинет и API работают как после пароля.
 * Неподтверждённая почта — отказ (чужой ящик привязать нельзя).
 */
@Component
public class OAuth2Handlers {

    private final AuthService auth;
    private final SessionCookies cookies;
    private final String successUrl;
    private final String failureUrl;

    public OAuth2Handlers(
            AuthService auth,
            SessionCookies cookies,
            @Value("${app.google.success-url:/account.html}") String successUrl,
            @Value("${app.google.failure-url:/login.html?error=oauth}") String failureUrl) {
        this.auth = auth;
        this.cookies = cookies;
        this.successUrl = successUrl;
        this.failureUrl = failureUrl;
    }

    public AuthenticationSuccessHandler success() {
        return (HttpServletRequest request, HttpServletResponse response,
                Authentication authentication) -> {
            Object principal = authentication.getPrincipal();
            String email = null;
            boolean verified = false;
            String name = "";
            if (principal instanceof OidcUser oidc) {
                email = oidc.getEmail();
                verified = Boolean.TRUE.equals(oidc.getEmailVerified());
                name = oidc.getFullName() != null ? oidc.getFullName() : "";
            } else if (principal instanceof OAuth2User oauth) {
                email = String.valueOf(oauth.getAttributes().getOrDefault("email", ""));
                verified = Boolean.TRUE.equals(oauth.getAttributes().get("email_verified"));
                name = String.valueOf(oauth.getAttributes().getOrDefault("name", ""));
            }
            if (email == null || email.isBlank() || !verified) {
                response.sendRedirect(failureUrl);
                return;
            }
            if (name.isBlank()) {
                int at = email.indexOf('@');
                name = at > 0 ? email.substring(0, at) : email;
            }
            AuthService.OAuthLogin login = auth.oauthLogin(email, name);
            AuthService.TokenPair pair = login.pair();
            response.addHeader(HttpHeaders.SET_COOKIE, cookies.access(pair.access()).toString());
            response.addHeader(HttpHeaders.SET_COOKIE, cookies.refresh(pair.refresh()).toString());
            response.sendRedirect(successUrl);
        };
    }

    public AuthenticationFailureHandler failure() {
        return (HttpServletRequest request, HttpServletResponse response,
                org.springframework.security.core.AuthenticationException error) -> {
            try {
                response.sendRedirect(failureUrl);
            } catch (IOException e) {
                throw new IllegalStateException(e);
            }
        };
    }
}
