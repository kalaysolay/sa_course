package ru.analystgym.assessment.service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import ru.analystgym.assessment.domain.AssessmentSubmission;
import ru.analystgym.assessment.domain.Question;
import ru.analystgym.assessment.repo.QuestionRepository;
import ru.analystgym.assessment.repo.SubmissionRepository;
import ru.analystgym.assessment.service.AssessmentEngine.PlanCandidate;
import ru.analystgym.assessment.web.AssessmentDto.PlanResponse;
import ru.analystgym.assessment.web.AssessmentDto.QuestionCard;
import ru.analystgym.assessment.web.AssessmentDto.SubmissionSummary;
import ru.analystgym.assessment.web.AssessmentDto.SubmissionView;
import ru.analystgym.catalog.domain.Task;
import ru.analystgym.catalog.repo.TaskRepository;
import ru.analystgym.practice.repo.AttemptRepository;

/**
 * Диагностика (UC-D01–D03, UC-SYS02): вопросы без ответов, приём ответов
 * целиком, подсчёт движком, история замеров, план прокачки.
 * Прогресс «на полпути» живёт в localStorage фронта (как в макете);
 * сервер хранит только финишированные замеры.
 */
@Service
public class AssessmentService {

    private static final int MAX_DURATION_SEC = 7200;

    private final QuestionRepository questions;
    private final SubmissionRepository submissions;
    private final TaskRepository tasks;
    private final AttemptRepository attempts;
    private final ObjectMapper mapper;

    public AssessmentService(
            QuestionRepository questions,
            SubmissionRepository submissions,
            TaskRepository tasks,
            AttemptRepository attempts,
            ObjectMapper mapper) {
        this.questions = questions;
        this.submissions = submissions;
        this.tasks = tasks;
        this.attempts = attempts;
        this.mapper = mapper;
    }

    /** Активные вопросы без ответов и разборов (порядок детерминирован). */
    @Transactional(readOnly = true)
    public List<QuestionCard> questionCards() {
        List<QuestionCard> cards = new ArrayList<>();
        for (Question question : questions.findByActiveTrueOrderByIdAsc()) {
            cards.add(new QuestionCard(question.getId(), question.getCompetency(),
                    question.getDifficulty(), question.getQuestion(),
                    strings(question.getOptions())));
        }
        return cards;
    }

