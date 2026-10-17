package ru.analystgym.practice.repo;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import ru.analystgym.practice.domain.Attempt;

/** Попытки пользователя: идемпотентный поиск, история, владение. */
public interface AttemptRepository extends JpaRepository<Attempt, UUID> {

    Optional<Attempt> findByUserIdAndIdempotencyKey(UUID userId, String idempotencyKey);

    /** Задачи с готовым ревью — для бесплатной квоты (тариф Free). */
    @Query("SELECT DISTINCT a.taskId FROM Attempt a WHERE a.userId = :userId AND a.status = 'reviewed'")
    java.util.Set<String> reviewedTaskIds(@Param("userId") UUID userId);

    @Query("select distinct a.taskId from Attempt a where a.userId = :userId and a.status in ('queued','in_review','reviewed')")
    java.util.Set<String> reservedTaskIds(@Param("userId") UUID userId);

    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @Query("select a from Attempt a where a.id = :id")
    Optional<Attempt> lockById(@Param("id") UUID id);

    List<Attempt> findByUserIdAndTaskIdOrderByCreatedAtDesc(UUID userId, String taskId);

    Optional<Attempt> findByIdAndUserId(UUID id, UUID userId);

    boolean existsByUserIdAndTaskIdAndStatus(UUID userId, String taskId, String status);
}
