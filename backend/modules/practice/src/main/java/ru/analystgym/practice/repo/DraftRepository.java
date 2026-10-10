package ru.analystgym.practice.repo;

import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import ru.analystgym.practice.domain.Draft;

/** Черновики по составному ключу (user_id, task_id). */
public interface DraftRepository extends JpaRepository<Draft, Draft.DraftId> {
}
