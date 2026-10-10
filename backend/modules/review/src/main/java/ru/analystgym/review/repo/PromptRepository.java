package ru.analystgym.review.repo;

import org.springframework.data.jpa.repository.JpaRepository;
import ru.analystgym.review.domain.Prompt;

/** Промпты по ключу (sa-reviewer, arch-reviewer, ...). */
public interface PromptRepository extends JpaRepository<Prompt, String> {
}
