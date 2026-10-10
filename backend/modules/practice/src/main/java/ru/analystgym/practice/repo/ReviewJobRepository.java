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

    @Query(value = "SELECT * FROM review_jobs WHERE status = 'queued'"
            + " ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED", nativeQuery = true)
    Optional<ReviewJob> claimNext();
}
