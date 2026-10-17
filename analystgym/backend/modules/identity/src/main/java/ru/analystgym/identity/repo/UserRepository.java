package ru.analystgym.identity.repo;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;
import ru.analystgym.identity.domain.User;

/** Пользователи: поиск по email всегда идёт по нижнему регистру (см. AuthService). */
public interface UserRepository extends JpaRepository<User, UUID> {

    Optional<User> findByEmail(String email);

    /** При входе не кэшируем старый хэш пароля до получения блокировки пользователя. */
    @Query("select u.id from User u where u.email = :email")
    Optional<UUID> findIdByEmail(@Param("email") String email);

    /** Единый порядок блокировок для входа, ротации, выхода и смены пароля. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select u from User u where u.id = :id")
    Optional<User> lockById(@Param("id") UUID id);
}
