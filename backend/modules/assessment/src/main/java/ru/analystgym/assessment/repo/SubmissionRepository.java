package ru.analystgym.assessment.repo;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import ru.analystgym.assessment.domain.AssessmentSubmission;

/** Замеры пользователя: история и разбор только своих. */
public interface SubmissionRepository extends JpaRepository<AssessmentSubmission, UUID> {

    List<AssessmentSubmission> findByUserIdOrderByCreatedAtDesc(UUID userId);

    Optional<AssessmentSubmission> findByIdAndUserId(UUID id, UUID userId);
}
