package ru.analystgym.practice.service;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import ru.analystgym.practice.domain.Attempt;
import ru.analystgym.practice.domain.Review;
import ru.analystgym.practice.domain.ReviewCall;
import ru.analystgym.practice.domain.ReviewJob;
import ru.analystgym.practice.repo.AttemptRepository;
import ru.analystgym.practice.repo.ReviewCallRepository;
import ru.analystgym.practice.repo.ReviewJobRepository;
import ru.analystgym.practice.repo.ReviewRepository;
import ru.analystgym.review.*;

/** Короткие транзакции очереди и журнала. Ни один метод не обращается к модели. */
@Component
public class ReviewProcessor {
    private final ReviewJobRepository jobs;
    private final AttemptRepository attempts;
    private final ReviewRepository reviews;
    private final ReviewCallRepository calls;
    private final ObjectMapper mapper;
    private final ReviewRevisions revisions;
    private final ru.analystgym.notify.service.NotificationOutbox outbox;
    private final ru.analystgym.identity.repo.UserRepository users;
    private final int leaseSeconds, maxTries, retrySeconds;

    public ReviewProcessor(ReviewJobRepository jobs, AttemptRepository attempts, ReviewRepository reviews,
                           ReviewCallRepository calls, ObjectMapper mapper, ReviewRevisions revisions,
                           ru.analystgym.notify.service.NotificationOutbox outbox, ru.analystgym.identity.repo.UserRepository users,
                           @Value("${review.queue.lease-seconds:30}") int leaseSeconds,
                           @Value("${review.queue.max-tries:3}") int maxTries,
                           @Value("${review.queue.retry-seconds:2}") int retrySeconds) {
        if (leaseSeconds < 3 || maxTries < 1 || retrySeconds < 1) throw new IllegalArgumentException("Некорректные настройки очереди");
        this.jobs = jobs; this.attempts = attempts; this.reviews = reviews; this.calls = calls; this.mapper = mapper;
        this.revisions=revisions;this.outbox=outbox;this.users=users;
        this.leaseSeconds = leaseSeconds; this.maxTries = maxTries; this.retrySeconds = retrySeconds;
    }

    public record Claim(UUID jobId, UUID attemptId, UUID token, ReviewPlan plan, List<SolutionTab> tabs) { }
    public record DoneInfo(UUID userId, String taskTitle, int score) { }

    /** Потерявший захват воркер не может менять стадии, расход и результат новой обработки. */
    public static class LostLease extends RuntimeException { }

    @Transactional
    public Optional<Claim> claim() {
        Instant now = Instant.now();
        var next = jobs.claimNext(now);
        if (next.isEmpty()) return Optional.empty();
        var job = next.get();
        var attempt = attempts.lockById(job.getAttemptId()).orElseThrow();
        for (var call : calls.findByAttemptIdOrderByStartedAtAsc(attempt.getId())) {
            if ("started".equals(call.getStatus())) call.failed("worker_lease_expired", true);
        }
        if (job.getTries() >= maxTries || attempt.getReviewPlan() == null || attempt.getReviewPlan().isNull()) {
            terminal(job, attempt, job.getTries() >= maxTries ? "review_retries_exhausted" : "legacy_review_requires_resubmit");
            return Optional.empty();
        }
        var plan = mapper.convertValue(attempt.getReviewPlan(), ReviewPlan.class);
        job.setStatus("sa_running"); job.setStage("system"); job.setProgress(5);
        job.setTries(job.getTries() + 1); job.setLockedAt(now);
        job.setLeaseToken(UUID.randomUUID()); job.setLeaseUntil(now.plusSeconds(leaseSeconds));
        job.setError(null);
        return Optional.of(new Claim(job.getId(), attempt.getId(), job.getLeaseToken(), plan, ReviewMapper.toTabs(attempt.getTabs())));
    }

    @Transactional
    public void renew(Claim claim) {
        owned(claim).setLeaseUntil(Instant.now().plusSeconds(leaseSeconds));
    }

