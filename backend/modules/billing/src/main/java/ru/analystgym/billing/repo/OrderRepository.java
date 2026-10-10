package ru.analystgym.billing.repo;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import ru.analystgym.billing.domain.Order;

/** Заказы пользователя, свежие первые; поиск по платежу — для вебхуков. */
public interface OrderRepository extends JpaRepository<Order, UUID> {

    List<Order> findByUserIdOrderByCreatedAtDesc(UUID userId);

    Optional<Order> findByPaymentId(String paymentId);
}
