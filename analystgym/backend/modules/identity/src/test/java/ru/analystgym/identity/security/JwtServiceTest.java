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

        String token = jwt.accessToken(userId, "STUDENT", UUID.randomUUID());

        assertThat(jwt.parseAccess(token)).isPresent();
        assertThat(jwt.parseAccess(token).orElseThrow().getSubject()).isEqualTo(userId.toString());
        assertThat(jwt.parseAccess(token).orElseThrow().get("role")).isEqualTo("STUDENT");
    }

    @Test
    void чужойСекретНеПроходитПроверку() {
        JwtService other = new JwtService("other-secret-0123456789abcdef-other", 900, 2592000);

        String token = other.accessToken(UUID.randomUUID(), "STUDENT", UUID.randomUUID());

        assertThat(jwt.parseAccess(token)).isEmpty();
    }

    @Test
    void мусорВместоТокенаДаётПустоАНеВзрыв() {
        assertThat(jwt.parseAccess("not-a-jwt")).isEmpty();
        assertThat(jwt.parseAccess("")).isEmpty();
        assertThat(jwt.parseAccess(null)).isEmpty();
    }

    @Test
    void назначенияТокеновНельзяПерепутать() {
        // Refresh не авторизует API, а access нельзя обменять на новую пару.
        UUID user = UUID.randomUUID();
        UUID session = UUID.randomUUID();
        assertThat(jwt.parseAccess(jwt.refreshToken(user, session))).isEmpty();
        assertThat(jwt.parseRefresh(jwt.accessToken(user, "STUDENT", session))).isEmpty();
    }

    @Test
    void повторнаяВыдачаДажеВОднуСекундуУникальна() {
        // jti исключает совпадение хэшей и повторное оживление погашенного refresh.
        UUID user = UUID.randomUUID();
        UUID session = UUID.randomUUID();
        assertThat(jwt.refreshToken(user, session)).isNotEqualTo(jwt.refreshToken(user, session));
    }
}
