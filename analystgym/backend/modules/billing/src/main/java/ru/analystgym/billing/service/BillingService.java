package ru.analystgym.billing.service;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import ru.analystgym.billing.domain.Order;
import ru.analystgym.billing.domain.Payment;
import ru.analystgym.billing.domain.PromoCode;
import ru.analystgym.billing.domain.Subscription;
import ru.analystgym.billing.repo.OrderRepository;
import ru.analystgym.billing.repo.PaymentRepository;
import ru.analystgym.billing.repo.PromoCodeRepository;
import ru.analystgym.billing.repo.SubscriptionRepository;
import ru.analystgym.billing.web.BillingDto;
import ru.analystgym.billing.web.BillingDto.AttemptOrderRow;
import ru.analystgym.billing.web.BillingDto.OrderView;
import ru.analystgym.billing.web.BillingDto.PlanView;
import ru.analystgym.billing.web.BillingDto.ProState;
import ru.analystgym.billing.web.BillingDto.PromoView;
import ru.analystgym.billing.web.BillingDto.StatusView;
import ru.analystgym.billing.web.BillingDto.SubscriptionView;
import ru.analystgym.billing.web.BillingDto.WebhookResponse;

/**
 * Деньги (UC-B01–B04): тарифы, заказы, идемпотентные вебхуки, Pro-статус,
 * ручные промокоды, отмена без резки доступа. Цены — из конфига,
 * а не из кода (тарифы правит деплой, не релиз).
 */
@Service
public class BillingService {

    private final OrderRepository orders;
    private final PaymentRepository payments;
    private final SubscriptionRepository subscriptions;
    private final PromoCodeRepository promos;
    private final PaymentProvider provider;
    private final FakePaymentProvider fake;
    private final int monthlyPrice;
    private final int yearlyPrice;
    private final boolean fakeEnabled;
    private final String webhookSecret;

    public BillingService(
            OrderRepository orders,
            PaymentRepository payments,
            SubscriptionRepository subscriptions,
            PromoCodeRepository promos,
            PaymentProvider provider,
            FakePaymentProvider fake,
            @Value("${billing.pro-monthly-price:990}") int monthlyPrice,
            @Value("${billing.pro-yearly-price:9480}") int yearlyPrice,
            @Value("${billing.fake-enabled:true}") boolean fakeEnabled,
            @Value("${billing.webhook-secret:}") String webhookSecret) {
        this.orders = orders;
        this.payments = payments;
        this.subscriptions = subscriptions;
        this.promos = promos;
        this.provider = provider;
        this.fake = fake;
        this.monthlyPrice = monthlyPrice;
        this.yearlyPrice = yearlyPrice;
        this.fakeEnabled = fakeEnabled;
        this.webhookSecret = webhookSecret == null ? "" : webhookSecret;
    }

    /** Тарифы из конфига (на лендинге те же числа: 990/мес, 790/мес за год). */
    public List<PlanView> plans() {
        return BillingDto.defaultPlans(monthlyPrice, yearlyPrice);
    }

    public String providerName() {
        return provider.name();
    }

    /** Pro сейчас: активная подписка с несгоревшим сроком. */
    @Transactional(readOnly = true)
    public ProState proState(UUID userId) {
        List<Subscription> active = subscriptions
                .findByUserIdAndStatusAndEndsAtAfter(userId, "active", Instant.now());
        if (active.isEmpty()) {
            return new ProState(false, null, null, null);
        }
        Subscription sub = active.get(0);
        return new ProState(true, sub.getId(),
                sub.getEndsAt() == null ? null : sub.getEndsAt().toString(), sub.getPlan());
    }

    @Transactional(readOnly = true)
    public StatusView statusOf(UUID userId) {
        ProState pro = proState(userId);
        return new StatusView(pro.pro(), pro.plan(), pro.endsAt(), provider.name(),
                pro.subscriptionId());
    }

