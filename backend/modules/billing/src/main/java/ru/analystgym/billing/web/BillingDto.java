package ru.analystgym.billing.web;

import java.util.List;
import java.util.UUID;

/**
 * Контракты биллинга. Суммы — целыми рублями (копейки уберут ясность,
 * а тарифы всё равно круглые).
 */
public final class BillingDto {

    private BillingDto() {
    }

    public record PlanView(String id, int price, String currency, int days, String title) {
    }

    public record OrderRequest(String plan) {
    }

    public record OrderView(
            UUID orderId,
            String plan,
            int amount,
            String currency,
            String status,
            String confirmationUrl,
            String createdAt) {
    }

    public record StatusView(boolean pro, String plan, String endsAt, String provider,
                               UUID subscriptionId) {
    }

    public record WebhookRequest(String providerPaymentId, String status) {
    }

    public record WebhookResponse(boolean duplicate, String orderStatus) {
    }

    public record ConfirmRequest(String paymentId) {
    }

    public record RedeemRequest(String code) {
    }

    public record PromoCreateRequest(String code, Integer proDays, Integer maxUses) {
    }

    public record PromoView(String code, int proDays, int maxUses, int usedCount, boolean active) {
    }

    public record GrantRequest(String email, Integer proDays) {
    }

    public record SubscriptionView(
            UUID id, String plan, String status, String startedAt, String endsAt,
            boolean cancelAtPeriodEnd, String source) {
    }

    public record AttemptOrderRow(
            UUID orderId, String plan, int amount, String status, String createdAt) {
    }

    /** Активная подписка пользователя (для квоты достаточно факта). */
    public record ProState(boolean pro, UUID subscriptionId, String endsAt, String plan) {
    }

    public static List<PlanView> defaultPlans(int monthlyPrice, int yearlyPrice) {
        return List.of(
                new PlanView("pro-monthly", monthlyPrice, "RUB", 30, "Pro · месяц"),
                new PlanView("pro-yearly", yearlyPrice, "RUB", 365, "Pro · год"));
    }
}
