package ru.analystgym.practice.service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import ru.analystgym.catalog.domain.Task;
import ru.analystgym.catalog.repo.LevelRepository;
import ru.analystgym.catalog.repo.TaskRepository;
import ru.analystgym.practice.domain.Attempt;
import ru.analystgym.practice.domain.Draft;
import ru.analystgym.practice.domain.ReviewJob;
import ru.analystgym.practice.repo.AttemptRepository;
import ru.analystgym.practice.repo.DraftRepository;
import ru.analystgym.practice.repo.ReviewJobRepository;
import ru.analystgym.practice.repo.ReviewRepository;
import ru.analystgym.practice.web.PracticeDto.AttemptSummary;
import ru.analystgym.practice.web.PracticeDto.AttemptView;
import ru.analystgym.practice.web.PracticeDto.GradeView;
import ru.analystgym.practice.web.PracticeDto.TabDto;
import ru.analystgym.practice.web.PracticeDto.TaskDetail;
import ru.analystgym.practice.web.QuotaExceededException;
import ru.analystgym.practice.web.ReferenceLockedException;

/**
 * Контур практики: черновики, submit, опрос статуса, история, эталон.
 * Рубрику для ревью отдаём снапшотом (attempt.rubricSnapshot), а не живым
 * чтением: правка задачи методистом не должна менять старые ревью (ADR-06).
 */
@Service
public class PracticeService {

    private static final int MAX_TABS = 20;
    private static final int MAX_TITLE = 120;
    private static final int MAX_CONTENT = 200_000;
    private static final int MAX_IDEMPOTENCY_KEY = 64;
    private static final List<String> TAB_TYPES = List.of("doc", "plantuml", "mermaid");

    private final TaskRepository tasks;
    private final LevelRepository levels;
    private final DraftRepository drafts;
    private final AttemptRepository attempts;
    private final ReviewRepository reviews;
    private final ReviewJobRepository jobs;
    private final ObjectMapper mapper;
    /** Квота Free и Pro-статус — из биллинга (тарифы practice.html). */
    private final ru.analystgym.billing.service.BillingService billing;
    private final int freeReviewTasks;

    public PracticeService(
            TaskRepository tasks,
            LevelRepository levels,
            DraftRepository drafts,
            AttemptRepository attempts,
            ReviewRepository reviews,
            ReviewJobRepository jobs,
            ObjectMapper mapper,
            ru.analystgym.billing.service.BillingService billing,
            @Value("${billing.free-review-tasks:2}") int freeReviewTasks) {
        this.tasks = tasks;
        this.levels = levels;
        this.drafts = drafts;
        this.attempts = attempts;
        this.reviews = reviews;
        this.jobs = jobs;
        this.mapper = mapper;
        this.billing = billing;
        this.freeReviewTasks = freeReviewTasks;
    }

