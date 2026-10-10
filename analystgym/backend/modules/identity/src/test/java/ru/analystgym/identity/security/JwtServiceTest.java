package ru.analystgym.identity.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;
import org.junit.jupiter.api.Test;

/**
 * Проверяем контракт JWT без Spring-контекста: подпись/проверка ходят парой,
 * чужой секрет и мусор вместо токена дают пусто, а не исключение.
 */
class JwtServiceTest {

    private static final String SECRET = "test-secret-0123456789abcdef-test";

    private final JwtService jwt = new JwtService(SECRET, 900, 2592000);

    @Test
    void accessTokenRoundTrip() {
        UUID userId = UUID.randomUUID();

        String token = jwt.accessToken(userId, "STUDENT");

        assertThat(jwt.parse(token)).isPresent();
        assertThat(jwt.parse(token).orElseThrow().getSubject()).isEqualTo(userId.toString());
        assertThat(jwt.parse(token).orElseThrow().get("role")).isEqualTo("STUDENT");
    }

    @Test
    void чужойСекретНеПроходитПроверку() {
        JwtService other = new JwtService("other-secret-0123456789abcdef-other", 900, 2592000);

        String token = other.accessToken(UUID.randomUUID(), "STUDENT");

        assertThat(jwt.parse(token)).isEmpty();
    }

    @Test
    void мусорВместоТокенаДаётПустоАНеВзрыв() {
        assertThat(jwt.parse("not-a-jwt")).isEmpty();
        assertThat(jwt.parse("")).isEmpty();
        assertThat(jwt.parse(null)).isEmpty();
    }
}
