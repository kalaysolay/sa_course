package ru.analystgym.admin.repo;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import ru.analystgym.admin.domain.TaskRevision;

/** Ревизии задачи: свежие первые, номер следующей — max+1. */
public interface TaskRevisionRepository extends JpaRepository<TaskRevision, java.util.UUID> {

    List<TaskRevision> findByTaskIdOrderByRevDesc(String taskId);

    Optional<TaskRevision> findFirstByTaskIdOrderByRevDesc(String taskId);
}
