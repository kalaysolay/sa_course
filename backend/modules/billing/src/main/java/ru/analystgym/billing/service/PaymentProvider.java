package ru.analystgym.billing.service;

import java.util.UUID;

/**
 * Провайдер приёма платежей за адаптером (архитектура §2, product-spec §5):
 * деньги ходят только через этот интерфейс, смена ЮKassa на другого —
 * новая реализация, а не правки по сервисам.
 */
public interface PaymentProvider {

    /** Имя для логов и админки (fake, yookassa, ...). */
    String name();

    /**
     * Создаёт платёж у провайдера. Идемпотентность на стороне провайдера —
     * ключом orderId (повторный вызов не плодит списаний).
     */
    CreatedPayment createPayment(UUID orderId, int amountMinor, String currency,
                                 String description, String returnUrl);

    record CreatedPayment(String providerPaymentId, String confirmationUrl, String status) {
    }

    /** Входящий статус провайдера → наш (succeeded|waiting|canceled). */
    static String normalizeStatus(String providerStatus) {
        if (providerStatus == null) {
            return "pending";
        }
        return switch (providerStatus.toLowerCase(java.util.Locale.ROOT)) {
            case "succeeded", "paid", "captured" -> "succeeded";
            case "canceled", "cancelled", "failed", "expired" -> "canceled";
            default -> "pending";
        };
    }
}
