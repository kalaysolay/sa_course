package ru.analystgym.practice.repo;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import ru.analystgym.practice.domain.ReviewJob;

/**
 * Очередь ревью. Захват — oldest-queued с пропуском заблокированных строк:
 * несколько воркеров (и рестарт рядом с висящей транзакцией) не дерутся.
 */
public interface ReviewJobRepository extends JpaRepository<ReviewJob, UUID> {

    Optional<ReviewJob> findByAttemptId(UUID attemptId);

    @Query(value = "SELECT * FROM review_jobs WHERE (status = 'queued' AND next_run_at <= :now)"
            + " OR (status IN ('sa_running','arch_running','grading') AND lease_until <= :now)"
            + " ORDER BY next_run_at, created_at LIMIT 1 FOR UPDATE SKIP LOCKED", nativeQuery = true)
    Optional<ReviewJob> claimNext(@org.springframework.data.repository.query.Param("now") java.time.Instant now);

    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @Query("select j from ReviewJob j where j.id = :id")
    Optional<ReviewJob> lockById(@org.springframework.data.repository.query.Param("id") UUID id);
}
