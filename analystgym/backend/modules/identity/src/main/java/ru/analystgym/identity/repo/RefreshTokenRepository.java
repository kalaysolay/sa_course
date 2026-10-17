package ru.analystgym.identity.repo;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.time.Instant;
import org.springframework.data.jpa.repository.JpaRepository;
import ru.analystgym.identity.domain.RefreshToken;

/** Refresh-сессии: отзыв поштучно (выход) и пачкой (смена пароля, «выйти везде»). */
public interface RefreshTokenRepository extends JpaRepository<RefreshToken, String> {

    Optional<RefreshToken> findByTokenHashAndRevokedFalse(String tokenHash);

    List<RefreshToken> findByUserIdAndRevokedFalse(UUID userId);

    /** Закрываем всю цепочку, включая ротацию, успевшую завершиться перед выходом. */
    List<RefreshToken> findByFamilyIdAndRevokedFalse(UUID familyId);

    /** Проверяем отзыв access по сессии без загрузки сущностей и ленивых связей. */
    boolean existsBySessionIdAndUserIdAndRevokedFalseAndExpiresAtAfter(
            UUID sessionId, UUID userId, Instant now);
}
