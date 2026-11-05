package ru.analystgym.app.web;

import com.maxmind.db.Reader;
import jakarta.annotation.PreDestroy;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.math.BigDecimal;
import java.net.InetAddress;
import java.util.Map;
import java.util.zip.GZIPInputStream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** Публичные цены по стране IP; определение выполняется локально, без передачи IP третьим лицам. */
@RestController
public class RegionalPricingController implements AutoCloseable {
    private static final Logger LOG = LoggerFactory.getLogger(RegionalPricingController.class);
    private final Reader countries;
    private final Map<String, BigDecimal> monthly;
    private final int freeReviewTasks;

    /** Загружает одну общую базу стран и согласованные месячные цены из конфигурации. */
    public RegionalPricingController(
            @Value("${pricing.country-database}") Resource database,
            @Value("${pricing.monthly-rub}") BigDecimal rub,
            @Value("${pricing.monthly-kzt}") BigDecimal kzt,
            @Value("${pricing.monthly-usd}") BigDecimal usd,
            @Value("${billing.free-review-tasks:2}") int freeReviewTasks) throws IOException {
        monthly = Map.of("RUB", rub, "KZT", kzt, "USD", usd);
        this.freeReviewTasks = freeReviewTasks;
        try (var input = new GZIPInputStream(database.getInputStream())) {
            countries = new Reader(input);
        }
    }

    /** Не кеширует региональный ответ в общих прокси; заголовки страны от клиента не принимает. */
    @GetMapping("/api/pricing")
    public ResponseEntity<PriceView> prices(HttpServletRequest request) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(forAddress(request.getRemoteAddr()));
    }

    PriceView forAddress(String address) {
        String country = null;
        try {
            // Здесь только числовой адрес сокета от контейнера, а не пользовательский hostname.
            var ip = InetAddress.getByName(address);
            if (!ip.isAnyLocalAddress() && !ip.isLoopbackAddress() && !ip.isSiteLocalAddress()) {
                var record = countries.get(ip, Map.class);
                if (record != null && record.get("country") instanceof Map<?, ?> info
                        && info.get("iso_code") instanceof String code) {
                    country = code;
                }
            }
        } catch (IOException ex) {
            // Не включаем IP и сообщение исключения с IP в журнал.
            LOG.warn("Не удалось определить страну для цены; используется USD");
        }
        String currency = "KZ".equals(country) ? "KZT" : "RU".equals(country) ? "RUB" : "USD";
        return new PriceView(country, currency, monthly.get(currency), freeReviewTasks);
    }

    /** Освобождает базу при остановке приложения. */
    @PreDestroy
    public void close() throws IOException {
        countries.close();
    }

    /** Сумма в основных единицах валюты, а не в копейках/центах; платёж этим ответом не создаётся. */
    public record PriceView(String country, String currency, BigDecimal monthlyAmount, int freeReviewTasks) { }
}
