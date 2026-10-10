package ru.analystgym.catalog.web;

import java.util.List;

/** Словари для фильтров и карточек: уровни + метки одним запросом. */
public record DictionariesResponse(List<LevelDto> levels, List<TagDto> tags) {

    public record LevelDto(
            String id,
            String name,
            String cssClass,
            String profile,
            String timeHint,
            String description) {
    }

    public record TagDto(String id, String name, String category, List<String> synonyms) {
    }
}
