package ru.analystgym.identity.repo;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import ru.analystgym.identity.domain.RefreshToken;

/** Refresh-сессии: отзыв поштучно (выход) и пачкой (смена пароля, «выйти везде»). */
public interface RefreshTokenRepository extends JpaRepository<RefreshToken, String> {

    Optional<RefreshToken> findByTokenHashAndRevokedFalse(String tokenHash);

    List<RefreshToken> findByUserIdAndRevokedFalse(UUID userId);
}
