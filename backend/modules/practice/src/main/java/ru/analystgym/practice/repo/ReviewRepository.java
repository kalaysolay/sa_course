package ru.analystgym.practice.repo;

import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import ru.analystgym.practice.domain.Review;

/** Ревью по id попытки (совпадает с PK). */
public interface ReviewRepository extends JpaRepository<Review, UUID> {
}
