package ru.analystgym.assessment.service;

import java.util.List;
import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * Контракт результата диагностики — 1-в-1 с scoring.js compute().
 * Имена в camelCase совпадают с фронтом (results.js ест без перемаппинга).
 */
public record AssessmentResult(
        double score,
        int scoreRounded,
        GradeRef grade,
        int answeredCount,
        int questionsCount,
        int correctCount,
        List<CompetencyResult> byCompetency,
        List<CompetencyResult> strengths,
        List<CompetencyResult> gaps,
        CompetencyResult weakest,
        CompetencyResult strongest,
        List<DetailRow> detail) {

    public record GradeRef(String id, int min, int max, String name, String title, String note) {
    }

    public record CompetencyResult(
            String id,
            String name,
            String icon,
            /** В JSON — "short" как в SA_DATA (short — ключевое слово Java). */
            @JsonProperty("short") String shortDesc,
            int total,
            int answered,
            int correct,
            /** null — нет отвеченных в компетенции. */
            Integer pct,
            /** strong|ok|weak|bad|null. */
            String tier,
            String tierLabel) {
    }

    public record DetailRow(
            String id,
            String competency,
            int difficulty,
            String question,
            List<String> options,
            int answer,
            Integer chosen,
            boolean answered,
            boolean correct,
            String explain) {
    }

    /** Элемент плана прокачки (buildPlan). */
    public record PlanItem(
            int n,
            String id,
            String title,
            String level,
            List<String> tags,
            String reason,
            boolean done) {
    }

    /** Вопрос как его видит движок. */
    public record QuestionInput(
            String id,
            String competency,
            int difficulty,
            String question,
            List<String> options,
            int answer,
            String explain) {
    }
}