    /** Заказ + платёж у провайдера (ключ идемпотентности — orderId). */
    @Transactional
    public OrderView createOrder(UUID userId, String plan) {
        int price = priceOf(plan);
        int days = daysOf(plan);
        if (days <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "unknown plan");
        }
        Order order = new Order();
        order.setId(UUID.randomUUID());
        order.setUserId(userId);
        order.setPlan(plan);
        order.setAmount(price);
        order.setCurrency("RUB");
        order.setStatus("pending");
        orders.save(order);
        PaymentProvider.CreatedPayment created = provider.createPayment(
                order.getId(), price, "RUB", "AnalystGym Pro (" + plan + ")",
                "https://practice.analystgym.ru/billing/return");
        Payment payment = new Payment();
        payment.setId(UUID.randomUUID());
        payment.setOrderId(order.getId());
        payment.setProviderPaymentId(created.providerPaymentId());
        payment.setStatus(PaymentProvider.normalizeStatus(created.status()));
        payment.setAmount(price);
        payments.save(payment);
        order.setPaymentId(created.providerPaymentId());
        orders.save(order);
        return viewOf(order, created.confirmationUrl());
    }

    @Transactional(readOnly = true)
    public List<AttemptOrderRow> myOrders(UUID userId) {
        List<AttemptOrderRow> rows = new ArrayList<>();
        for (Order order : orders.findByUserIdOrderByCreatedAtDesc(userId)) {
            rows.add(new AttemptOrderRow(order.getId(), order.getPlan(), order.getAmount(),
                    order.getStatus(),
                    order.getCreatedAt() == null ? "" : order.getCreatedAt().toString()));
        }
        return rows;
    }

    /**
     * Вебхук провайдера: подпись проверяем, если задан секрет; повтор
     * уведомления по paid-заказу — тихий дубль без второго Pro.
     */
    @Transactional
    public WebhookResponse webhook(String providerPaymentId, String rawStatus, String signature) {
        if (!webhookSecret.isBlank() && !webhookSecret.equals(signature == null ? "" : signature)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "bad signature");
        }
        if (providerPaymentId == null || providerPaymentId.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "no payment id");
        }
        Order order = orders.findByPaymentId(providerPaymentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        String status = PaymentProvider.normalizeStatus(rawStatus);
        payments.findByProviderPaymentId(providerPaymentId).ifPresent(payment -> {
            payment.setStatus(status);
            payments.save(payment);
        });
        if ("paid".equals(order.getStatus()) || "succeeded".equals(order.getStatus())) {
            return new WebhookResponse(true, order.getStatus());
        }
        if ("succeeded".equals(status)) {
            order.setStatus("paid");
            orders.save(order);
            grant(order.getUserId(), order.getPlan(), daysOf(order.getPlan()), "order");
            return new WebhookResponse(false, "paid");
        }
        if ("canceled".equals(status)) {
            order.setStatus("canceled");
            orders.save(order);
            return new WebhookResponse(false, "canceled");
        }
        return new WebhookResponse(false, order.getStatus());
    }

    /** Тестовое подтверждение fake-платежа (только при fake-enabled). */
    @Transactional
    public WebhookResponse testConfirm(String providerPaymentId) {
        if (!fakeEnabled || !"fake".equals(provider.name())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "test confirm disabled");
        }
        if (fake.confirm(providerPaymentId) == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        return webhook(providerPaymentId, "succeeded", webhookSecret);
    }

    /** Ручной промокод: продлевает активную подписку или открывает новую. */
    @Transactional
    public SubscriptionView redeem(UUID userId, String rawCode) {
        String code = rawCode == null ? "" : rawCode.trim().toUpperCase(Locale.ROOT);
        PromoCode promo = promos.findById(code)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!promo.isActive() || promo.getUsedCount() >= promo.getMaxUses()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "promo exhausted");
        }
        if (promo.getProDays() <= 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "promo exhausted");
        }
        promo.setUsedCount(promo.getUsedCount() + 1);
        promos.save(promo);
        Subscription sub = grant(userId, "pro-promo", promo.getProDays(), "promo:" + code);
        return viewOf(sub);
    }

    /** Отмена автопродления: доступ живёт до конца периода. */
    @Transactional
    public SubscriptionView cancel(UUID userId, UUID subscriptionId) {
        Subscription sub = subscriptions.findById(subscriptionId)
                .filter(s -> userId.equals(s.getUserId()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        sub.setCancelAtPeriodEnd(true);
        subscriptions.save(sub);
        return viewOf(sub);
    }

    @Transactional(readOnly = true)
    public List<SubscriptionView> mySubscriptions(UUID userId) {
        List<SubscriptionView> rows = new ArrayList<>();
        for (Subscription sub : subscriptions.findByUserIdOrderByEndsAtDesc(userId)) {
            rows.add(viewOf(sub));
        }
        return rows;
    }

    /* ---------- персонал (SUPERADMIN) ---------- */

    @Transactional
    public PromoView createPromo(UUID authorId, String rawCode, Integer proDays, Integer maxUses) {
        String code = rawCode == null ? "" : rawCode.trim().toUpperCase(Locale.ROOT);
        if (!code.matches("[A-Z0-9-]{4,32}")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "bad code");
        }
        if (promos.existsById(code)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "promo exists");
        }
        int days = proDays == null ? 30 : proDays;
        int uses = maxUses == null ? 1 : maxUses;
        if (days < 1 || days > 365 || uses < 1 || uses > 10000) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "bad promo limits");
        }
        PromoCode promo = new PromoCode();
        promo.setCode(code);
        promo.setProDays(days);
        promo.setMaxUses(uses);
        promo.setUsedCount(0);
        promo.setActive(true);
        promo.setCreatedBy(authorId);
        promos.save(promo);
        return viewOf(promo);
    }

    @Transactional(readOnly = true)
    public List<PromoView> listPromos() {
        List<PromoView> rows = new ArrayList<>();
        for (PromoCode promo : promos.findAll()) {
            rows.add(viewOf(promo));
        }
        return rows;
    }

    @Transactional
    public PromoView setPromoActive(String code, boolean active) {
        PromoCode promo = promos.findById(code)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        promo.setActive(active);
        promos.save(promo);
        return viewOf(promo);
    }

    /** Ручная выдача Pro поддержкой (пилоты, компенсации): пишет аудит вызывающий. */
    @Transactional
    public SubscriptionView grantPro(UUID userId, int proDays) {
        if (proDays < 1 || proDays > 365) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "bad days");
        }
        return viewOf(grant(userId, "pro-grant", proDays, "support"));
    }

    @Transactional(readOnly = true)
    public List<AttemptOrderRow> allOrders(String status, int limit) {
        List<AttemptOrderRow> rows = new ArrayList<>();
        int max = Math.max(1, Math.min(limit <= 0 ? 100 : limit, 500));
        for (Order order : orders.findAll()) {
            if (status != null && !status.isBlank() && !status.equals(order.getStatus())) {
                continue;
            }
            rows.add(new AttemptOrderRow(order.getId(), order.getPlan(), order.getAmount(),
                    order.getStatus(),
                    order.getCreatedAt() == null ? "" : order.getCreatedAt().toString()));
            if (rows.size() >= max) {
                break;
            }
        }
        return rows;
    }

    /* ---------- внутреннее ---------- */

    private int priceOf(String plan) {
        if ("pro-monthly".equals(plan)) {
            return monthlyPrice;
        }
        if ("pro-yearly".equals(plan)) {
            return yearlyPrice;
        }
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "unknown plan");
    }

    private int daysOf(String plan) {
        if ("pro-monthly".equals(plan)) {
            return 30;
        }
        if ("pro-yearly".equals(plan)) {
            return 365;
        }
        return 0;
    }

    /** Продление активной или новая подписка (история хранится, не правится). */
    private Subscription grant(UUID userId, String plan, int days, String source) {
        Instant now = Instant.now();
        List<Subscription> active =
                subscriptions.findByUserIdAndStatusAndEndsAtAfter(userId, "active", now);
        if (!active.isEmpty()) {
            Subscription sub = active.get(0);
            sub.setEndsAt(sub.getEndsAt().plus(days, ChronoUnit.DAYS));
            subscriptions.save(sub);
            return sub;
        }
        Subscription sub = new Subscription();
        sub.setId(UUID.randomUUID());
        sub.setUserId(userId);
        sub.setPlan(plan);
        sub.setStatus("active");
        sub.setStartedAt(now);
        sub.setEndsAt(now.plus(days, ChronoUnit.DAYS));
        sub.setCancelAtPeriodEnd(false);
        sub.setSource(source);
        subscriptions.save(sub);
        return sub;
    }

    private static OrderView viewOf(Order order, String confirmationUrl) {
        return new OrderView(order.getId(), order.getPlan(), order.getAmount(),
                order.getCurrency(), order.getStatus(), confirmationUrl,
                order.getCreatedAt() == null ? "" : order.getCreatedAt().toString());
    }

    private static SubscriptionView viewOf(Subscription sub) {
        return new SubscriptionView(sub.getId(), sub.getPlan(), sub.getStatus(),
                sub.getStartedAt() == null ? "" : sub.getStartedAt().toString(),
                sub.getEndsAt() == null ? "" : sub.getEndsAt().toString(),
                sub.isCancelAtPeriodEnd(), sub.getSource());
    }

    private static PromoView viewOf(PromoCode promo) {
        return new PromoView(promo.getCode(), promo.getProDays(), promo.getMaxUses(),
                promo.getUsedCount(), promo.isActive());
    }
}
