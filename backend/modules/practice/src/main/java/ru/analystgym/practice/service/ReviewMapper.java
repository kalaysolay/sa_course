package ru.analystgym.practice.service;

import java.util.ArrayList;
import java.util.List;
import com.fasterxml.jackson.databind.JsonNode;
import ru.analystgym.catalog.domain.Task;
import ru.analystgym.review.RecCandidate;
import ru.analystgym.review.ReviewInput;
import ru.analystgym.review.SolutionTab;

/**
 * Маппинг catalog -> review вручную (без Jackson-аннотаций в review-модуле):
 * review остаётся чистой библиотекой, форму JSONB знает только practice.
 * Неизвестные/битые поля терпим (пустые значения), а не падаем.
 */
public final class ReviewMapper {

    private ReviewMapper() {
    }

    /** Задача каталога -> вход движка (рубрика из снапшота или живьём — одна форма). */
    public static ReviewInput toInput(Task task, String levelName, JsonNode rubric) {
        return new ReviewInput(
                task.getId(),
                task.getTitle(),
                task.getLevelId(),
                levelName == null || levelName.isEmpty() ? task.getLevelId() : levelName,
                task.getTags() == null ? List.of() : List.of(task.getTags()),
                expectsDiagram(task.getStarterTabs()),
                mapRubric(rubric),
                strings(task.getInterviewQuestions()));
    }

    /** Вход движка из снапшотов попытки (рубрика заморожена на момент submit). */
    public static ReviewInput toInputFromSnapshot(
            String taskId, String title, String level, String levelName,
            List<String> tags, boolean expectsDiagram, JsonNode rubric, JsonNode interviewQuestions) {
        return new ReviewInput(taskId, title, level, levelName, tags,
                expectsDiagram, mapRubric(rubric), strings(interviewQuestions));
    }

    /** Вкладки решения из JSONB попытки. */
    public static List<SolutionTab> toTabs(JsonNode tabs) {
        List<SolutionTab> result = new ArrayList<>();
        if (tabs == null || !tabs.isArray()) {
            return result;
        }
        for (JsonNode tab : tabs) {
            result.add(new SolutionTab(
                    text(tab, "id"), text(tab, "type"), text(tab, "title"), text(tab, "content")));
        }
        return result;
    }

    /** Кандидаты для рекомендаций: только опубликованные задачи. */
    public static List<RecCandidate> toCandidates(List<Task> tasks) {
        List<RecCandidate> result = new ArrayList<>();
        for (Task task : tasks) {
            result.add(new RecCandidate(task.getId(), task.getTitle(), task.getLevelId(),
                    task.getTags() == null ? List.of() : List.of(task.getTags())));
        }
        return result;
    }

    static List<ReviewInput.CriterionInput> mapRubric(JsonNode rubric) {
        List<ReviewInput.CriterionInput> result = new ArrayList<>();
        if (rubric == null || !rubric.isArray()) {
            return result;
        }
        for (JsonNode criterion : rubric) {
            String id = text(criterion, "id");
            if (id.isEmpty()) {
                continue;
            }
            result.add(new ReviewInput.CriterionInput(
                    id, text(criterion, "title"), textOr(criterion, "weight", "mid"),
                    intOrNull(criterion, "weightValue"), textOr(criterion, "focus", "sa"),
                    strings(criterion.get("keywords")), text(criterion, "why")));
        }
        return result;
    }

    static boolean expectsDiagram(JsonNode starterTabs) {
        if (starterTabs == null || !starterTabs.isArray()) {
            return false;
        }
        for (JsonNode tab : starterTabs) {
            if (!"doc".equals(text(tab, "type"))) {
                return true;
            }
        }
        return false;
    }

    static String text(JsonNode node, String field) {
        if (node == null || !node.has(field) || node.get(field).isNull()) {
            return "";
        }
        return node.get(field).asText("");
    }

    static String textOr(JsonNode node, String field, String fallback) {
        String value = text(node, field);
        return value.isEmpty() ? fallback : value;
    }

    static Integer intOrNull(JsonNode node, String field) {
        if (node == null || !node.has(field) || node.get(field).isNull() || !node.get(field).isNumber()) {
            return null;
        }
        return node.get(field).asInt();
    }

    static List<String> strings(JsonNode node) {
        List<String> result = new ArrayList<>();
        if (node == null || !node.isArray()) {
            return result;
        }
        for (JsonNode item : node) {
            if (item.isTextual() && !item.asText().isEmpty()) {
                result.add(item.asText());
            }
        }
        return result;
    }
}
