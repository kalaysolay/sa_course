package ru.analystgym.app.config;

import jakarta.servlet.Filter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

/**
 * Определяет продукт по домену запроса и кладёт его в атрибут "product".
 * Один app обслуживает practice. / course. / корневой домен — различаем здесь,
 * а не плодим приложения (механизм parametr product уже есть в ui.js макета).
 * Порядок — самый высокий: продукт должен быть известен всем фильтрам ниже.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class HostProductFilter implements Filter {

    /** Имя атрибута запроса; читается в контроллерах и логах. */
    public static final String PRODUCT_ATTRIBUTE = "product";

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {
        if (request instanceof HttpServletRequest httpRequest) {
            // getServerName() отдаёт хост без порта: "practice.analystgym.ru".
            // Локально без поддоменов (localhost) — считаем, что это practice:
            // разработчик чаще всего смотрит тренажёр.
            String host = httpRequest.getServerName();
            String product = "practice";
            if (host != null && host.startsWith("course.")) {
                product = "course";
            }
            request.setAttribute(PRODUCT_ATTRIBUTE, product);
        }
        // Обязательно идём дальше по цепочке, иначе запрос зависнет.
        chain.doFilter(request, response);
    }
}
