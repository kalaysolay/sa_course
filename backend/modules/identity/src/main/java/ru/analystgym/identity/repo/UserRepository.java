package ru.analystgym.identity.repo;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import ru.analystgym.identity.domain.User;

/** Пользователи: поиск по email всегда идёт по нижнему регистру (см. AuthService). */
public interface UserRepository extends JpaRepository<User, UUID> {

    Optional<User> findByEmail(String email);
}
