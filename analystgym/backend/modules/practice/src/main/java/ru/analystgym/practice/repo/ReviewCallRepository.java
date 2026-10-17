package ru.analystgym.practice.repo;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import ru.analystgym.practice.domain.ReviewCall;

/** Восстановление готового ответа агента и журнал расходов конкретной попытки. */
public interface ReviewCallRepository extends JpaRepository<ReviewCall, UUID> {
    List<ReviewCall> findByAttemptIdOrderByStartedAtAsc(UUID attemptId);
    Optional<ReviewCall> findFirstByAttemptIdAndAgentIdAndStatusOrderByStartedAtDesc(UUID attemptId, String agentId, String status);
}
