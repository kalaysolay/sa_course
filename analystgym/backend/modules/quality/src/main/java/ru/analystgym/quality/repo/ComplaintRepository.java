package ru.analystgym.quality.repo;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import ru.analystgym.quality.domain.Complaint;

/** Очередь жалоб: фильтр по статусу, свежие первые; свои — студенту. */
public interface ComplaintRepository extends JpaRepository<Complaint, UUID> {

    List<Complaint> findByStatusOrderByCreatedAtDesc(String status);

    List<Complaint> findAllByOrderByCreatedAtDesc();

    List<Complaint> findByUserIdOrderByCreatedAtDesc(UUID userId);
}
