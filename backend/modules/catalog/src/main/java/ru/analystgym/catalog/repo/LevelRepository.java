package ru.analystgym.catalog.repo;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import ru.analystgym.catalog.domain.Level;

/** Уровни отдаём целиком — их три, кэшируются на клиенте. */
public interface LevelRepository extends JpaRepository<Level, String> {
}
