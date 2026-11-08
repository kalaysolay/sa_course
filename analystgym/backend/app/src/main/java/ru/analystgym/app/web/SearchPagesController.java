package ru.analystgym.app.web;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.safety.Safelist;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.util.HtmlUtils;
import org.springframework.web.util.UriComponentsBuilder;
import ru.analystgym.catalog.domain.Task;
import ru.analystgym.catalog.repo.TaskRepository;

/** Публичный HTML из тех же задач БД: без эталонов, персональных данных и зависимости от JS. */
@RestController
public class SearchPagesController {
    private final TaskRepository tasks;
    private final ObjectMapper json;
    private final String base;
    private final String metrikaId;
    private static final List<String> PAGES = List.of("/", "/practice.html", "/catalog.html");

    /** Адрес сайта берётся только из конфигурации; непустой ID счётчика должен быть числовым. */
    public SearchPagesController(TaskRepository tasks, ObjectMapper json,
            @Value("${app.site.base-url}") String base,
            @Value("${analytics.metrika-id:}") String metrikaId) {
        this.tasks = tasks;
        this.json = json;
        this.base = base.replaceAll("/+$", "");
        this.metrikaId = metrikaId.matches("[1-9][0-9]{0,14}") ? metrikaId : "";
    }

    /** Роботам доступны страницы и ресурсы; приватные страницы исключает также X-Robots-Tag. */
    @GetMapping(value = "/robots.txt", produces = "text/plain;charset=UTF-8")
    public String robots() {
        return "User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /docs/\nSitemap: " + base + "/sitemap.xml\n";
    }

