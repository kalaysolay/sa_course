package ru.analystgym.practice.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Планировщик воркера ревью. Отдельный конфиг в модуле, а не на приложении:
 * кто владеет задачей — тот и включает её расписание.
 */
@Configuration
@EnableScheduling
public class PracticeScheduling {
}
