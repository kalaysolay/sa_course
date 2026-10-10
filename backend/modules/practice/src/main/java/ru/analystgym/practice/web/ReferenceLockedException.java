package ru.analystgym.practice.web;

/**
 * Эталон закрыт: у пользователя пока нет reviewed-попытки по задаче
 * (UC-S07 — спойлер убивает тренировку). Контроллер маппит в 403
 * с телом {"error":"reference_locked"}.
 */
public class ReferenceLockedException extends RuntimeException {
}
