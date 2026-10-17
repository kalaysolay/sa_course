package ru.analystgym.review;

import java.util.Optional;
import java.util.UUID;

/** Короткие операции учёта вокруг HTTP-вызова. Реализация practice хранит журнал и проверяет право воркера. */
public interface ReviewExecution {
    void stage(String agentId, int progress);
    Optional<LlmReviewer.ParsedAnswer> restored(String agentId);
    UUID reserve(ReviewPlan.Agent agent, ReviewPlan.Route route, LlmClient.LlmRequest request, int tokens);
    void answered(UUID callId, LlmClient.LlmAnswer answer, LlmReviewer.ParsedAnswer accepted, String error);
    void failed(UUID callId, String error);
}
