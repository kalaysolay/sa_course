package ru.analystgym.quality.web;

import java.util.List;
import java.util.UUID;
import com.fasterxml.jackson.databind.JsonNode;

/**
 * Контракты контура качества. Формы повторяют admin-ops.js: очередь
 * с KPI по статусам, KPI попыток, дашборд с attention и MISS-топом.
 */
public final class QualityDto {

    private QualityDto() {
    }

    public record FileComplaintRequest(UUID attemptId, String reason) {
    }

    public record ComplaintView(
            UUID id,
            String taskId,
            String taskTitle,
            UUID attemptId,
            String userName,
            int score,
            String reason,
            String excerpt,
            String promptVersion,
            String status,
            String resolution,
            String createdAt) {
    }

    public record ResolveRequest(String status, String resolution) {
    }

    public record Dashboard(
            Kpi kpi,
            List<AttentionItem> attention,
            List<MissItem> topMiss,
            List<ComplaintView> recent) {
    }

    public record Kpi(
            long tasksPublished,
            long tasksTotal,
            long attempts,
            Double avgScore,
            long complaintsNew) {
    }

    public record AttentionItem(
            String taskId,
            String taskTitle,
            long complaints,
            Double avgScore) {
    }

    public record MissItem(String title, String taskId, long count) {
    }

    public record AttemptRow(
            UUID attemptId,
            String taskId,
            String taskTitle,
            String userName,
            Integer score,
            String gradeLabel,
            int criteriaHit,
            int criteriaTotal,
            Integer saScore,
            Integer archScore,
            String status,
            String submittedAt) {
    }

    public record AttemptDetail(
            UUID attemptId,
            String taskId,
            String taskTitle,
            String userName,
            String status,
            String submittedAt,
            JsonNode tabs,
            JsonNode review) {
    }

    public record StudentRow(
            UUID id,
            String name,
            String email,
            String role,
            long attempts,
            Double avgScore,
            String lastActive) {
    }

    public record StudentCard(StudentRow student, List<AttemptRow> recent) {
    }
}
