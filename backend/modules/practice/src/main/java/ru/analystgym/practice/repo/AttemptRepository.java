package ru.analystgym.practice.repo;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import ru.analystgym.practice.domain.Attempt;

/** Попытки пользователя: идемпотентный поиск, история, владение. */
public interface AttemptRepository extends JpaRepository<Attempt, UUID> {

    Optional<Attempt> findByUserIdAndIdempotencyKey(UUID userId, String idempotencyKey);

    List<Attempt> findByUserIdAndTaskIdOrderByCreatedAtDesc(UUID userId, String taskId);

    Optional<Attempt> findByIdAndUserId(UUID id, UUID userId);

    boolean existsByUserIdAndTaskIdAndStatus(UUID userId, String taskId, String status);
}
