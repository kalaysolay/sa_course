package ru.analystgym.practice.repo;

import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import ru.analystgym.practice.domain.Review;

/** Ревью по id попытки (совпадает с PK). */
public interface ReviewRepository extends JpaRepository<Review, UUID> {
    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("select r from Review r where r.attemptId=:id")
    java.util.Optional<Review> lockById(@org.springframework.data.repository.query.Param("id") UUID id);
}
