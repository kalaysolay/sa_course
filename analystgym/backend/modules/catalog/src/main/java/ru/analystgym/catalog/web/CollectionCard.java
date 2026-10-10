package ru.analystgym.catalog.web;

import java.util.List;

/** Подборка для витрины. Порядок taskIds задаёт методист — сохраняем как есть. */
public record CollectionCard(
        String id,
        String title,
        String tagline,
        String description,
        String icon,
        String audience,
        List<String> taskIds) {
}
