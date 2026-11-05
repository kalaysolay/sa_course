package ru.analystgym.app.web;

import java.math.BigDecimal;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.mock.web.MockHttpServletRequest;
import static org.assertj.core.api.Assertions.assertThat;

/** Проверяет географию на поставляемой базе, дробную цену и безопасный резервный вариант. */
class RegionalPricingControllerTest {
    private RegionalPricingController controller() throws Exception {
        return new RegionalPricingController(new ClassPathResource("geoip/dbip-country-lite.mmdb.gz"),
                new BigDecimal("990"), new BigDecimal("5000"), new BigDecimal("11.29"), 3);
    }

    /** IP Казахстана и России получают местные цены; внешний IPv4 и IPv6 — доллары без округления. */
    @Test
    void countriesChooseApprovedPrices() throws Exception {
        try (var pricing = controller()) {
            assertThat(pricing.forAddress("2.132.0.1").currency()).isEqualTo("KZT");
            assertThat(pricing.forAddress("2.132.0.1").monthlyAmount()).isEqualByComparingTo("5000");
            assertThat(pricing.forAddress("77.88.8.8").currency()).isEqualTo("RUB");
            assertThat(pricing.forAddress("77.88.8.8").monthlyAmount()).isEqualByComparingTo("990");
            assertThat(pricing.forAddress("8.8.8.8").monthlyAmount()).isEqualByComparingTo("11.29");
            assertThat(pricing.forAddress("2001:4860:4860::8888").currency()).isEqualTo("USD");
        }
    }

    /** Неизвестные и локальные адреса не должны притворяться РФ или Казахстаном. */
    @Test
    void localAddressesDefaultToUsd() throws Exception {
        try (var pricing = controller()) {
            for (var ip : new String[]{"127.0.0.1", "::1", "10.0.0.1", "192.168.1.2", "0.0.0.0"}) {
                assertThat(pricing.forAddress(ip).country()).isNull();
                assertThat(pricing.forAddress(ip).currency()).isEqualTo("USD");
            }
        }
    }

    /** Клиентские заголовки не меняют страну; общий кеш не смешивает ответы посетителей. */
    @Test
    void ignoresUntrustedCountryHeadersAndDisablesCache() throws Exception {
        try (var pricing = controller()) {
            var request = new MockHttpServletRequest();
            request.setRemoteAddr("8.8.8.8");
            request.addHeader("CF-IPCountry", "KZ");
            request.addHeader("X-Forwarded-For", "77.88.8.8");
            var response = pricing.prices(request);
            assertThat(response.getBody().currency()).isEqualTo("USD");
            assertThat(response.getBody().freeReviewTasks()).isEqualTo(3);
            assertThat(response.getHeaders().getCacheControl()).isEqualTo("no-store");
        }
    }
}
