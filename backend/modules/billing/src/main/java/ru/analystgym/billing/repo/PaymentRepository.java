package ru.analystgym.billing.repo;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import ru.analystgym.billing.domain.Payment;

/** Платежи уникальны по id провайдера — на этом стоит идемпотентность. */
public interface PaymentRepository extends JpaRepository<Payment, UUID> {

    Optional<Payment> findByProviderPaymentId(String providerPaymentId);
}
