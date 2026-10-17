package ru.analystgym.review;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Сборка ReviewResult из ответа LLM. Модель привозит только факты
 * (состояния критериев + тексты агентов), грейд считает код той же
 * формулой, что mock (ADR-04): веса, колпаки, why, summary, agents-score.
 * Ответ валидируем строго: неизвестный критерий, левое состояние или
 * пустой нарратив — LlmBadResponse (ретрай, потом failed, не молча).
 */
public final class LlmReviewer {

    private static final ObjectMapper MAPPER = new ObjectMapper()
            .enable(com.fasterxml.jackson.core.JsonParser.Feature.STRICT_DUPLICATE_DETECTION)
            .enable(com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_TRAILING_TOKENS);

    /** Визитка агента из БД (имена/фокус правит методист, видит студент). */
    public record Persona(String id, String name, String role, String initials, List<String> checks) {
    }

    /** Невалидный ответ модели (схема нарушена). */
    public static class LlmBadResponse extends RuntimeException {
        public LlmBadResponse(String message) {
            super(message);
        }
    }

    private LlmReviewer() {
    }

    /**
     * Разбирает единственный JSON-объект одного агента; обёртки и мусор отклоняются.
     */
    public static ParsedAnswer parseAgent(String rawText, ReviewInput task, String agentId, String solution) {
        String text = rawText == null ? "" : rawText.trim();
        JsonNode root;
        try {
            root = MAPPER.readTree(text);
        } catch (Exception e) {
            throw new LlmBadResponse("not json");
        }
        if (root == null || !root.isObject()) {
            throw new LlmBadResponse("not object");
        }
        var fields = java.util.Set.of("criteria", "narrative", "covered", "missed", "improve", "questions");
        root.fieldNames().forEachRemaining(key -> {
            if (!fields.contains(key)) throw new LlmBadResponse("unknown field " + key);
        });
        Map<String, ReviewInput.CriterionInput> byId = new HashMap<>();
        if (task.rubric() != null) {
            for (ReviewInput.CriterionInput criterion : task.rubric()) {
                byId.put(criterion.id(), criterion);
            }
        }
        Map<String, String> states = new HashMap<>();
        Map<String, String> evidence = new HashMap<>();
        JsonNode criteria = root.get("criteria");
        if (criteria == null || !criteria.isArray()) {
            throw new LlmBadResponse("no criteria");
        }
        for (JsonNode item : criteria) {
            String id = item.path("id").asText("");
            String state = item.path("state").asText("");
            if (!byId.containsKey(id) || states.containsKey(id)) {
                throw new LlmBadResponse("unknown criterion " + id);
            }
            if (!"hit".equals(state) && !"partial".equals(state) && !"miss".equals(state)) {
                throw new LlmBadResponse("bad state " + state);
            }
            states.put(id, state);
            if (!item.path("evidence").isTextual()) throw new LlmBadResponse("bad evidence " + id);
            String proof = item.path("evidence").asText().trim();
            if (proof.length() > 500 || (!"miss".equals(state) && proof.isBlank())
                    || (!proof.isBlank() && !normalized(solution).contains(normalized(proof)))) {
                throw new LlmBadResponse("evidence not in solution " + id);
            }
            evidence.put(id, proof);
        }
        for (String id : byId.keySet()) {
            if (!states.containsKey(id)) {
                throw new LlmBadResponse("criterion missing " + id);
            }
        }
        String narrative = root.path("narrative").asText("").trim();
        if (!root.path("narrative").isTextual() || narrative.isEmpty() || narrative.length() > 5000) {
            throw new LlmBadResponse("bad narrative " + agentId);
        }
        requireArray(root, "covered", 10); requireArray(root, "missed", 10);
        requireArray(root, "improve", 5); requireArray(root, "questions", 4);
        for (JsonNode question : root.path("questions")) {
            if (!question.isTextual() || question.asText().isBlank() || question.asText().length() > 500) {
                throw new LlmBadResponse("bad question");
            }
        }
        var part = new AgentPart(agentId, coveredList(root.get("covered")), missedList(root.get("missed")),
                narrative, improveList(root.get("improve")), stringsList(root.get("questions"), 4, 500));
        return new ParsedAnswer(Map.copyOf(states), Map.copyOf(evidence), Map.of(agentId, part));
    }

