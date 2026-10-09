package ru.analystgym.catalog.web;

import java.util.List;

/** Карточка задачи для списка каталога. Полные тела — в Фазе 2. */
public record TaskCard(
        String id,
        String title,
        String level,
        List<String> tags,
        int timeMin,
        int solvedRate) {
}
