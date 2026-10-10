package ru.analystgym.review.repo;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import ru.analystgym.review.domain.PromptVersion;

/** Версии промпта: A/B-раздача идёт по traffic среди ненулевых. */
public interface PromptVersionRepository extends JpaRepository<PromptVersion, UUID> {

    List<PromptVersion> findByPromptKeyOrderByVDesc(String promptKey);

    Optional<PromptVersion> findFirstByPromptKeyAndStatus(String promptKey, String status);
}