    /**
     * Финиш диагностики: валидируем ответы, считаем, сохраняем замер.
     * Неизвестный id вопроса и индекс вне вариантов — 400 (контракт).
     * Порядок банка — id asc (детерминирован); в макете — порядок файла:
     * на подсчёт не влияет, отличается только порядок detail[].
     */
    @Transactional
    public AssessmentSubmission submit(UUID userId, Map<String, Integer> answers, Integer durationSec) {
        List<Question> bank = questions.findByActiveTrueOrderByIdAsc();
        if (bank.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "empty bank");
        }
        Map<String, Question> byId = new HashMap<>();
        for (Question question : bank) {
            byId.put(question.getId(), question);
        }
        Map<String, Integer> given = answers == null ? Map.of() : answers;
        for (Map.Entry<String, Integer> entry : given.entrySet()) {
            Question question = byId.get(entry.getKey());
            if (question == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "unknown question");
            }
            int options = question.getOptions() != null && question.getOptions().isArray()
                    ? question.getOptions().size() : 0;
            Integer chosen = entry.getValue();
            if (chosen == null || chosen < 0 || chosen >= options) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "bad answer index");
            }
        }
        int duration = durationSec == null ? 0 : durationSec;
        if (duration < 0 || duration > MAX_DURATION_SEC) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "bad duration");
        }
        List<AssessmentResult.QuestionInput> inputs = new ArrayList<>();
        for (Question question : bank) {
            inputs.add(new AssessmentResult.QuestionInput(question.getId(), question.getCompetency(),
                    question.getDifficulty(), question.getQuestion(), strings(question.getOptions()),
                    question.getAnswer(), question.getExplain()));
        }
        AssessmentResult result = AssessmentEngine.compute(inputs, given);

        AssessmentSubmission submission = new AssessmentSubmission();
        submission.setId(UUID.randomUUID());
        submission.setUserId(userId);
        submission.setAnswers(mapper.valueToTree(given));
        submission.setDurationSec(duration);
        submission.setScore(result.score());
        submission.setScoreRounded(result.scoreRounded());
        submission.setGradeId(result.grade() == null ? "" : result.grade().id());
        submission.setResult(mapper.valueToTree(result));
        return submissions.save(submission);
    }

    @Transactional(readOnly = true)
    public List<SubmissionSummary> history(UUID userId) {
        List<SubmissionSummary> result = new ArrayList<>();
        for (AssessmentSubmission submission : submissions.findByUserIdOrderByCreatedAtDesc(userId)) {
            String gradeName = "";
            JsonNode node = submission.getResult();
            if (node != null && node.has("grade") && node.get("grade").has("name")) {
                gradeName = node.get("grade").get("name").asText("");
            }
            int answered = node != null && node.has("answeredCount")
                    ? node.get("answeredCount").asInt(0) : 0;
            int correct = node != null && node.has("correctCount")
                    ? node.get("correctCount").asInt(0) : 0;
            result.add(new SubmissionSummary(submission.getId(), submission.getScore(),
                    submission.getScoreRounded(), submission.getGradeId(), gradeName,
                    answered, correct, stamp(submission)));
        }
        return result;
    }

    @Transactional(readOnly = true)
    public SubmissionView submissionOf(UUID userId, UUID submissionId) {
        AssessmentSubmission submission = submissions.findByIdAndUserId(submissionId, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        AssessmentResult result = mapper.convertValue(submission.getResult(), AssessmentResult.class);
        return new SubmissionView(submission.getId(), submission.getScore(),
                submission.getScoreRounded(), result == null ? null : result.grade(),
                result == null ? 0 : result.answeredCount(),
                result == null ? 0 : result.correctCount(),
                submission.getDurationSec(), stamp(submission), result);
    }

    /**
     * План прокачки по замеру (свой, иначе 404): задачи под пробелы +
     * ссылка в каталог с метками двух главных пробелов (levelCatalogUrl).
     */
    @Transactional(readOnly = true)
    public PlanResponse plan(UUID userId, UUID submissionId) {
        AssessmentSubmission submission;
        if (submissionId == null) {
            List<AssessmentSubmission> all = submissions.findByUserIdOrderByCreatedAtDesc(userId);
            if (all.isEmpty()) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND);
            }
            submission = all.get(0);
        } else {
            submission = submissions.findByIdAndUserId(submissionId, userId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        }
        AssessmentResult result = mapper.convertValue(submission.getResult(), AssessmentResult.class);
        if (result == null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "empty result");
        }
        List<PlanCandidate> candidates = new ArrayList<>();
        for (Task task : tasks.search(null, null, "published", null)) {
            candidates.add(new PlanCandidate(task.getId(), task.getTitle(), task.getLevelId(),
                    task.getTags() == null ? List.of() : List.of(task.getTags())));
        }
        Set<String> done = new HashSet<>();
        for (Task task : tasks.search(null, null, "published", null)) {
            if (attempts.existsByUserIdAndTaskIdAndStatus(userId, task.getId(), "reviewed")) {
                done.add(task.getId());
            }
        }
        List<AssessmentResult.PlanItem> plan =
                AssessmentEngine.buildPlan(result, candidates, done, 4);
        return new PlanResponse(submission.getId(), plan,
                AssessmentEngine.levelCatalogUrl(result),
                AssessmentEngine.narrative(result),
                AssessmentEngine.marketView(result));
    }

    static List<String> strings(JsonNode node) {
        List<String> result = new ArrayList<>();
        if (node != null && node.isArray()) {
            for (JsonNode item : node) {
                if (item.isTextual()) {
                    result.add(item.asText());
                }
            }
        }
        return result;
    }

    private static String stamp(AssessmentSubmission submission) {
        return submission.getCreatedAt() == null ? null : submission.getCreatedAt().toString();
    }
}
