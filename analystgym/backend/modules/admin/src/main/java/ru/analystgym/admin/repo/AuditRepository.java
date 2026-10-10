package ru.analystgym.admin.repo;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import ru.analystgym.admin.domain.AuditEvent;

/** Журнал: свежие первые, чтение с лимитом. */
public interface AuditRepository extends JpaRepository<AuditEvent, UUID> {

    List<AuditEvent> findAllByOrderByCreatedAtDesc();
}
