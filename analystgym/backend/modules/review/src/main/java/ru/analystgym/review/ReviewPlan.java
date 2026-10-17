package ru.analystgym.review;

import java.util.List;
import java.util.UUID;

/** Неизменяемый план принятой попытки: данные, настройки и точные сообщения модели. Ключей здесь нет. */
public record ReviewPlan(int schema, String engine, ReviewInput input, List<RecCandidate> candidates,
                         List<Agent> agents, List<Route> routes, Limits limits) {
    public record Agent(String id, String name, String role, String initials, List<String> checks,
                        String model, Long revision, String promptKey, UUID promptId,
                        int promptVersion, Long promptRevision, String system, String user) { }
    public record Route(String id, Long revision, String baseUrl, String model, String keyEnv, int timeoutSeconds) { }
    public record Limits(int maxSolutionChars, int maxInputBytes, int maxOutputTokens, int tokenBudget, int maxCalls) { }
}
