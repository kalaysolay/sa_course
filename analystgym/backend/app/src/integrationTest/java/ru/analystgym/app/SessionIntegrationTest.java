package ru.analystgym.app;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.Cookie;
import java.net.HttpCookie;
import java.sql.DriverManager;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import ru.analystgym.identity.repo.UserRepository;
import ru.analystgym.identity.security.JwtService;
import ru.analystgym.identity.service.AuthService;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** HTTP, настоящие транзакции и миграции: проверяем границы безопасности без моков репозиториев. */
@Testcontainers
@SpringBootTest(properties = {
        "app.admin-emails=boss@example.com", "app.google.enabled=false", "app.mail.enabled=false",
        "ratelimit.login-per-min=1000", "ratelimit.register-per-min=1000", "ratelimit.reset-per-min=1000",
        "review.engine=mock"
})
@AutoConfigureMockMvc
class SessionIntegrationTest {
    @Container
    static final PostgreSQLContainer<?> DB = new PostgreSQLContainer<>("postgres:16-alpine");

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry properties) {
        properties.add("spring.datasource.url", DB::getJdbcUrl);
        properties.add("spring.datasource.username", DB::getUsername);
        properties.add("spring.datasource.password", DB::getPassword);
    }

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired AuthService auth;
    @Autowired UserRepository users;
    @Autowired JwtService jwt;
    @Autowired ru.analystgym.practice.repo.AttemptRepository attempts;
    @Autowired ru.analystgym.practice.repo.ReviewRepository reviews;

    private MvcResult register(String email) throws Exception {
        return mvc.perform(post("/api/auth/register").with(csrf()).contentType("application/json")
                .content(json.writeValueAsString(Map.of("email", email, "password", "password123", "name", "Тест"))))
                .andExpect(status().isCreated()).andReturn();
    }

    private String email() {
        return "test-" + UUID.randomUUID() + "@example.com";
    }

    private Cookie cookie(MvcResult result, String name) {
        return result.getResponse().getHeaders("Set-Cookie").stream()
                .flatMap(value -> HttpCookie.parse(value).stream()).filter(value -> value.getName().equals(name))
                .map(value -> new Cookie(name, value.getValue())).findFirst().orElseThrow();
    }

    private com.fasterxml.jackson.databind.JsonNode bodyOf(MvcResult result) throws Exception {
        return json.readTree(result.getResponse().getContentAsByteArray());
    }

    private Cookie staff(String role) throws Exception {
        String email = email();
        var registered = register(email);
        var user = users.findByEmail(email).orElseThrow();
        user.setRole(role);
        users.saveAndFlush(user);
        return cookie(registered, "ag_access");
    }

    private com.fasterxml.jackson.databind.JsonNode createTask(Cookie editor) throws Exception {
        String title = "Задача " + UUID.randomUUID();
        return bodyOf(mvc.perform(post("/api/admin/tasks").with(csrf()).cookie(editor)
                .contentType("application/json").content(json.writeValueAsString(Map.of("title", title))))
                .andExpect(status().isCreated()).andReturn());
    }

    private com.fasterxml.jackson.databind.JsonNode updateTask(Cookie editor,
            com.fasterxml.jackson.databind.JsonNode task, Map<String, Object> changes) throws Exception {
        var body = new java.util.HashMap<>(changes);
        body.put("version", task.path("version").asLong());
        return bodyOf(mvc.perform(put("/api/admin/tasks/" + task.path("id").asText()).with(csrf()).cookie(editor)
                .contentType("application/json").content(json.writeValueAsString(body)))
                .andExpect(status().isOk()).andReturn());
    }

    private com.fasterxml.jackson.databind.JsonNode publishedTask(Cookie editor) throws Exception {
        var task = createTask(editor);
        task = updateTask(editor, task, Map.of(
                "statement", Map.of("brief", "Новое условие с сервера", "goal", "Спроектировать контракт",
                        "context", List.of("Контекст"), "inputs", List.of(), "deliverables", List.of("Контракт API"),
                        "constraints", List.of(), "interview", "Объясните решение"),
                "rubric", List.of(Map.of("id", "contract", "title", "Контракт API", "weightValue", 7,
                        "focus", "sa", "keywords", List.of("контракт"), "why", "Иначе стороны не договорятся")),
                "authorSolution", Map.of("doc", "<p>Защищённый эталон</p>", "plantuml", "@startuml\nA -> B\n@enduml"),
                "status", "review"));
        return updateTask(editor, task, Map.of("status", "published"));
    }

    @Test
    void публикацияПустойЗадачиОтклоняетсяБезИзмененияРевизии() throws Exception {
        // Нельзя опубликовать карточку, по которой студент не сможет решить задачу.
        var editor = staff("METHODIST");
        var task = updateTask(editor, createTask(editor), Map.of("status", "review"));
        String path = "/api/admin/tasks/" + task.path("id").asText();
        mvc.perform(put(path).with(csrf()).cookie(editor).contentType("application/json")
                .content(json.writeValueAsString(Map.of("version", task.path("version").asLong(), "status", "published"))))
                .andExpect(status().isBadRequest());
        var current = bodyOf(mvc.perform(get(path).cookie(editor)).andExpect(status().isOk()).andReturn());
        assertThat(current.path("version")).isEqualTo(task.path("version"));
        assertThat(current.path("status").asText()).isEqualTo("review");
        assertThat(bodyOf(mvc.perform(get(path + "/revisions").cookie(editor)).andReturn()).size()).isEqualTo(2);
    }

    @Test
    void двеФормыМетодистаНеЗатираютПравкиИНеДублируютНомерРевизии() throws Exception {
        // Настоящая гонка транзакций: обе формы прочитали одну версию.
        var editor = staff("METHODIST");
        var task = createTask(editor);
        String path = "/api/admin/tasks/" + task.path("id").asText();
        String content = json.writeValueAsString(Map.of("version", task.path("version").asLong(), "title", "Первая новая редакция"));
        try (var executor = Executors.newFixedThreadPool(2)) {
            Callable<Integer> edit = () -> mvc.perform(put(path).with(csrf()).cookie(editor)
                    .contentType("application/json").content(content)).andReturn().getResponse().getStatus();
            var results = executor.invokeAll(List.of(edit, edit));
            assertThat(List.of(results.get(0).get(), results.get(1).get())).containsExactlyInAnyOrder(200, 409);
        }
        var revisions = bodyOf(mvc.perform(get(path + "/revisions").cookie(editor)).andReturn());
        assertThat(revisions.size()).isEqualTo(2);
        assertThat(revisions.get(0).path("snapshot").path("title").asText()).isEqualTo("Первая новая редакция");
    }

    @Test
    void студентПолучаетТелоИзБазыАЭталонТолькоПослеСвоегоРевью() throws Exception {
        // Условия и веса совпадают с сервером, авторское решение нельзя скачать как статику.
        var task = publishedTask(staff("METHODIST"));
        String id = task.path("id").asText();
        var registered = register(email());
        var student = cookie(registered, "ag_access");
        var detail = bodyOf(mvc.perform(get("/api/tasks/" + id + "/detail")).andExpect(status().isOk()).andReturn());
        assertThat(detail.path("statement").path("brief").asText()).isEqualTo("Новое условие с сервера");
        assertThat(detail.path("rubric").get(0).path("weightValue").asInt()).isEqualTo(7);
        assertThat(detail.has("authorSolution")).isFalse();
        mvc.perform(get("/assets/js/data-tasks-1.js")).andExpect(status().isNotFound());
        mvc.perform(get("/api/tasks/" + id + "/reference").cookie(student)).andExpect(status().isForbidden());
        var attempt = new ru.analystgym.practice.domain.Attempt();
        attempt.setId(UUID.randomUUID());
        attempt.setUserId(UUID.fromString(bodyOf(registered).path("id").asText()));
        attempt.setTaskId(id); attempt.setTabs(json.createArrayNode());
        attempt.setRubricSnapshot(task.path("rubric")); attempt.setStatus("reviewed");
        attempts.saveAndFlush(attempt);
        var reference = bodyOf(mvc.perform(get("/api/tasks/" + id + "/reference").cookie(student)).andExpect(status().isOk()).andReturn());
        assertThat(reference.path("doc").asText()).contains("Защищённый эталон");
        mvc.perform(get("/api/tasks/" + id + "/reference").cookie(cookie(register(email()), "ag_access")))
                .andExpect(status().isForbidden());
    }

    @Test
    void архивУбираетЗадачуИзКаталогаПодборкиИПрямойСсылки() throws Exception {
        // Архив не должен продолжать показываться из встроенного каталога или состава подборки.
        var editor = staff("METHODIST");
        var task = publishedTask(editor);
        String id = task.path("id").asText();
        var collection = bodyOf(mvc.perform(post("/api/admin/collections").with(csrf()).cookie(editor)
                .contentType("application/json").content(json.writeValueAsString(Map.of("title", "Подборка " + UUID.randomUUID(), "taskIds", List.of(id)))))
                .andExpect(status().isCreated()).andReturn());
        updateTask(editor, task, Map.of("status", "archived"));
        mvc.perform(get("/api/tasks/" + id + "/detail")).andExpect(status().isNotFound());
        mvc.perform(get("/api/tasks/" + id)).andExpect(status().isNotFound());
        var catalog = bodyOf(mvc.perform(get("/api/tasks")).andReturn());
        assertThat(catalog.findValuesAsText("id")).doesNotContain(id);
        var publicCollection = bodyOf(mvc.perform(get("/api/collections/" + collection.path("id").asText())).andReturn());
        assertThat(publicCollection.path("taskIds").size()).isZero();
    }

    @Test
    void изменённаяПослеОткрытияЗадачаНеПринимаетсяНаПроверкуПоДругойРубрике() throws Exception {
        // Пользователь должен увидеть новую редакцию до списания квоты и постановки в очередь.
        var editor = staff("METHODIST"); var task = publishedTask(editor);
        var student = cookie(register(email()), "ag_access");
        updateTask(editor, task, Map.of("title", "Новая редакция задачи"));
        mvc.perform(post("/api/attempts").with(csrf()).cookie(student).contentType("application/json")
                .content(json.writeValueAsString(Map.of("taskId", task.path("id").asText(), "taskVersion", task.path("version").asLong(), "tabs", List.of()))))
                .andExpect(status().isConflict());
    }

    @Test
    void справочникиСохраняютсяВБазеИСтараяФормаПолучаетКонфликт() throws Exception {
        // Переименование не должно теряться после перезагрузки и не должно затирать соседа.
        var editor = staff("METHODIST");
        var tag = (com.fasterxml.jackson.databind.node.ObjectNode) bodyOf(mvc.perform(post("/api/admin/tags").with(csrf()).cookie(editor)
                .contentType("application/json").content(json.writeValueAsString(Map.of("name", "Метка " + UUID.randomUUID()))))
                .andExpect(status().isCreated()).andReturn());
        var stale = tag.deepCopy(); tag.put("name", "Переименованная метка");
        mvc.perform(post("/api/admin/tags").with(csrf()).cookie(editor).contentType("application/json").content(json.writeValueAsBytes(tag))).andExpect(status().isOk());
        mvc.perform(post("/api/admin/tags").with(csrf()).cookie(editor).contentType("application/json").content(json.writeValueAsBytes(stale))).andExpect(status().isConflict());
        var dictionary = bodyOf(mvc.perform(get("/api/dictionaries")).andReturn());
        assertThat(dictionary.path("tags").findValuesAsText("name")).contains("Переименованная метка");
        String path = "/api/admin/tags/" + tag.path("id").asText();
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete(path + "?version=0").with(csrf()).cookie(editor))
                .andExpect(status().isConflict());
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete(path + "?version=1").with(csrf()).cookie(editor))
                .andExpect(status().isNoContent());
    }

    @Test
    void праваАдминкиПроверяютсяПриКаждомЗапросе() throws Exception {
        // Скрытие кнопок недостаточно; прямой вызов API студентом или другой ролью тоже запрещён.
        var student = cookie(register(email()), "ag_access");
        for (String endpoint : List.of("tasks", "tags", "collections", "quality/dashboard", "llm/agents", "users")) {
            mvc.perform(get("/api/admin/" + endpoint).cookie(student)).andExpect(status().isForbidden());
        }
        var reviewer = staff("REVIEWER");
        mvc.perform(get("/api/admin/attempts").cookie(reviewer)).andExpect(status().isOk());
        mvc.perform(post("/api/admin/tasks").with(csrf()).cookie(reviewer).contentType("application/json").content("{\"title\":\"Чужая задача\"}"))
                .andExpect(status().isForbidden());
        var methodist = staff("METHODIST");
        mvc.perform(get("/api/admin/llm/agents").cookie(methodist)).andExpect(status().isForbidden());
    }

    @Test
    void промптыВерсионируютсяИТрафикНеТеряетсяПриРедактировании() throws Exception {
        // Проверяем номера, stale-форму, неизменность рабочей редакции и сумму трафика на реальной БД.
        var llm = staff("LLM_ADMIN");
        var prompts = bodyOf(mvc.perform(get("/api/admin/llm/prompts").cookie(llm)).andExpect(status().isOk()).andReturn());
        String key = prompts.get(0).path("key").asText();
        String route = "/api/admin/llm/prompts/" + key + "/versions";
        var version = bodyOf(mvc.perform(post(route).with(csrf()).cookie(llm).contentType("application/json")
                .content("{\"text\":\"Новый промпт\",\"changelog\":\"Уточнение рубрики\",\"traffic\":0}"))
                .andExpect(status().isCreated()).andReturn());
        String path = "/api/admin/llm/versions/" + version.path("id").asText();
        String body = json.writeValueAsString(Map.of("version", version.path("version").asLong()));
        mvc.perform(post(path + "/promote").with(csrf()).cookie(llm).contentType("application/json").content(body)).andExpect(status().isOk());
        mvc.perform(post(path + "/promote").with(csrf()).cookie(llm).contentType("application/json").content(body)).andExpect(status().isConflict());
        var rows = bodyOf(mvc.perform(get(route).cookie(llm)).andReturn());
        int traffic = 0;
        for (var row : rows) traffic += row.path("traffic").asInt();
        assertThat(traffic).isEqualTo(100);
        var active = rows.get(0);
        mvc.perform(put(path).with(csrf()).cookie(llm).contentType("application/json")
                .content(json.writeValueAsString(Map.of("version", active.path("version").asLong(), "text", "Попытка затереть рабочий текст"))))
                .andExpect(status().isBadRequest());
    }

    @Test
    void невалиднаяЗаполненнаяФормаНеОставляетПустуюЗадачу() throws Exception {
        // Создание и сохранение формы атомарны, после ошибки не возникает дубликат при повторе.
        var editor = staff("METHODIST");
        String title = "Атомарная задача " + UUID.randomUUID();
        mvc.perform(post("/api/admin/tasks").with(csrf()).cookie(editor).contentType("application/json")
                .content(json.writeValueAsString(Map.of("title", title, "content", Map.of("timeMin", 1)))))
                .andExpect(status().isBadRequest());
        var rows = bodyOf(mvc.perform(get("/api/admin/tasks").cookie(editor)).andReturn());
        assertThat(rows.findValuesAsText("title")).doesNotContain(title);
    }

    @Test
    void устаревшиеФормыУровняАгентаИПровайдераПолучают409() throws Exception {
        // Версионный контракт одинаков для разделов с разными HTTP-методами.
        var editor = staff("SUPERADMIN");
        for (String endpoint : List.of("levels", "llm/agents", "llm/providers")) {
            var rows = bodyOf(mvc.perform(get("/api/admin/" + endpoint).cookie(editor)).andExpect(status().isOk()).andReturn());
            var row = (com.fasterxml.jackson.databind.node.ObjectNode) rows.get(0);
            var stale = row.deepCopy(); row.put("name", "Изменённая запись " + UUID.randomUUID());
            String path = "/api/admin/" + endpoint;
            var request = endpoint.equals("llm/providers") ? post(path) : put(path + "/" + row.path("id").asText());
            mvc.perform(request.with(csrf()).cookie(editor).contentType("application/json").content(json.writeValueAsBytes(row)))
                    .andExpect(status().isOk());
            request = endpoint.equals("llm/providers") ? post(path) : put(path + "/" + row.path("id").asText());
            mvc.perform(request.with(csrf()).cookie(editor).contentType("application/json").content(json.writeValueAsBytes(stale)))
                    .andExpect(status().isConflict());
        }
    }

    @Test
    void жалобуНеМожетЗатеретьВторойРецензент() throws Exception {
        // Реальные данные качества и версия жалобы доходят до браузерного контракта.
        var registered = register(email());
        var student = cookie(registered, "ag_access");
        var attempt = new ru.analystgym.practice.domain.Attempt();
        attempt.setId(UUID.randomUUID());
        attempt.setUserId(UUID.fromString(bodyOf(registered).path("id").asText()));
        attempt.setTaskId("int-idempotency"); attempt.setTabs(json.createArrayNode());
        attempt.setRubricSnapshot(json.createArrayNode()); attempt.setStatus("reviewed");
        attempts.saveAndFlush(attempt);
        var review = new ru.analystgym.practice.domain.Review();
        review.setAttemptId(attempt.getId()); review.setGradeCode(3); review.setScore(55);
        review.setResult(json.createObjectNode()); review.setPromptVersions(json.createObjectNode());
        reviews.saveAndFlush(review);
        var filed = bodyOf(mvc.perform(post("/api/complaints").with(csrf()).cookie(student).contentType("application/json")
                .content(json.writeValueAsString(Map.of("attemptId", attempt.getId(), "reason", "Не учтён критерий контракта API"))))
                .andExpect(status().isCreated()).andReturn());
        var reviewer = staff("REVIEWER");
        var queue = bodyOf(mvc.perform(get("/api/admin/complaints?status=all").cookie(reviewer)).andReturn());
        com.fasterxml.jackson.databind.JsonNode complaint = null;
        for (var row : queue) if (row.path("id").asText().equals(filed.path("id").asText())) complaint = row;
        assertThat(complaint).isNotNull();
        String content = json.writeValueAsString(Map.of("status", "review", "version", complaint.path("version").asLong()));
        String path = "/api/admin/complaints/" + complaint.path("id").asText();
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch(path).with(csrf()).cookie(reviewer)
                .contentType("application/json").content(content)).andExpect(status().isOk());
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch(path).with(csrf()).cookie(reviewer)
                .contentType("application/json").content(content)).andExpect(status().isConflict());
    }

    @Test
    void refreshНеАвторизуетApiИAccessНеОбменивается() throws Exception {
        // Даже подписанный refresh в ag_access не должен давать доступ к профилю.
        var login = register(email());
        mvc.perform(get("/api/auth/me").cookie(new Cookie("ag_access", cookie(login, "ag_refresh").getValue())))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/auth/refresh").with(csrf())
                .cookie(new Cookie("ag_refresh", cookie(login, "ag_access").getValue())))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void ротацияГаситСтаруюПаруИДаётНовую() throws Exception {
        // Старую пару нельзя ни использовать, ни обновить после успешной ротации.
        var login = register(email());
        var rotated = mvc.perform(post("/api/auth/refresh").with(csrf()).cookie(cookie(login, "ag_refresh")))
                .andExpect(status().isOk()).andReturn();
        assertThat(cookie(rotated, "ag_refresh").getValue()).isNotEqualTo(cookie(login, "ag_refresh").getValue());
        mvc.perform(get("/api/auth/me").cookie(cookie(login, "ag_access"))).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/auth/me").cookie(cookie(rotated, "ag_access"))).andExpect(status().isOk());
        mvc.perform(post("/api/auth/refresh").with(csrf()).cookie(cookie(login, "ag_refresh")))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void дваОдновременныхRefreshПроходятТолькоОдинРаз() throws Exception {
        // Проверяем настоящую блокировку PostgreSQL: один токен создаёт ровно одну новую пару.
        var token = cookie(register(email()), "ag_refresh");
        try (var executor = Executors.newFixedThreadPool(2)) {
            Callable<Integer> refresh = () -> mvc.perform(post("/api/auth/refresh").with(csrf())
                    .cookie(token)).andReturn().getResponse().getStatus();
            var results = executor.invokeAll(List.of(refresh, refresh));
            assertThat(List.of(results.get(0).get(), results.get(1).get()))
                    .containsExactlyInAnyOrder(200, 401);
        }
    }

    @Test
    void выходОтзываетAccessИRefresh() throws Exception {
        // Удаление куки недостаточно: проверяем повтор с сохранёнными значениями токенов.
        var login = register(email());
        mvc.perform(post("/api/auth/logout").with(csrf()).cookie(cookie(login, "ag_refresh")))
                .andExpect(status().isOk());
        mvc.perform(get("/api/auth/me").cookie(cookie(login, "ag_access"))).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/auth/refresh").with(csrf()).cookie(cookie(login, "ag_refresh")))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void выходЗакрываетРотациюУспевшуюЗавершитьсяРаньше() throws Exception {
        // Если refresh выиграл гонку с logout, выход по старой куке закрывает его потомка.
        String email = email();
        var login = register(email);
        var otherDevice = auth.login(email, "password123");
        var rotated = mvc.perform(post("/api/auth/refresh").with(csrf()).cookie(cookie(login, "ag_refresh")))
                .andExpect(status().isOk()).andReturn();
        mvc.perform(post("/api/auth/logout").with(csrf()).cookie(cookie(login, "ag_refresh")))
                .andExpect(status().isOk());
        mvc.perform(get("/api/auth/me").cookie(cookie(rotated, "ag_access"))).andExpect(status().isUnauthorized());
        assertThatThrownBy(() -> auth.refresh(cookie(rotated, "ag_refresh").getValue()))
                .isInstanceOf(AuthService.InvalidSessionException.class);
        // Выход на одном устройстве не завершает самостоятельный вход на другом.
        mvc.perform(get("/api/auth/me").cookie(new Cookie("ag_access", otherDevice.access())))
                .andExpect(status().isOk());
    }

    @Test
    void сбросПроверяетПарольИГаситВсеСессии() throws Exception {
        // Неверный новый пароль не расходует ссылку; успешный сброс завершает обе сессии.
        String email = email();
        var login = register(email);
        var second = auth.login(email, "password123");
        String token = auth.requestReset(email);
        mvc.perform(post("/api/auth/password/confirm").with(csrf()).contentType("application/json")
                .content(json.writeValueAsString(Map.of("token", token, "password", "short"))))
                .andExpect(status().isBadRequest());
        auth.confirmReset(token, "new-password123");
        mvc.perform(get("/api/auth/me").cookie(cookie(login, "ag_access"))).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/auth/me").cookie(new Cookie("ag_access", second.access())))
                .andExpect(status().isUnauthorized());
        assertThatThrownBy(() -> auth.refresh(second.refresh())).isInstanceOf(AuthService.InvalidSessionException.class);
        assertThatThrownBy(() -> auth.confirmReset(token, "another-password"))
                .isInstanceOf(AuthService.InvalidSessionException.class);
        assertThat(auth.login(email, "new-password123")).isNotNull();
    }

    @Test
    void сменаПароляГаситТекущуюИДругиеСессии() throws Exception {
        // Пароль и отзыв сессий коммитятся атомарно, новый вход принимает только новый пароль.
        String email = email();
        var login = register(email);
        var second = auth.login(email, "password123");
        mvc.perform(post("/api/auth/password/change").with(csrf()).cookie(cookie(login, "ag_access"))
                .contentType("application/json").content("{\"currentPassword\":\"password123\",\"newPassword\":\"changed-password\"}"))
                .andExpect(status().isOk());
        mvc.perform(get("/api/auth/me").cookie(cookie(login, "ag_access"))).andExpect(status().isUnauthorized());
        assertThatThrownBy(() -> auth.refresh(second.refresh())).isInstanceOf(AuthService.InvalidSessionException.class);
        assertThat(auth.login(email, "changed-password")).isNotNull();
    }

    @Test
    void регистрацияИзСтарогоBootstrapСпискаНеДаётПрав() throws Exception {
        // Даже явно настроенный старый APP_ADMIN_EMAILS больше не является способом повышения роли.
        var login = register("boss@example.com");
        assertThat(json.readTree(login.getResponse().getContentAsString()).path("role").asText()).isEqualTo("STUDENT");
        mvc.perform(get("/api/admin/users").cookie(cookie(login, "ag_access"))).andExpect(status().isForbidden());
    }

    @Test
    void заголовокАккаунтаЗащищаетОтСменыКукВДругойВкладке() throws Exception {
        // Старая вкладка А не может записать её данные под свежими куками Б.
        var login = register(email());
        mvc.perform(put("/api/auth/profile").with(csrf()).cookie(cookie(login, "ag_access"))
                .header("X-Account-ID", UUID.randomUUID()).contentType("application/json")
                .content("{\"name\":\"Чужая запись\"}")).andExpect(status().isConflict());
    }

    @Test
    void конфликтВерсийНеПерезаписываетЧерновик() throws Exception {
        // Устройство со старой версией получает 409, актуальное содержимое остаётся в БД.
        var login = register(email());
        Cookie access = cookie(login, "ag_access");
        String path = "/api/tasks/int-idempotency/draft";
        var first = mvc.perform(put(path).with(csrf()).cookie(access).contentType("application/json")
                .content("{\"tabs\":[{\"id\":\"d\",\"type\":\"doc\",\"title\":\"Решение\",\"content\":\"Первая версия\"}],\"version\":null}"))
                .andExpect(status().isOk()).andReturn();
        long version = json.readTree(first.getResponse().getContentAsString()).path("version").asLong();
        mvc.perform(put(path).with(csrf()).cookie(access).contentType("application/json")
                .content("{\"tabs\":[],\"version\":" + version + "}")).andExpect(status().isOk());
        mvc.perform(put(path).with(csrf()).cookie(access).contentType("application/json")
                .content("{\"tabs\":[],\"version\":" + version + "}")).andExpect(status().isConflict());
    }

    @Test
    void bootstrapСоздаётТолькоНовогоПервогоАдминистратора() throws Exception {
        // Команда не повышает уже зарегистрированный email и отказывается при существующем SUPERADMIN.
        Map<String, String> environment = Map.of("APP_DB_URL", DB.getJdbcUrl(), "APP_DB_USER", DB.getUsername(),
                "APP_DB_PASSWORD", DB.getPassword(), "APP_BOOTSTRAP_ADMIN_EMAIL", email(),
                "APP_BOOTSTRAP_ADMIN_PASSWORD", "bootstrap-password");
        BootstrapAdminCommand.run(environment);
        assertThat(users.findByEmail(environment.get("APP_BOOTSTRAP_ADMIN_EMAIL")).orElseThrow().getRole())
                .isEqualTo("SUPERADMIN");
        assertThatThrownBy(() -> BootstrapAdminCommand.run(environment)).isInstanceOf(IllegalStateException.class);
        try (var connection = DriverManager.getConnection(DB.getJdbcUrl(), DB.getUsername(), DB.getPassword());
                var delete = connection.prepareStatement("DELETE FROM users WHERE email = ?")) {
            delete.setString(1, environment.get("APP_BOOTSTRAP_ADMIN_EMAIL"));
            delete.executeUpdate();
        }
        String occupied = email();
        register(occupied);
        var changed = new java.util.HashMap<>(environment);
        changed.put("APP_BOOTSTRAP_ADMIN_EMAIL", occupied);
        assertThatThrownBy(() -> BootstrapAdminCommand.run(changed)).isInstanceOf(java.sql.SQLException.class);
        assertThat(users.findByEmail(occupied).orElseThrow().getRole()).isEqualTo("STUDENT");
    }
}
