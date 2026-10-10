package ru.analystgym.practice.service;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import ru.analystgym.catalog.domain.Task;
import ru.analystgym.catalog.repo.LevelRepository;
import ru.analystgym.catalog.repo.TaskRepository;
import ru.analystgym.practice.domain.Attempt;
import ru.analystgym.practice.domain.Review;
import ru.analystgym.practice.domain.ReviewJob;
import ru.analystgym.practice.repo.AttemptRepository;
import ru.analystgym.practice.repo.ReviewJobRepository;
import ru.analystgym.practice.repo.ReviewRepository;
import ru.analystgym.review.MockReviewProvider;
import ru.analystgym.review.RecCandidate;
import ru.analystgym.review.ReviewInput;
import ru.analystgym.review.ReviewPipeline;
import ru.analystgym.review.ReviewResult;
import ru.analystgym.review.SolutionTab;

/**
 * Транзакционные шаги воркера. Каждый шаг — своя транзакция, чтобы polling
 * видел промежуточный прогресс (стадии sa/arch), а не только финал:
 * долгий сон внутри одной транзакции прятал бы прогресс до коммита.
 */
@Component
public class ReviewProcessor {

    private final ReviewJobRepository jobs;
    private final AttemptRepository attempts;
    private final ReviewRepository reviews;
    private final TaskRepository tasks;
    private final LevelRepository levels;
    private final ObjectMapper mapper;
    /** Движок ревью: mock (детерминированный) или llm (модели). */
    private final ReviewPipeline pipeline;
    private final String engine;

    public ReviewProcessor(
            ReviewJobRepository jobs,
            AttemptRepository attempts,
            ReviewRepository reviews,
            TaskRepository tasks,
            LevelRepository levels,
            ObjectMapper mapper,
            ReviewPipeline pipeline,
            @Value("${review.engine:mock}") String engine) {
        this.jobs = jobs;
        this.attempts = attempts;
        this.reviews = reviews;
        this.tasks = tasks;
        this.levels = levels;
        this.mapper = mapper;
        this.pipeline = pipeline;
        this.engine = engine;
    }

    /** Захват oldest-queued (SKIP LOCKED) + пометка «забрали в работу». */
    @Transactional
    public Optional<UUID> claim() {
        Optional<ReviewJob> next = jobs.claimNext();
        if (next.isEmpty()) {
            return Optional.empty();
        }
        ReviewJob job = next.get();
        job.setStatus("sa_running");
        job.setStage("system");
        job.setProgress(5);
        job.setTries(job.getTries() + 1);
        job.setLockedAt(Instant.now());
        jobs.save(job);
        return Optional.of(job.getId());
    }

    @Transactional
    public void markStage(UUID jobId, String status, String stage, int progress) {
        ReviewJob job = jobs.findById(jobId).orElse(null);
        if (job == null || "done".equals(job.getStatus()) || "failed".equals(job.getStatus())) {
            return;
        }
        job.setStatus(status);
        job.setStage(stage);
        job.setProgress(progress);
        jobs.save(job);
    }

    /**
     * Финал: считаем ревью по снапшотам попытки (не по живым данным задачи),
     * сохраняем результат, закрываем попытку и задачу.
     */
    @Transactional
    public void finish(UUID jobId) {
        ReviewJob job = jobs.findById(jobId)
                .orElseThrow(() -> new IllegalStateException("job gone " + jobId));
        Attempt attempt = attempts.findById(job.getAttemptId())
                .orElseThrow(() -> new IllegalStateException("attempt gone " + job.getAttemptId()));
        Task task = tasks.findById(attempt.getTaskId())
                .orElseThrow(() -> new IllegalStateException("task gone " + attempt.getTaskId()));
        String levelName = levels.findById(task.getLevelId())
                .map(level -> level.getName()).orElse(task.getLevelId());
        List<SolutionTab> tabs = ReviewMapper.toTabs(attempt.getTabs());
        List<RecCandidate> candidates = ReviewMapper.toCandidates(tasks.search(null, null, "published", null));
        // Рубрика — из снапшота попытки; живьём из задачи берём только
        // название/уровень/вопросы (они на скоринг не влияют).
        ReviewInput input = ReviewMapper.toInputFromSnapshot(
                task.getId(), task.getTitle(), task.getLevelId(), levelName,
                task.getTags() == null ? List.of() : List.of(task.getTags()),
                ReviewMapper.expectsDiagram(task.getStarterTabs()),
                attempt.getRubricSnapshot(), task.getInterviewQuestions());
        Review review = new Review();
        review.setAttemptId(attempt.getId());
        if ("llm".equalsIgnoreCase(engine)) {
            ReviewPipeline.LlmOutcome outcome = pipeline.review(input, tabs, candidates);
            ReviewResult result = outcome.result();
            review.setEngine(result.engine());
            review.setGradeCode(result.grade().code());
            review.setScore(result.grade().score());
            review.setResult(mapper.valueToTree(result));
            review.setProvider(outcome.provider());
            review.setModel(outcome.model());
            review.setPromptVersions(mapper.valueToTree(outcome.promptVersions()));
            review.setInputTokens(outcome.inputTokens());
            review.setOutputTokens(outcome.outputTokens());
        } else {
            ReviewResult result = MockReviewProvider.buildReview(input, tabs, candidates);
            review.setEngine(result.engine());
            review.setGradeCode(result.grade().code());
            review.setScore(result.grade().score());
            review.setResult(mapper.valueToTree(result));
            review.setProvider("");
            review.setModel("");
            review.setPromptVersions(JsonNodeFactory.instance.objectNode());
            review.setInputTokens(0);
            review.setOutputTokens(0);
        }
        reviews.save(review);

        attempt.setStatus("reviewed");
        attempts.save(attempt);

        job.setStatus("done");
        job.setStage("done");
        job.setProgress(100);
        job.setError(null);
        jobs.save(job);
    }

    /** Падение: попытка и задача помечаются, причина видна в polling.
     * Данные готового ревью для письма (читаем после коммита finish). */
    @Transactional(readOnly = true)
    public Optional<DoneInfo> doneInfo(UUID jobId) {
        return jobs.findById(jobId)
                .flatMap(job -> attempts.findById(job.getAttemptId()))
                .flatMap(attempt -> reviews.findById(attempt.getId())
                        .map(review -> new DoneInfo(attempt.getUserId(),
                                tasks.findById(attempt.getTaskId())
                                        .map(Task::getTitle).orElse(attempt.getTaskId()),
                                review.getScore())));
    }

    public record DoneInfo(UUID userId, String taskTitle, int score) {
    }    @Transactional
    public void fail(UUID jobId, String error) {
        ReviewJob job = jobs.findById(jobId).orElse(null);
        if (job == null) {
            return;
        }
        String message = error == null ? "review failed" : error;
        job.setStatus("failed");
        job.setProgress(100);
        job.setError(message.length() > 1000 ? message.substring(0, 1000) : message);
        jobs.save(job);
        attempts.findById(job.getAttemptId()).ifPresent(attempt -> {
            attempt.setStatus("failed");
            attempts.save(attempt);
        });
    }
}
