package ru.analystgym.catalog.repo;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import ru.analystgym.catalog.domain.Task;

/**
 * Каталог задач. Фильтры — одним запросом с nullable-параметрами:
 * NULL означает «фильтр не задан». Сортировка — на клиенте
 * (на 16–100 задачах это быстрее и проще индексной возни).
 */
public interface TaskRepository extends JpaRepository<Task, String> {

    @Query(value = """
            SELECT * FROM tasks t
            WHERE (:level IS NULL OR t.level_id = :level)
              AND (:tag IS NULL OR :tag = ANY (t.tags))
              AND (:status IS NULL OR t.status = :status)
              AND (:q IS NULL OR t.title ILIKE '%' || :q || '%')
            """, nativeQuery = true)
    List<Task> search(
            @Param("level") String level,
            @Param("tag") String tag,
            @Param("status") String status,
            @Param("q") String q);
}
