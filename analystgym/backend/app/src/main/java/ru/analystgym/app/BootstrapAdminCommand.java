package ru.analystgym.app;

import java.sql.DriverManager;
import java.util.Locale;
import java.util.Map;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import ru.analystgym.identity.security.PasswordPolicy;

/** Создание первого администратора отдельной локальной командой без запуска HTTP и воркеров. */
public final class BootstrapAdminCommand {
    private BootstrapAdminCommand() {
    }

    /** Секреты читаются из окружения; существующий аккаунт никогда не повышается по email. */
    public static void run(Map<String, String> environment) throws Exception {
        String email = required(environment, "APP_BOOTSTRAP_ADMIN_EMAIL").trim().toLowerCase(Locale.ROOT);
        String password = required(environment, "APP_BOOTSTRAP_ADMIN_PASSWORD");
        String name = environment.getOrDefault("APP_BOOTSTRAP_ADMIN_NAME", "Администратор").trim();
        if (email.length() > 254 || !email.matches("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")
                || name.isEmpty() || name.length() > 100) {
            throw new IllegalArgumentException("Некорректный email или имя администратора");
        }
        PasswordPolicy.validate(password);
        String hash = new BCryptPasswordEncoder().encode(password);
        try (var connection = DriverManager.getConnection(required(environment, "APP_DB_URL"),
                required(environment, "APP_DB_USER"), required(environment, "APP_DB_PASSWORD"))) {
            connection.setAutoCommit(false);
            // Две одновременно запущенные команды не создают двух первых администраторов.
            try (var lock = connection.prepareStatement("SELECT pg_advisory_xact_lock(414741444494)")) {
                lock.execute();
            }
            try (var query = connection.prepareStatement("SELECT 1 FROM users WHERE role = 'SUPERADMIN' LIMIT 1");
                    var result = query.executeQuery()) {
                if (result.next()) {
                    throw new IllegalStateException("Первый администратор уже создан; используйте управление ролями");
                }
            }
            try (var insert = connection.prepareStatement(
                    "INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, 'SUPERADMIN')")) {
                insert.setString(1, email);
                insert.setString(2, hash);
                insert.setString(3, name);
                insert.executeUpdate();
            }
            connection.commit();
        }
        System.out.println("Первый администратор создан. Удалите APP_BOOTSTRAP_ADMIN_PASSWORD из окружения.");
    }

    private static String required(Map<String, String> environment, String key) {
        String value = environment.get(key);
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("Не задана переменная " + key);
        }
        return value;
    }
}
