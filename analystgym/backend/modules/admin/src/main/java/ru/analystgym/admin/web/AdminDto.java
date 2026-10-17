package ru.analystgym.admin.web;

import java.util.List;
import java.util.UUID;
import com.fasterxml.jackson.databind.JsonNode;

/**
 * Контракты админки. Формы повторяют admin-tasks.js (collectForm/blankTask)
 * и серверные разделы admin-server.js. Существующие записи изменяются с версией формы.
 */
public final class AdminDto {

    private AdminDto() {
    }

    public record TaskCreateRequest(String title, TaskUpdateRequest content) {
    }

    /** PUT: присланные поля заменяют, отсутствующие остаются как были. */
    public record TaskUpdateRequest(
            String title,
            String level,
            List<String> tags,
            Integer timeMin,
            String status,
            JsonNode statement,
            JsonNode starterTabs,
            List<CriterionDto> rubric,
            List<String> hints,
            List<String> interviewQuestions,
            JsonNode authorSolution, Long version) {
    }

    /** Критерий рубрики как в форме (collectRubric): вес — числом 1–10. */
    public record CriterionDto(
            String id,
            String title,
            Integer weightValue,
            String focus,
            Boolean critical,
            List<String> keywords,
            String why) {
    }

    public record TaskRow(
            String id,
            String title,
            String level,
            String status,
            List<String> tags,
            int timeMin,
            int solvedRate,
            int criteriaCount,
            String updatedAt, Long version) {
    }

    public record TaskFull(
            String id,
            String title,
            String level,
            String status,
            List<String> tags,
            int timeMin,
            int solvedRate,
            JsonNode statement,
            JsonNode starterTabs,
            JsonNode rubric,
            JsonNode hints,
            JsonNode interviewQuestions,
            JsonNode authorSolution,
            String updatedAt, Long version) {
    }

    public record RevisionView(int rev, UUID authorId, String createdAt, JsonNode snapshot) {
    }

    public record SimulateRequest(String text, List<CriterionDto> rubric) {
    }

    public record TaskImportRequest(JsonNode task) {
    }

    public record CollectionDto(
            String id,
            String title,
            String tagline,
            String description,
            String icon,
            String audience,
            List<String> taskIds,
            Boolean active, Long version) {
    }

    public record TagDto(
            String id,
            String name,
            String category,
            List<String> synonyms,
            Boolean active, Long version) {
    }

    public record LevelDto(String name, String description, String profile, String timeHint, Long version) {
    }

    public record QuestionDto(
            String id,
            String competency,
            Integer difficulty,
            String question,
            List<String> options,
            Integer answer,
            String explain,
            Boolean active) {
    }

    public record RoleRequest(String role, String expectedRole) {
    }

    public record ProviderDto(
            String id,
            String name,
            String baseUrl,
            String model,
            String keyEnv,
            Boolean keyPresent,
            Integer timeoutSec,
            Boolean enabled, Long version) {
    }

    public record AgentDto(
            String id,
            String name,
            String role,
            String initials,
            List<String> checks,
            String model,
            Boolean enabled,
            String promptKey, Long version) {
    }

    public record PromptVersionDto(
            UUID id,
            String promptKey,
            int v,
            String status,
            int traffic,
            String model,
            String changelog,
            String text,
            String updatedAt, Long version) {
    }

    public record TrafficRequest(Integer traffic, Long version) {
    }

    public record VersionCreateRequest(
            String text,
            String changelog,
            String model,
            Integer traffic, Long version) {
    }

    public record UserRow(UUID id, String name, String email, String role, String createdAt) {
    }

    public record AuditRow(UUID id, UUID userId, String action, String target, String createdAt) {
    }
}
