package ru.analystgym.app.web;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Set;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/** Исключает служебные страницы и API из поиска; авторизация по-прежнему обеспечивается SecurityConfig. */
@Component
public class SearchIndexingFilter extends OncePerRequestFilter {
    private static final Set<String> PUBLIC = Set.of("/", "/index.html", "/practice.html", "/catalog.html", "/task.html");

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String path = request.getRequestURI();
        if (!PUBLIC.contains(path) && (path.endsWith(".html") || path.startsWith("/api/") || path.startsWith("/docs/"))) {
            response.setHeader("X-Robots-Tag", "noindex, nofollow");
        }
        chain.doFilter(request, response);
    }
}