    @Transactional
    public void stage(Claim claim, String stage, int progress) {
        var job = owned(claim);
        job.setStage(stage); job.setProgress(progress);
        job.setStatus("grading".equals(stage) ? "grading" : "arch".equals(stage) ? "arch_running" : "sa_running");
    }

    @Transactional
    public Optional<LlmReviewer.ParsedAnswer> restored(Claim claim, String agent) {
        owned(claim);
        return calls.findFirstByAttemptIdAndAgentIdAndStatusOrderByStartedAtDesc(claim.attemptId(), agent, "accepted")
                .map(c -> mapper.convertValue(c.getParsedAnswer(), LlmReviewer.ParsedAnswer.class));
    }

    /** Резерв расхода и запись started коммитятся до отправки HTTP, включая последние доступные токены. */
    @Transactional
    public UUID reserve(Claim claim, ReviewPlan.Agent agent, ReviewPlan.Route route, LlmClient.LlmRequest request, int tokens) {
        owned(claim);
        var attempt = attempts.lockById(claim.attemptId()).orElseThrow();
        if (attempt.getCallCount() >= claim.plan().limits().maxCalls()
                || (long) attempt.getChargedTokens() + tokens > claim.plan().limits().tokenBudget()) {
            throw new LlmClient.LlmFailedException("review_budget_exhausted", false);
        }
        var call = new ReviewCall(attempt.getId(), claim.token(), agent.id(), route.id(), request.model(),
                agent.promptKey(), agent.promptVersion(), mapper.valueToTree(request), tokens);
        calls.save(call);
        attempt.setCallCount(attempt.getCallCount() + 1);
        attempt.setChargedTokens(attempt.getChargedTokens() + tokens);
        return call.getId();
    }

    /** true означает нарушение бюджета провайдером; ошибка выбрасывается вызывающим уже после коммита журнала. */
    @Transactional
    public boolean answered(Claim claim, UUID id, LlmClient.LlmAnswer answer, LlmReviewer.ParsedAnswer parsed, String error) {
        owned(claim);
        var attempt = attempts.lockById(claim.attemptId()).orElseThrow();
        var call = callOwned(claim, id);
        int oldCharge = call.getChargedTokens();
        boolean invalidUsage = answer.inputTokens() < 0 || answer.outputTokens() < 0
                || answer.outputTokens() > claim.plan().limits().maxOutputTokens()
                || (long) answer.inputTokens() + answer.outputTokens() > call.getReservedTokens();
        call.answered(answer, parsed == null || invalidUsage ? null : mapper.valueToTree(parsed),
                invalidUsage ? "provider_usage_over_limit" : error);
        attempt.setChargedTokens(Math.addExact(attempt.getChargedTokens() - oldCharge, call.getChargedTokens()));
        return invalidUsage || attempt.getChargedTokens() > claim.plan().limits().tokenBudget();
    }

    @Transactional
    public void failedCall(Claim claim, UUID id, String error) {
        owned(claim); callOwned(claim, id).failed(error, false);
    }

