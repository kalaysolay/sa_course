package ru.analystgym.billing.repo;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import ru.analystgym.billing.domain.WaitlistEntry;

/** Предзапись: поиск дубля по email, список для админки — свежие первые. */
public interface WaitlistRepository extends JpaRepository<WaitlistEntry, UUID> {

    Optional<WaitlistEntry> findByEmail(String email);

    List<WaitlistEntry> findAllByOrderByCreatedAtDesc();
}
