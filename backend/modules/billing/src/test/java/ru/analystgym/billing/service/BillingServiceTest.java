package ru.analystgym.billing.service;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Деньги без БД и сети: промокоды, идемпотентность вебхуков, Pro-статус.
 * Повторное уведомление об оплаченном заказе не открывает второе Pro.
 */
class BillingServiceTest {

    private BillingService billingOf(
            ru.analystgym.billing.repo.OrderRepository orders,
            ru.analystgym.billing.repo.PaymentRepository payments,
            ru.analystgym.billing.repo.SubscriptionRepository subs,
            ru.analystgym.billing.repo.PromoCodeRepository promos,
            PaymentProvider provider) {
        return new BillingService(orders, payments, subs, promos, provider,
                new FakePaymentProvider(), 990, 9480, true, "secret");
    }

    private BillingService simpleBilling() {
        var orders = mock(ru.analystgym.billing.repo.OrderRepository.class);
        var payments = mock(ru.analystgym.billing.repo.PaymentRepository.class);
        var subs = mock(ru.analystgym.billing.repo.SubscriptionRepository.class);
        var promos = mock(ru.analystgym.billing.repo.PromoCodeRepository.class);
        when(orders.save(any())).thenAnswer(call -> call.getArgument(0));
        when(payments.save(any())).thenAnswer(call -> call.getArgument(0));
        when(subs.save(any())).thenAnswer(call -> call.getArgument(0));
        when(promos.save(any())).thenAnswer(call -> call.getArgument(0));
        return billingOf(orders, payments, subs, promos, new FakePaymentProvider());
    }

    @Test
    void повторныйВебхукНеДублируетПро() {
        // given: оплаченный заказ;
        var orders = mock(ru.analystgym.billing.repo.OrderRepository.class);
        var payments = mock(ru.analystgym.billing.repo.PaymentRepository.class);
        var subs = mock(ru.analystgym.billing.repo.SubscriptionRepository.class);
        var promos = mock(ru.analystgym.billing.repo.PromoCodeRepository.class);
        ru.analystgym.billing.domain.Order order = new ru.analystgym.billing.domain.Order();
        order.setId(UUID.randomUUID());
        order.setUserId(UUID.randomUUID());
        order.setPlan("pro-monthly");
        order.setAmount(990);
        order.setStatus("paid");
        order.setPaymentId("pay-1");
        when(orders.findByPaymentId("pay-1")).thenReturn(Optional.of(order));
        when(payments.findByProviderPaymentId("pay-1")).thenReturn(Optional.empty());
        BillingService billing = billingOf(orders, payments, subs, promos, new FakePaymentProvider());

        // when: провайдер шлёт уведомление второй раз;
        var response = billing.webhook("pay-1", "succeeded", "secret");

        // then: тихий дубль, новых подписок не создаём.
        assertThat(response.duplicate()).isTrue();
        assertThat(response.orderStatus()).isEqualTo("paid");
        org.mockito.Mockito.verify(subs, org.mockito.Mockito.never()).save(any());
    }

    @Test
    void вебхукБезПодписиОтклоняется() {
        BillingService billing = simpleBilling();

        assertThatThrownBy(() -> billing.webhook("pay-1", "succeeded", "wrong"))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void промокодПродлеваетАктивнуюПодписку() {
        // given: активная подписка + код на 30 дней;
        var orders = mock(ru.analystgym.billing.repo.OrderRepository.class);
        var payments = mock(ru.analystgym.billing.repo.PaymentRepository.class);
        var subs = mock(ru.analystgym.billing.repo.SubscriptionRepository.class);
        var promos = mock(ru.analystgym.billing.repo.PromoCodeRepository.class);
        UUID userId = UUID.randomUUID();
        ru.analystgym.billing.domain.Subscription sub = new ru.analystgym.billing.domain.Subscription();
        sub.setId(UUID.randomUUID());
        sub.setUserId(userId);
        sub.setPlan("pro-monthly");
        sub.setStatus("active");
        sub.setStartedAt(java.time.Instant.now());
        sub.setEndsAt(java.time.Instant.now().plusSeconds(3600));
        when(subs.findByUserIdAndStatusAndEndsAtAfter(any(), any(), any()))
                .thenReturn(List.of(sub));
        when(subs.save(any())).thenAnswer(call -> call.getArgument(0));
        ru.analystgym.billing.domain.PromoCode promo = new ru.analystgym.billing.domain.PromoCode();
        promo.setCode("PILOT-30");
        promo.setProDays(30);
        promo.setMaxUses(5);
        promo.setUsedCount(0);
        promo.setActive(true);
        when(promos.findById("PILOT-30")).thenReturn(Optional.of(promo));
        when(promos.save(any())).thenAnswer(call -> call.getArgument(0));
        BillingService billing = billingOf(orders, payments, subs, promos, new FakePaymentProvider());

        // when: активируем код;
        var view = billing.redeem(userId, " pilot-30 ");

        // then: та же подписка продлена, код потрачен один раз.
        assertThat(view.id()).isEqualTo(sub.getId());
        assertThat(promo.getUsedCount()).isEqualTo(1);
    }

    @Test
    void исчерпанныйПромокодОтклоняется() {
        var promos = mock(ru.analystgym.billing.repo.PromoCodeRepository.class);
        ru.analystgym.billing.domain.PromoCode promo = new ru.analystgym.billing.domain.PromoCode();
        promo.setCode("OLD");
        promo.setProDays(30);
        promo.setMaxUses(1);
        promo.setUsedCount(1);
        promo.setActive(true);
        when(promos.findById("OLD")).thenReturn(Optional.of(promo));
        BillingService billing = billingOf(
                mock(ru.analystgym.billing.repo.OrderRepository.class),
                mock(ru.analystgym.billing.repo.PaymentRepository.class),
                mock(ru.analystgym.billing.repo.SubscriptionRepository.class),
                promos, new FakePaymentProvider());

        assertThatThrownBy(() -> billing.redeem(UUID.randomUUID(), "OLD"))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void безПодпискиПроВыключен() {
        var subs = mock(ru.analystgym.billing.repo.SubscriptionRepository.class);
        when(subs.findByUserIdAndStatusAndEndsAtAfter(any(), any(), any()))
                .thenReturn(List.of());
        BillingService billing = billingOf(
                mock(ru.analystgym.billing.repo.OrderRepository.class),
                mock(ru.analystgym.billing.repo.PaymentRepository.class),
                subs,
                mock(ru.analystgym.billing.repo.PromoCodeRepository.class),
                new FakePaymentProvider());

        assertThat(billing.proState(UUID.randomUUID()).pro()).isFalse();
    }
}