    /** Карта содержит только канонические страницы и опубликованные задачи. */
    @GetMapping(value = "/sitemap.xml", produces = "application/xml;charset=UTF-8")
    public String sitemap() {
        var xml = new StringBuilder("<?xml version=\"1.0\" encoding=\"UTF-8\"?><urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">");
        PAGES.forEach(path -> xml.append("<url><loc>").append(escape(base + path)).append("</loc></url>"));
        tasks.publishedIds().stream().sorted().forEach(id -> xml.append("<url><loc>")
                .append(escape(taskUrl(id))).append("</loc></url>"));
        return xml.append("</urlset>").toString();
    }

    /** Публичная настройка счётчика, без доступа к секретам окружения. */
    @GetMapping("/api/site-config")
    public ResponseEntity<Map<String, String>> config() {
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(Map.of("metrikaId", metrikaId));
    }

    /** Главная и практика сохраняют макет; каталог дополнен ссылками из БД. */
    @GetMapping(value = {"/", "/index.html", "/practice.html", "/catalog.html"}, produces = "text/html;charset=UTF-8")
    public ResponseEntity<String> page(jakarta.servlet.http.HttpServletRequest request) throws IOException {
        String path = request.getRequestURI();
        String canonical = path.equals("/index.html") ? "/" : path;
        Document doc = load(canonical.equals("/") ? "index.html" : canonical.substring(1));
        if (canonical.equals("/catalog.html")) {
            Element rows = doc.getElementById("taskRows");
            for (Task task : tasks.search(null, null, "published", null).stream()
                    .sorted(java.util.Comparator.comparing(Task::getId)).toList()) {
                Element row = rows.appendElement("a").attr("class", "task-row").attr("href", taskPath(task.getId()));
                row.appendElement("span").text("—");
                row.appendElement("div").attr("class", "task-title").text(task.getTitle());
                Element tags = row.appendElement("div").attr("class", "task-tags");
                for (String tag : task.getTags()) tags.appendElement("span").attr("class", "chip").text(tag);
                row.appendElement("div").attr("class", "task-rate").text("—");
                row.appendElement("div").attr("class", "task-time").text(task.getTimeMin() + " мин");
            }
        }
        metadata(doc, base + canonical, doc.title(), doc.selectFirst("meta[name=description]").attr("content"));
        if (canonical.equals("/")) structured(doc, Map.of("@context", "https://schema.org", "@type", "WebSite",
                "name", "AnalystGym", "url", base + "/", "inLanguage", "ru"));
        return html(doc);
    }

    /** Старые ссылки остаются рабочими; неопубликованная или отсутствующая задача возвращает 404. */
    @GetMapping(value = "/task.html", produces = "text/html;charset=UTF-8")
    public ResponseEntity<String> task(@RequestParam(required = false) String id) throws IOException {
        Task task = id == null ? null : tasks.findById(id).filter(t -> "published".equals(t.getStatus())).orElse(null);
        if (task == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        Document doc = load("task.html");
        Element host = doc.getElementById("taskHost");
        host.appendElement("nav").attr("aria-label", "Хлебные крошки").appendElement("a")
                .attr("href", "/catalog.html").text("Каталог задач");
        Element article = host.appendElement("article").attr("class", "panel statement");
        article.appendElement("h1").text(task.getTitle());
        JsonNode statement = task.getStatement();
        if (statement != null && statement.isObject()) {
            section(article, statement, "brief", "Коротко");
            section(article, statement, "context", "Контекст");
            section(article, statement, "goal", "Что нужно сделать");
            section(article, statement, "inputs", "Входные данные");
            section(article, statement, "deliverables", "Что должно быть в решении");
            section(article, statement, "constraints", "Ограничения");
            section(article, statement, "interview", "Как это звучит на собеседовании");
        }
        article.appendElement("noscript").text("Для редактора и отправки решения включите JavaScript. Условие доступно выше.");
        String description = statement == null ? task.getTitle() : Jsoup.parse(statement.path("goal").asText(task.getTitle())).text();
        metadata(doc, taskUrl(id), task.getTitle() + " — AnalystGym", description.substring(0, Math.min(180, description.length())));
        structured(doc, Map.of("@context", "https://schema.org", "@type", "LearningResource", "name", task.getTitle(),
                "url", taskUrl(id), "inLanguage", "ru", "learningResourceType", "Практическая задача"));
        return html(doc);
    }

    private Document load(String file) throws IOException {
        Document doc = Jsoup.parse(new ClassPathResource("static/" + file).getContentAsString(StandardCharsets.UTF_8));
        doc.outputSettings().prettyPrint(false);
        return doc;
    }

    private void section(Element article, JsonNode statement, String field, String title) {
        JsonNode value = statement.get(field);
        if (value == null || value.isNull()) return;
        article.appendElement("h2").text(title);
        if (value.isArray()) {
            Element list = article.appendElement(field.equals("deliverables") ? "ol" : "ul");
            value.forEach(item -> list.appendElement("li").html(clean(item.asText())));
        } else article.appendElement("p").html(clean(value.asText()));
    }

    private String clean(String html) {
        // Серверный HTML не может полагаться на клиентский safeHtml: убираем скрипты и обработчики событий.
        return Jsoup.clean(html, Safelist.relaxed().removeTags("img"));
    }

    private void metadata(Document doc, String url, String title, String description) {
        doc.title(title);
        doc.select("meta[name=description],link[rel=canonical],meta[property^=og:],meta[name^=twitter:]").remove();
        doc.head().appendElement("meta").attr("name", "description").attr("content", description);
        doc.head().appendElement("link").attr("rel", "canonical").attr("href", url);
        Map.of("og:type", "website", "og:site_name", "AnalystGym", "og:title", title,
                "og:description", description, "og:url", url, "og:image", base + "/assets/logo.png", "og:locale", "ru_RU")
                .forEach((key, value) -> doc.head().appendElement("meta").attr("property", key).attr("content", value));
        doc.head().appendElement("meta").attr("name", "twitter:card").attr("content", "summary");
        doc.head().appendElement("script").attr("src", "/assets/js/analytics.js?v=20261105").attr("defer", "");
    }

    private void structured(Document doc, Map<String, String> data) throws JsonProcessingException {
        doc.head().appendElement("script").attr("type", "application/ld+json")
                .appendChild(new org.jsoup.nodes.DataNode(json.writeValueAsString(data).replace("<", "\\u003c")));
    }

    private ResponseEntity<String> html(Document doc) {
        return ResponseEntity.ok().header("Cache-Control", "no-cache").body(doc.outerHtml());
    }

    private String taskPath(String id) {
        return UriComponentsBuilder.fromPath("/task.html").queryParam("id", id).build().encode().toUriString();
    }

    private String taskUrl(String id) { return base + taskPath(id); }
    private String escape(String value) { return HtmlUtils.htmlEscape(value, StandardCharsets.UTF_8.name()); }
}