    private static void requireArray(JsonNode root, String key, int max) {
        if (!root.path(key).isArray() || root.path(key).size() > max) throw new LlmBadResponse("bad " + key);
        if (!"questions".equals(key)) for (JsonNode item : root.path(key)) {
            if (!item.isObject() || !item.path("title").isTextual() || item.path("title").asText().isBlank()
                    || item.path("title").asText().length() > 200) throw new LlmBadResponse("bad " + key + " item");
            String detail = "missed".equals(key) ? "why" : "detail";
            if (!item.path(detail).isTextual() || item.path(detail).asText().length() > 2000) {
                throw new LlmBadResponse("bad " + key + " explanation");
            }
            if ("missed".equals(key) && (!List.of("partial", "miss").contains(item.path("state").asText())
                    || !item.path("critical").isBoolean())) throw new LlmBadResponse("bad missed state");
        }
    }

    private static String normalized(String value) {
        return value == null ? "" : value.replaceAll("\\s+", " ").trim().toLowerCase(java.util.Locale.ROOT);
    }

    public record AgentPart(
            String id,
            List<ReviewResult.Covered> covered,
            List<ReviewResult.Missed> missed,
            String narrative,
            List<ReviewResult.Improve> improve,
            List<String> questions) {
    }

    public record ParsedAnswer(
            Map<String, String> states,
            Map<String, String> evidence,
            Map<String, AgentPart> parts) {
    }

    /**
     * Строит ревью той же формой, что mock: состояния — от модели,
     * всё остальное считает код. engine — "llm:провайдер/модель".
     */
    public static ReviewResult buildReview(
            ReviewInput task, List<SolutionTab> tabs, List<RecCandidate> candidates,
            ParsedAnswer parsed, Map<String, Persona> personas, String engine) {
        MockReviewProvider.Solution solution = MockReviewProvider.collectSolution(tabs);
        ReviewResult.Signals signals = MockReviewProvider.collectSignals(solution);
        List<ReviewResult.CriterionReview> rubric = new ArrayList<>();
        if (task.rubric() != null) {
            for (ReviewInput.CriterionInput criterion : task.rubric()) {
                String state = parsed.states().get(criterion.id());
                String proof = parsed.evidence().getOrDefault(criterion.id(), "");
                if (!proof.isEmpty()) {
                    proof = MockReviewProvider.truncate(proof, 170);
                }
                rubric.add(new ReviewResult.CriterionReview(
                        criterion.id(), criterion.title(),
                        criterion.weight() == null ? "mid" : criterion.weight(),
                        criterion.weightValue(),
                        criterion.focus() == null ? "sa" : criterion.focus(),
                        criterion.why() == null ? "" : criterion.why(),
                        state, List.of(), proof));
            }
        }
        double coverage = MockReviewProvider.coverageOf(rubric);
        double structure = MockReviewProvider.structureScore(solution, task.expectsDiagram(), signals);
        int score = MockReviewProvider.scoreOf(coverage, structure, signals.empty());
        ReviewResult.Grade grade = MockReviewProvider.gradeFor(score);
        MockReviewProvider.Split split = MockReviewProvider.splitByState(rubric);

        List<ReviewResult.AgentReview> agents = new ArrayList<>();
        for (String agentId : List.of("sa", "arch")) {
            AgentPart part = parsed.parts().get(agentId);
            if (part == null) {
                continue;
            }
            Persona persona = personas.get(agentId);
            if (persona == null) {
                throw new LlmBadResponse("no persona " + agentId);
            }
            List<ReviewResult.CriterionReview> own =
                    MockReviewProvider.agentCriteria(rubric, agentId);
            double ownCoverage = MockReviewProvider.coverageOf(own);
            agents.add(new ReviewResult.AgentReview(
                    agentId, persona.name(), persona.role(), persona.initials(),
                    List.copyOf(persona.checks()),
                    MockReviewProvider.agentScoreOf(ownCoverage, structure),
                    (int) Math.round(ownCoverage * 100),
                    List.copyOf(part.covered()), List.copyOf(part.missed()),
                    part.narrative(), List.copyOf(part.improve()),
                    List.copyOf(part.questions())));
        }
        if (agents.isEmpty()) {
            throw new LlmBadResponse("no agents");
        }
        return new ReviewResult(
                "rev_" + Long.toString(System.currentTimeMillis(), 36),
                task.id(), Instant.now().toString(), engine,
                grade,
                MockReviewProvider.buildSummary(grade, coverage, split.hits(),
                        split.misses(), split.criticalMisses(), rubric.size()),
                MockReviewProvider.buildWhy(task, solution, signals, rubric, split),
                List.copyOf(rubric), List.copyOf(agents), signals,
                new ReviewResult.Stats(solution.words, solution.tabs.size(), solution.diagramTabs,
                        rubric.size(), split.hits().size(), split.partials().size(),
                        split.misses().size()),
                MockReviewProvider.buildRecommendations(task, candidates));
    }

