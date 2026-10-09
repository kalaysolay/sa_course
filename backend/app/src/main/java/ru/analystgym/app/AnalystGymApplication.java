package ru.analystgym.app;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Точка входа AnalystGym.
 * Сканируем весь корень ru.analystgym, чтобы подхватить бины всех модулей:
 * добавлять scanBasePackages под каждый новый модуль не нужно.
 */
@SpringBootApplication(scanBasePackages = "ru.analystgym")
public class AnalystGymApplication {

    public static void main(String[] args) {
        SpringApplication.run(AnalystGymApplication.class, args);
    }
}
