package ru.analystgym.catalog.repo;

import org.springframework.data.jpa.repository.JpaRepository;
import ru.analystgym.catalog.domain.Tag;

/** Метки отдаём целиком (60 штук) — фильтр строится на клиенте. */
public interface TagRepository extends JpaRepository<Tag, String> {
}
