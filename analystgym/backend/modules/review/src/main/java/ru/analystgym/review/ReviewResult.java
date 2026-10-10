package ru.analystgym.review;

import java.util.List;

/**
 * Контракт ReviewResult — 1-в-1 с tasks-mockup/assets/js/review-engine.js.
 * Имена полей в camelCase совпадают с JS: фронт (task.js renderReview)
 * потребляет этот JSON без перемаппинга.
 */
public record ReviewResult(
        String id,
        String taskId,
        String submittedAt,
        String engine,
        Grade grade,
        String summary,
        List<String> why,
        List<CriterionReview> criteria,
        List<AgentReview> agents,
        Signals signals,
        Stats stats,
        List<Recommendation> recommendations) {

    public record Grade(int code, String label, String headline, String tone, int score) {
    }

    public record CriterionReview(
            String id,
            String title,
            String weight,
            Integer weightValue,
            String focus,
            String why,
            /** hit (>=2 маркеров) | partial (1) | miss (0). */
            String state,
            List<String> matched,
            /** Подтверждающее предложение из решения (<=170 символов) или "". */
            String evidence) {
    }

    public record AgentReview(
            String id,
            String name,
            String role,
            String initials,
            List<String> checks,
            /** Оценка агента 0–10. */
            int score,
            /** Покрытие своей зоны 0–100. */
            int coverage,
            List<Covered> covered,
            List<Missed> missed,
            String narrative,
            List<Improve> improve,
            List<String> questions) {
    }

    public record Covered(String title, String detail, String weight) {
    }

    public record Missed(String title, String state, boolean critical, String why) {
    }

    public record Improve(String title, String detail) {
    }

    public record Signals(
            boolean numbers,
            boolean alternatives,
            boolean structure,
            boolean diagram,
            boolean validation,
            boolean risks,
            boolean people,
            boolean metrics,
            boolean tooShort,
            boolean empty) {
    }

    public record Stats(
            int words,
            int tabs,
            int diagramTabs,
            int criteriaTotal,
            int criteriaHit,
            int criteriaPartial,
            int criteriaMiss) {
    }

    public record Recommendation(String id, String title, String level) {
    }
}