    /** Опубликованная задача или 404 (черновики витрине не видны). */
    @Transactional(readOnly = true)
    public Task publishedOrThrow(String taskId) {
        Task task = tasks.findById(taskId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!"published".equals(task.getStatus())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        return task;
    }

    @Transactional
    public Instant saveDraft(UUID userId, String taskId, List<TabDto> tabs) {
        publishedOrThrow(taskId);
        validateTabs(tabs);
        Draft draft = drafts.findById(new Draft.DraftId(userId, taskId)).orElseGet(Draft::new);
        draft.setUserId(userId);
        draft.setTaskId(taskId);
        draft.setTabs(mapper.valueToTree(tabs == null ? List.of() : tabs));
        return drafts.save(draft).getUpdatedAt();
    }

    @Transactional(readOnly = true)
    public Draft draftOf(UUID userId, String taskId) {
        publishedOrThrow(taskId);
        return drafts.findById(new Draft.DraftId(userId, taskId)).orElse(null);
    }

    /**
     * Идемпотентный submit: повтор с тем же Idempotency-Key возвращает
     * ту же попытку (202), новую задачу в очередь не ставит.
     */
    @Transactional
    public UUID submit(UUID userId, String taskId, List<TabDto> tabs, String idempotencyKey) {
        String key = idempotencyKey == null || idempotencyKey.isBlank() ? null : idempotencyKey.trim();
        if (key != null && key.length() > MAX_IDEMPOTENCY_KEY) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "idempotency key too long");
        }
        if (key != null) {
            var existing = attempts.findByUserIdAndIdempotencyKey(userId, key);
            if (existing.isPresent()) {
                return existing.get().getId();
            }
        }
        Task task = publishedOrThrow(taskId);
        validateTabs(tabs);
        // Тариф Free: полное ревью не более чем по N задачам; повторная
        // отправка по уже разобранной задаче квоту не ест (доработка).
        if (!billing.proState(userId).pro()) {
            java.util.Set<String> reviewed = attempts.reviewedTaskIds(userId);
            if (!reviewed.contains(taskId) && reviewed.size() >= freeReviewTasks) {
                throw new QuotaExceededException();
            }
        }
        Attempt attempt = new Attempt();
        attempt.setId(UUID.randomUUID());
        attempt.setUserId(userId);
        attempt.setTaskId(taskId);
        attempt.setTabs(mapper.valueToTree(tabs == null ? List.of() : tabs));
        attempt.setRubricSnapshot(task.getRubric() == null
                ? JsonNodeFactory.instance.arrayNode() : task.getRubric());
        attempt.setIdempotencyKey(key);
        attempt.setStatus("in_review");
        try {
            attempts.saveAndFlush(attempt);
        } catch (DataIntegrityViolationException race) {
            // Гонка двух submit с одним ключом: побеждает первая транзакция,
            // вторая забирает её попытку вместо дубля.
            if (key != null) {
                return attempts.findByUserIdAndIdempotencyKey(userId, key)
                        .orElseThrow(() -> race).getId();
            }
            throw race;
        }
        ReviewJob job = new ReviewJob();
        job.setId(UUID.randomUUID());
        job.setAttemptId(attempt.getId());
        job.setStatus("queued");
        job.setStage("system");
        job.setProgress(0);
        jobs.save(job);
        return attempt.getId();
    }

    /** Состояние попытки для polling: статус + прогресс + готовое ревью. */
    @Transactional(readOnly = true)
    public AttemptView attemptView(UUID userId, UUID attemptId) {
        Attempt attempt = attempts.findByIdAndUserId(attemptId, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        var job = jobs.findByAttemptId(attemptId).orElse(null);
        var review = reviews.findById(attemptId).orElse(null);
        GradeView grade = null;
        JsonNode result = null;
        if (review != null) {
            JsonNode node = review.getResult();
            JsonNode gradeNode = node == null ? null : node.get("grade");
            if (gradeNode != null && gradeNode.isObject()) {
                grade = new GradeView(
                        gradeNode.path("code").asInt(review.getGradeCode()),
                        gradeNode.path("label").asText(""),
                        gradeNode.path("headline").asText(""),
                        gradeNode.path("tone").asText(""),
                        gradeNode.path("score").asInt(review.getScore()));
            } else {
                grade = new GradeView(review.getGradeCode(), "", "", "", review.getScore());
            }
            result = node;
        }
        return new AttemptView(
                attempt.getId(), attempt.getTaskId(), attempt.getStatus(),
                job == null ? ("reviewed".equals(attempt.getStatus()) ? 100 : 0) : job.getProgress(),
                job == null ? null : job.getStage(),
                attempt.getCreatedAt() == null ? null : attempt.getCreatedAt().toString(),
                grade, result,
                job == null ? null : job.getError(),
                review == null ? null : review.getInputTokens(),
                review == null ? null : review.getOutputTokens(),
                review == null ? null : review.getPromptVersions());
    }

    /** История попыток пользователя по задаче (новые первые). */
    @Transactional(readOnly = true)
    public List<AttemptSummary> history(UUID userId, String taskId) {
        publishedOrThrow(taskId);
        List<AttemptSummary> result = new ArrayList<>();
        for (Attempt attempt : attempts.findByUserIdAndTaskIdOrderByCreatedAtDesc(userId, taskId)) {
            var review = reviews.findById(attempt.getId()).orElse(null);
            int tabsCount = attempt.getTabs() != null && attempt.getTabs().isArray()
                    ? attempt.getTabs().size() : 0;
            result.add(new AttemptSummary(
                    attempt.getId(), attempt.getStatus(),
                    review == null ? null : review.getScore(),
                    review == null ? null : review.getGradeCode(),
                    review == null || review.getResult() == null ? null
                            : review.getResult().path("grade").path("label").asText(null),
                    attempt.getCreatedAt() == null ? null : attempt.getCreatedAt().toString(),
                    tabsCount));
        }
        return result;
    }

    /** Полное тело задачи без эталона (публично, как условие в task.js). */
    @Transactional(readOnly = true)
    public TaskDetail taskDetail(String taskId) {
        Task task = publishedOrThrow(taskId);
        return new TaskDetail(
                task.getId(), task.getTitle(), task.getLevelId(),
                task.getTags() == null ? List.of() : List.of(task.getTags()),
                task.getTimeMin(), task.getSolvedRate(), task.getStatus(),
                task.getStatement(), task.getStarterTabs(), task.getRubric(),
                task.getHints(), task.getInterviewQuestions());
    }

    /** Эталон: только если у пользователя есть reviewed-попытка (иначе 403). */
    @Transactional(readOnly = true)
    public JsonNode reference(UUID userId, String taskId) {
        Task task = publishedOrThrow(taskId);
        if (!attempts.existsByUserIdAndTaskIdAndStatus(userId, taskId, "reviewed")) {
            throw new ReferenceLockedException();
        }
        if (task.getAuthorSolution() == null || task.getAuthorSolution().isNull()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        return task.getAuthorSolution();
    }

    /** Пустое решение разрешено (E1 из UC-S03), но с лимитами против мусора. */
    static void validateTabs(List<TabDto> tabs) {
        if (tabs == null) {
            return;
        }
        if (tabs.size() > MAX_TABS) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "too many tabs");
        }
        for (TabDto tab : tabs) {
            if (tab == null || tab.type() == null || !TAB_TYPES.contains(tab.type())) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "bad tab type");
            }
            if (tab.title() != null && tab.title().length() > MAX_TITLE) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "tab title too long");
            }
            if (tab.content() != null && tab.content().length() > MAX_CONTENT) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "tab content too long");
            }
        }
    }
}
