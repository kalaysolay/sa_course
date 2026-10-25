package ru.analystgym.app;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.InputStream;
import java.sql.DriverManager;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import ru.analystgym.identity.security.PasswordPolicy;
import ru.analystgym.identity.security.Roles;

/** Идемпотентное начальное создание персонала: ввод через stdin, без общих паролей и HTTP API. */
public final class BootstrapStaffCommand {
    private static final Set<String> ALLOWED_ROLES = Set.of(
            Roles.SUPERADMIN, Roles.REVIEWER, Roles.METHODIST, Roles.LLM_ADMIN);

    private BootstrapStaffCommand() {
    }

    /** Пароль принимается только во входном документе и никогда не попадает в результат команды. */
    public record Account(String email, String name, String role, String password) {
    }

    /** Безопасный результат для установщика: существующим пользователям пароль не меняется. */
    public record Result(String email, String role, String status, boolean passwordMatches) {
    }

    /** Все записи создаются в одной транзакции; конфликт не повышает существующий аккаунт. */
    public static List<Result> run(Map<String, String> environment, InputStream input) throws Exception {
        byte[] document = input.readNBytes(65537);
        if (document.length > 65536) {
            throw new IllegalArgumentException("Слишком большой документ начальных пользователей");
        }
        List<Account> accounts;
        try {
            accounts = new ObjectMapper().readValue(document, new TypeReference<List<Account>>() { });
        } catch (Exception ignored) {
            // Ошибка Jackson может содержать исходный JSON с паролями — не передаём её выше.
            throw new IllegalArgumentException("Некорректный JSON начальных пользователей");
        }
        validate(accounts);
        var results = new ArrayList<Result>();
        var encoder = new BCryptPasswordEncoder();
        try (var connection = DriverManager.getConnection(required(environment, "APP_DB_URL"),
                required(environment, "APP_DB_USER"), required(environment, "APP_DB_PASSWORD"))) {
            connection.setAutoCommit(false);
            // Тот же lock, что у --bootstrap-admin: два способа не создают админов одновременно.
            try (var lock = connection.prepareStatement("SELECT pg_advisory_xact_lock(414741444494)")) {
                lock.execute();
            }
            for (Account account : accounts) {
                String email = account.email().trim().toLowerCase(Locale.ROOT);
                try (var existing = connection.prepareStatement("SELECT role,password_hash FROM users WHERE email=?")) {
                    existing.setString(1, email);
                    try (var row = existing.executeQuery()) {
                        if (row.next()) {
                            if (!account.role().equals(row.getString(1))) {
                                throw new IllegalStateException("Email уже занят аккаунтом с другой ролью: " + email);
                            }
                            results.add(new Result(email, account.role(), "existing",
                                    encoder.matches(account.password(), row.getString(2))));
                            continue;
                        }
                    }
                }
                if (Roles.SUPERADMIN.equals(account.role())) {
                    try (var query = connection.prepareStatement("SELECT 1 FROM users WHERE role='SUPERADMIN' LIMIT 1");
                            var row = query.executeQuery()) {
                        if (row.next()) {
                            throw new IllegalStateException("Администратор уже создан; используйте управление ролями");
                        }
                    }
                }
                UUID userId = UUID.randomUUID();
                try (var insert = connection.prepareStatement(
                        "INSERT INTO users(id,email,password_hash,name,role) VALUES (?,?,?,?,?)")) {
                    insert.setObject(1, userId);
                    insert.setString(2, email);
                    insert.setString(3, encoder.encode(account.password()));
                    insert.setString(4, account.name().trim());
                    insert.setString(5, account.role());
                    insert.executeUpdate();
                }
                try (var audit = connection.prepareStatement(
                        "INSERT INTO audit_log(id,user_id,action,target) VALUES (?,NULL,'staff.bootstrap',?)")) {
                    audit.setObject(1, UUID.randomUUID());
                    audit.setString(2, userId + ":" + account.role());
                    audit.executeUpdate();
                }
                results.add(new Result(email, account.role(), "created", true));
            }
            connection.commit();
        }
        return List.copyOf(results);
    }

    /** Проверяем весь документ до транзакции; по одной записи на email и роль. */
    private static void validate(List<Account> accounts) {
        if (accounts == null || accounts.isEmpty() || accounts.size() > ALLOWED_ROLES.size()) {
            throw new IllegalArgumentException("Ожидается от одного до четырёх служебных пользователей");
        }
        var emails = new HashSet<String>();
        var roles = new HashSet<String>();
        for (Account account : accounts) {
            if (account == null || account.email() == null || account.name() == null
                    || account.role() == null || !ALLOWED_ROLES.contains(account.role())) {
                throw new IllegalArgumentException("Некорректная запись служебного пользователя");
            }
            String email = account.email().trim().toLowerCase(Locale.ROOT);
            if (email.length() > 254 || !email.matches("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")
                    || account.name().isBlank() || account.name().trim().length() > 100
                    || !emails.add(email) || !roles.add(account.role())) {
                throw new IllegalArgumentException("Некорректный или повторяющийся email/роль");
            }
            PasswordPolicy.validate(account.password());
        }
    }

    /** Читаем только настройки БД; секретное значение не включаем в сообщение об ошибке. */
    private static String required(Map<String, String> environment, String key) {
        String value = environment.get(key);
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("Не задана переменная " + key);
        }
        return value;
    }
}