    /** Результат, попытка и закрытие job фиксируются атомарно. Повторное готовое ревью не создаётся. */
    @Transactional
    public Optional<DoneInfo> finish(Claim claim, ReviewResult result, Map<String, Integer> promptVersions) {
        var job = owned(claim);
        var attempt = attempts.lockById(claim.attemptId()).orElseThrow();
        if (reviews.existsById(attempt.getId())) throw new LostLease();
        var history = calls.findByAttemptIdOrderByStartedAtAsc(attempt.getId());
        int input = history.stream().mapToInt(c -> c.getInputTokens() == null ? 0 : c.getInputTokens()).sum();
        int output = history.stream().mapToInt(c -> c.getOutputTokens() == null ? 0 : c.getOutputTokens()).sum();
        var review = new Review(); review.setAttemptId(attempt.getId());
        review.setEngine(result.engine()); review.setGradeCode(result.grade().code()); review.setScore(result.grade().score());
        var reviewJson=(com.fasterxml.jackson.databind.node.ObjectNode)mapper.valueToTree(result);reviewJson.put("revision",1);
        review.setResult(reviewJson); review.setPromptVersions(mapper.valueToTree(promptVersions));
        review.setInputTokens(input); review.setOutputTokens(output);
        // Старые сводные поля сохраняем; полная трасса по каждому агенту/повтору находится в review_calls.
        var accepted = history.stream().filter(c -> "accepted".equals(c.getStatus())).toList();
        review.setProvider(accepted.stream().map(ReviewCall::getProvider).distinct().reduce((a, b) -> a + "," + b).orElse(""));
        review.setModel(accepted.stream().map(c -> c.getActualModel() == null ? c.getRequestedModel() : c.getActualModel())
                .distinct().reduce((a, b) -> a + "," + b).orElse(""));
        reviews.saveAndFlush(review); revisions.record(review,null,null);attempt.setStatus("reviewed");
        var user=users.findById(attempt.getUserId()).orElseThrow();
        outbox.enqueue(user.getId(),user.getEmail(),"review:"+attempt.getId()+":1","AnalystGym: ревью готово",
                "Проверка задачи «"+claim.plan().input().title()+"» завершена. Результат: "+result.grade().score()+"/100.\nОткройте задачу в кабинете.","/task.html?id="+attempt.getTaskId()+"&attempt="+attempt.getId());
        job.setStatus("done"); job.setStage("done"); job.setProgress(100); job.setError(null);
        job.setLeaseToken(null); job.setLeaseUntil(null);
        return Optional.of(new DoneInfo(attempt.getUserId(), claim.plan().input().title(), result.grade().score()));
    }

    @Transactional
    public void fail(Claim claim, String error, boolean retryable) {
        var job = owned(claim);
        var attempt = attempts.lockById(claim.attemptId()).orElseThrow();
        if (retryable && job.getTries() < maxTries) {
            job.setStatus("queued"); job.setStage("waiting"); job.setProgress(0); job.setError(error);
            job.setNextRunAt(Instant.now().plusSeconds((long) retrySeconds * (1L << Math.min(10, job.getTries() - 1))));
            job.setLeaseToken(null); job.setLeaseUntil(null);
        } else terminal(job, attempt, error);
    }

    /** Журнал доступен только через контроллер с проверкой владельца/служебной роли. */
    @Transactional(readOnly = true)
    public Map<String, Object> context(UUID attemptId) {
        var attempt = attempts.findById(attemptId).orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.NOT_FOUND));
        return Map.of("task", attempt.getTaskSnapshot() == null ? mapper.nullNode() : attempt.getTaskSnapshot(),
                "plan", attempt.getReviewPlan() == null ? mapper.nullNode() : attempt.getReviewPlan(),
                "calls", calls.findByAttemptIdOrderByStartedAtAsc(attemptId),"revisions",revisions.history(attemptId),
                "chargedTokens", attempt.getChargedTokens(), "callCount", attempt.getCallCount());
    }

    private ReviewJob owned(Claim claim) {
        var job = jobs.lockById(claim.jobId()).orElseThrow(LostLease::new);
        if (!claim.token().equals(job.getLeaseToken()) || job.getLeaseUntil() == null
                || !job.getLeaseUntil().isAfter(Instant.now()) || List.of("done", "failed", "queued").contains(job.getStatus())) {
            throw new LostLease();
        }
        return job;
    }

    private ReviewCall callOwned(Claim claim, UUID id) {
        var call = calls.findById(id).orElseThrow(LostLease::new);
        if (!call.getAttemptId().equals(claim.attemptId()) || !call.getLeaseToken().equals(claim.token())
                || !"started".equals(call.getStatus())) throw new LostLease();
        return call;
    }

    private static void terminal(ReviewJob job, Attempt attempt, String error) {
        job.setStatus("failed"); job.setStage("failed"); job.setProgress(100); job.setError(error);
        job.setLeaseToken(null); job.setLeaseUntil(null); attempt.setStatus("failed");
    }
}
