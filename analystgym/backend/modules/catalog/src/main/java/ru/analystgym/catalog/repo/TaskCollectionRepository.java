package ru.analystgym.catalog.repo;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import ru.analystgym.catalog.domain.TaskCollection;

/** Подборки: витрине нужны только видимые, админке — все (Фаза 3). */
public interface TaskCollectionRepository extends JpaRepository<TaskCollection, String> {

    List<TaskCollection> findByActiveTrue();
}
