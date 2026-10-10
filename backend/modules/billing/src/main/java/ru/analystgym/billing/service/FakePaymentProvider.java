package ru.analystgym.billing.service;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

/**
 * Тестовый провайдер для dev/E2E: платёж создаётся мгновенно, подтверждение —
 * через тестовый эндпоинт (боевой вебхук так дёрнуть нельзя). Настоящие
 * деньги здесь ходить не могут по построению: URL подтверждения ведёт
 * обратно на наш же API, а не в банк.
 */
@Component
public class FakePaymentProvider implements PaymentProvider {

    private final Map<String, String> statuses = new ConcurrentHashMap<>();

    @Override
    public String name() {
        return "fake";
    }

    @Override
    public CreatedPayment createPayment(UUID orderId, int amountMinor, String currency,
                                        String description, String returnUrl) {
        String paymentId = "fake_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
        statuses.put(paymentId, "pending");
        return new CreatedPayment(paymentId, returnUrl + "?payment_id=" + paymentId, "pending");
    }

    /** Тестовое подтверждение (только при billing.fake-enabled, см. сервис). */
    public String confirm(String providerPaymentId) {
        return statuses.computeIfPresent(providerPaymentId, (id, status) -> "succeeded");
    }

    public String statusOf(String providerPaymentId) {
        return statuses.getOrDefault(providerPaymentId, "unknown");
    }
}
