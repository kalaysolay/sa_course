package ru.analystgym.review;

/**
 * Одна вкладка решения студента: документ (HTML из WYSIWYG)
 * либо диаграмма (PlantUML/Mermaid как plain-text).
 */
public record SolutionTab(String id, String type, String title, String content) {
}
