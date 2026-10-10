package ru.analystgym.identity.repo;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import ru.analystgym.identity.domain.PasswordResetToken;

/** Токены сброса: ищем только неиспользованные, срок проверяем в сервисе. */
public interface PasswordResetRepository extends JpaRepository<PasswordResetToken, String> {

    Optional<PasswordResetToken> findByTokenHashAndUsedFalse(String tokenHash);
}
