package ru.analystgym.identity.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.client.registration.InMemoryClientRegistrationRepository;
import org.springframework.security.oauth2.core.AuthorizationGrantType;
import org.springframework.security.oauth2.core.ClientAuthenticationMethod;
import org.springframework.security.web.SecurityFilterChain;

/**
 * Google OAuth2 (включается флагом app.google.enabled + ключами из env).
 * Отдельная цепочка раньше основной: пути /oauth2/** публичны, после
 * успеха — те же JWT-куки, дальше stateless как обычно. Без флага класс
 * не создаётся и кнопка фронта ведёт в честный 409 контроллера.
 * Регистрацию собираем вручную, а не из spring.security.oauth2.client-*:
 * пустые ключи по умолчанию не должны ронять контекст.
 */
@Configuration
@ConditionalOnProperty(name = "app.google.enabled", havingValue = "true")
public class OAuth2SecurityConfig {

    private final OAuth2Handlers handlers;

    public OAuth2SecurityConfig(OAuth2Handlers handlers) {
        this.handlers = handlers;
    }

    /** Google по явным endpoint (без магии резолва из properties). */
    @Bean
    @ConditionalOnMissingBean(ClientRegistrationRepository.class)
    ClientRegistrationRepository googleRegistrations(
            @Value("${app.google.client-id:}") String clientId,
            @Value("${app.google.client-secret:}") String clientSecret) {
        if (clientId.isBlank() || clientSecret.isBlank()) {
            throw new IllegalStateException("google keys missing");
        }
        ClientRegistration google = ClientRegistration.withRegistrationId("google")
                .clientId(clientId.trim())
                .clientSecret(clientSecret.trim())
                .clientAuthenticationMethod(ClientAuthenticationMethod.CLIENT_SECRET_BASIC)
                .authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
                .redirectUri("{baseUrl}/login/oauth2/code/{registrationId}")
                .scope("openid", "profile", "email")
                .authorizationUri("https://accounts.google.com/o/oauth2/v2/auth")
                .tokenUri("https://www.googleapis.com/oauth2/v4/token")
                .userInfoUri("https://www.googleapis.com/oauth2/v3/userinfo")
                .userNameAttributeName("sub")
                .jwkSetUri("https://www.googleapis.com/oauth2/v3/certs")
                .clientName("Google")
                .build();
        return new InMemoryClientRegistrationRepository(google);
    }

    @Bean
    @Order(10)
    SecurityFilterChain oauthChain(HttpSecurity http) throws Exception {
        http
                .securityMatcher("/oauth2/**", "/login/oauth2/code/*")
                .authorizeHttpRequests(auth -> auth.anyRequest().permitAll())
                .oauth2Login(oauth -> oauth
                        .successHandler(handlers.success())
                        .failureHandler(handlers.failure()));
        return http.build();
    }
}
