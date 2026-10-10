package ru.analystgym.billing.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Выбор провайдера: ЮKassa — когда заданы оба ключа из env,
 * иначе тестовый fake. Пустые ключи молча не включаем боевой режим:
 * лучше честный fake в dev, чем полуживая касса.
 */
@Configuration
public class BillingConfig {

    @Bean
    @Primary
    PaymentProvider paymentProvider(
            @Value("${yookassa.shop-id:}") String shopId,
            @Value("${yookassa.secret-key:}") String secretKey,
            FakePaymentProvider fake,
            ObjectMapper mapper) {
        if (!shopId.isBlank() && !secretKey.isBlank()) {
            return new YooKassaProvider(shopId.trim(), secretKey.trim(), mapper);
        }
        return fake;
    }
}
