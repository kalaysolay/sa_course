package ru.analystgym.identity.repo;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import ru.analystgym.identity.domain.PasswordResetToken;

/** Токены сброса: ищем только неиспользованные, срок проверяем в сервисе. */
public interface PasswordResetRepository extends JpaRepository<PasswordResetToken, String> {

    Optional<PasswordResetToken> findByTokenHashAndUsedFalse(String tokenHash);

    /** Сначала блокируем пользователя, затем проверяем одноразовость токена. */
    @Query("select r.user.id from PasswordResetToken r where r.tokenHash = :hash")
    Optional<UUID> userIdOf(@Param("hash") String tokenHash);

    /** Новая ссылка и смена пароля гасят все предыдущие ссылки этого пользователя. */
    @Modifying(flushAutomatically = true)
    @Query("update PasswordResetToken r set r.used = true where r.user.id = :userId and r.used = false")
    int invalidateForUser(@Param("userId") UUID userId);
}
