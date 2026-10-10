package ru.analystgym.app;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;

/**
 * Точка входа AnalystGym.
 * Сканируем весь корень ru.analystgym, чтобы подхватить бины всех модулей:
 * добавлять scanBasePackages под каждый новый модуль не нужно.
 * Репозитории и сущности лежат вне пакета приложения (модули identity/catalog/...),
 * поэтому JPA-скан тоже расширяем явно: авто-конфигурация иначе смотрит
 * только в ru.analystgym.app и падает NoSuchBean для репозиториев.
 */
@SpringBootApplication(scanBasePackages = "ru.analystgym")
@EnableJpaRepositories("ru.analystgym")
@EntityScan("ru.analystgym")
public class AnalystGymApplication {

    public static void main(String[] args) {
        SpringApplication.run(AnalystGymApplication.class, args);
    }
}
