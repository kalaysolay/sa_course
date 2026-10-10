package ru.analystgym.billing.repo;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import ru.analystgym.billing.domain.Subscription;

/** Подписки пользователя; активная Pro — по статусу и сроку. */
public interface SubscriptionRepository extends JpaRepository<Subscription, UUID> {

    List<Subscription> findByUserIdOrderByEndsAtDesc(UUID userId);

    List<Subscription> findByUserIdAndStatusAndEndsAtAfter(UUID userId, String status, Instant now);
}
