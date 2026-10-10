package ru.analystgym.app.web;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import ru.analystgym.app.config.HostProductFilter;

/**
 * Служебный endpoint для проверок: жив ли app, какой продукт видит,
 * какая версия собрана. Используют Caddy/docker healthcheck и CI-smoke.
 */
@RestController
@RequestMapping("/api")
public class HealthController {

    private final String version;

    public HealthController(@Value("${app.version}") String version) {
        this.version = version;
    }

    /**
     * Всегда 200, пока жив контекст Spring. Продукт берём из атрибута,
     * который положил {@link HostProductFilter}; запасное значение —
     * на случай, если фильтр обойдён (тесты без servlet-конвейера).
     */
    @GetMapping("/health")
    public Map<String, String> health(HttpServletRequest request) {
        Object product = request.getAttribute(HostProductFilter.PRODUCT_ATTRIBUTE);
        return Map.of(
                "status", "UP",
                "product", String.valueOf(product),
                "version", version);
    }
}
