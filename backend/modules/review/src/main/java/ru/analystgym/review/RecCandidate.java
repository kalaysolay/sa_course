package ru.analystgym.review;

import java.util.List;

/**
 * Кандидат в рекомендации «что потренировать дальше».
 * Скоринг (пересечение меток + бонус за уровень) — внутри провайдера,
 * список передаёт вызывающий модуль.
 */
public record RecCandidate(String id, String title, String level, List<String> tags) {
}
