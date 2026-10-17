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