    private static List<ReviewResult.Covered> coveredList(JsonNode node) {
        List<ReviewResult.Covered> result = new ArrayList<>();
        if (node != null && node.isArray()) {
            for (JsonNode item : node) {
                if (result.size() >= 10) {
                    break;
                }
                String title = clip(item.path("title").asText(""), 200);
                String detail = clip(item.path("detail").asText(""), 2000);
                if (!title.isEmpty()) {
                    result.add(new ReviewResult.Covered(title, detail, "mid"));
                }
            }
        }
        return result;
    }

    private static List<ReviewResult.Improve> improveList(JsonNode node) {
        List<ReviewResult.Improve> result = new ArrayList<>();
        if (node != null && node.isArray()) {
            for (JsonNode item : node) {
                if (result.size() >= 5) {
                    break;
                }
                String title = clip(item.path("title").asText(""), 200);
                String detail = clip(item.path("detail").asText(""), 2000);
                if (!title.isEmpty()) {
                    result.add(new ReviewResult.Improve(title, detail));
                }
            }
        }
        return result;
    }

    private static List<ReviewResult.Missed> missedList(JsonNode node) {
        List<ReviewResult.Missed> result = new ArrayList<>();
        if (node != null && node.isArray()) {
            for (JsonNode item : node) {
                if (result.size() >= 10) {
                    break;
                }
                String title = clip(item.path("title").asText(""), 200);
                String state = item.path("state").asText("miss");
                if (!"hit".equals(state) && !"partial".equals(state) && !"miss".equals(state)) {
                    state = "miss";
                }
                if (!title.isEmpty()) {
                    result.add(new ReviewResult.Missed(title, state,
                            item.path("critical").asBoolean(false),
                            clip(item.path("why").asText(""), 2000)));
                }
            }
        }
        return result;
    }

    private static List<String> stringsList(JsonNode node, int max, int len) {
        List<String> result = new ArrayList<>();
        if (node != null && node.isArray()) {
            for (JsonNode item : node) {
                if (result.size() >= max) {
                    break;
                }
                String value = clip(item.asText(""), len);
                if (!value.isEmpty()) {
                    result.add(value);
                }
            }
        }
        return result;
    }

    private static String clip(String value, int max) {
        String text = value == null ? "" : value.trim();
        return text.length() <= max ? text : text.substring(0, max);
    }
}
