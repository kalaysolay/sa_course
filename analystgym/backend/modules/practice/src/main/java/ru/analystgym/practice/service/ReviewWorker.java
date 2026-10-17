package ru.analystgym.practice.service;

import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.*;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import ru.analystgym.notify.service.NotificationService;
import ru.analystgym.review.*;

/** Ограниченное число обработок; сетевые вызовы вне транзакций, heartbeat живёт отдельно от HTTP. */
@Component
@ConditionalOnProperty(name = "review.queue.enabled", havingValue = "true", matchIfMissing = true)
public class ReviewWorker {
    private static final Logger log = LoggerFactory.getLogger(ReviewWorker.class);
    private final ReviewProcessor processor;
    private final ReviewPipeline pipeline;
    private final NotificationService notify;
    private final ExecutorService executor;
    private final Semaphore slots;
    private final ConcurrentMap<UUID, ReviewProcessor.Claim> running = new ConcurrentHashMap<>();

    public ReviewWorker(ReviewProcessor processor, ReviewPipeline pipeline, NotificationService notify,
                        @Value("${review.queue.workers:2}") int workers) {
        if (workers < 1 || workers > 32) throw new IllegalArgumentException("Число воркеров должно быть 1–32");
        this.processor = processor; this.pipeline = pipeline; this.notify = notify;
        executor = Executors.newFixedThreadPool(workers); slots = new Semaphore(workers);
    }

    @Scheduled(fixedDelayString = "${review.queue.poll-ms:500}")
    public void pump() {
        if (!slots.tryAcquire()) return;
        try {
            var next = processor.claim();
            if (next.isEmpty()) { slots.release(); return; }
            var claim = next.get(); running.put(claim.jobId(), claim);
            executor.execute(() -> {
                try { process(claim); }
                finally { running.remove(claim.jobId(), claim); slots.release(); }
            });
        } catch (Exception error) { slots.release(); log.warn("Не удалось захватить ревью: {}", error.getClass().getSimpleName()); }
    }

    @Scheduled(fixedDelayString = "${review.queue.heartbeat-ms:1000}")
    public void heartbeat() {
        for (var claim : running.values()) {
            try { processor.renew(claim); }
            catch (ReviewProcessor.LostLease lost) { running.remove(claim.jobId(), claim); }
            catch (Exception error) { log.warn("Не удалось продлить захват ревью {}", claim.jobId()); }
        }
    }

    /** Публичен для интеграционных проверок восстановления; транзакционных аннотаций здесь нет. */
    public void process(ReviewProcessor.Claim claim) {
        Optional<ReviewProcessor.DoneInfo> done;
        try {
            ReviewResult result; Map<String, Integer> versions;
            if ("llm".equals(claim.plan().engine())) {
                var outcome = pipeline.review(claim.plan(), claim.tabs(), new ReviewExecution() {
                    public void stage(String agent, int progress) { processor.stage(claim, agent, progress); }
                    public Optional<LlmReviewer.ParsedAnswer> restored(String agent) { return processor.restored(claim, agent); }
                    public UUID reserve(ReviewPlan.Agent agent, ReviewPlan.Route route, LlmClient.LlmRequest request, int tokens) {
                        return processor.reserve(claim, agent, route, request, tokens);
                    }
                    public void answered(UUID id, LlmClient.LlmAnswer answer, LlmReviewer.ParsedAnswer parsed, String error) {
                        if (processor.answered(claim, id, answer, parsed, error)) throw new LlmClient.LlmFailedException("provider_usage_over_limit", false);
                    }
                    public void failed(UUID id, String error) { processor.failedCall(claim, id, error); }
                });
                result = outcome.result(); versions = outcome.promptVersions();
            } else {
                processor.stage(claim, "grading", 90);
                result = MockReviewProvider.buildReview(claim.plan().input(), claim.tabs(), claim.plan().candidates());
                versions = Map.of();
            }
            done = processor.finish(claim, result, versions);
        } catch (ReviewProcessor.LostLease lost) { return; }
        catch (Exception error) {
            boolean retryable = !(error instanceof LlmClient.LlmFailedException failed) || failed.retryable();
            String code = error instanceof LlmClient.LlmFailedException ? error.getMessage() : "review_processing_failed";
            try { processor.fail(claim, code, retryable); }
            catch (ReviewProcessor.LostLease lost) { /* Новый владелец сам завершит работу. */ }
            catch (Exception failure) { log.warn("Не удалось завершить ошибку ревью {}", claim.jobId()); }
            return;
        }
        // Ошибка уведомления после коммита не превращает готовое ревью в failed.
        done.ifPresent(info -> {
            try { notify.reviewReady(info.userId(), info.taskTitle(), info.score()); }
            catch (Exception error) { log.warn("Не отправлено уведомление о ревью {}", claim.attemptId()); }
        });
    }

    @PreDestroy
    public void close() { executor.shutdownNow(); }
}
