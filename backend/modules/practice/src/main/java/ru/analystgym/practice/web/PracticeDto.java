package ru.analystgym.practice.web;

import java.util.List;
import java.util.UUID;
import com.fasterxml.jackson.databind.JsonNode;

/**
 * Контракты practice-API. Имена в camelCase совпадают с фронтом (api.js):
 * фронт ест этот JSON без перемаппинга, как каталог в Фазе 1.
 */
public final class PracticeDto {

    private PracticeDto() {
    }

    /** Вкладка решения (форма совпадает с Store/task.js). */
    public record TabDto(String id, String type, String title, String content) {
    }

    public record SubmitRequest(String taskId, List<TabDto> tabs) {
    }

    public record DraftRequest(List<TabDto> tabs) {
    }

    public record SubmitResponse(UUID attemptId, String taskId, String status) {
    }

    public record DraftResponse(String taskId, JsonNode tabs, String updatedAt) {
    }

    /** Состояние попытки для polling (GET /api/attempts/{id}). */
    public record AttemptView(
            UUID attemptId,
            String taskId,
            /** queued | in_review | reviewed | failed. */
            String status,
            /** 0–100 из review_jobs. */
            int progress,
            /** system | sa | arch | grading | done. */
            String stage,
            String submittedAt,
            GradeView grade,
            /** Полный ReviewResult — только когда reviewed. */
            JsonNode review,
            String error,
            /** Учёт LLM: токены и версии промптов (у mock нули). */
            Integer inputTokens,
            Integer outputTokens,
            JsonNode promptVersions) {
    }

    public record GradeView(int code, String label, String headline, String tone, int score) {
    }

    /** Строка истории попыток (GET /api/tasks/{id}/attempts). */
    public record AttemptSummary(
            UUID attemptId,
            String status,
            Integer score,
            Integer gradeCode,
            String gradeLabel,
            String submittedAt,
            int tabsCount) {
    }

    /** Полное тело задачи без эталона (публично). */
    public record TaskDetail(
            String id,
            String title,
            String level,
            List<String> tags,
            int timeMin,
            int solvedRate,
            String status,
            JsonNode statement,
            JsonNode starterTabs,
            JsonNode rubric,
            JsonNode hints,
            JsonNode interviewQuestions) {
    }
}
