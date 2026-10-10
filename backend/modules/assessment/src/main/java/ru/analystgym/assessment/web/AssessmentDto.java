package ru.analystgym.assessment.web;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import com.fasterxml.jackson.databind.JsonNode;
import ru.analystgym.assessment.service.AssessmentResult;

/**
 * Контракты assessment-API. Имена в camelCase совпадают с фронтом
 * (results.js): разбор ответов и план ест без перемаппинга.
 */
public final class AssessmentDto {

    private AssessmentDto() {
    }

    /** Вопрос без ответа и разбора (так его видит студент до финиша). */
    public record QuestionCard(
            String id,
            String competency,
            int difficulty,
            String question,
            List<String> options) {
    }

    public record SubmitRequest(Map<String, Integer> answers, Integer durationSec) {
    }

    public record SubmitResponse(UUID submissionId, AssessmentResult result) {
    }

    /** Строка истории замеров (без тяжёлого result). */
    public record SubmissionSummary(
            UUID submissionId,
            double score,
            int scoreRounded,
            String gradeId,
            String gradeName,
            int answeredCount,
            int correctCount,
            String createdAt) {
    }

    public record SubmissionView(
            UUID submissionId,
            double score,
            int scoreRounded,
            AssessmentResult.GradeRef grade,
            int answeredCount,
            int correctCount,
            int durationSec,
            String createdAt,
            AssessmentResult result) {
    }

    public record PlanResponse(
            UUID submissionId,
            List<AssessmentResult.PlanItem> tasks,
            String catalogUrl,
            List<String> narrative,
            Map<String, String> market) {
    }

    /** Сырые ответы хранить негде — сериализуем мапу как есть. */
    public static JsonNode answersNode(com.fasterxml.jackson.databind.ObjectMapper mapper,
                                       Map<String, Integer> answers) {
        return mapper.valueToTree(answers == null ? Map.of() : answers);
    }
}
