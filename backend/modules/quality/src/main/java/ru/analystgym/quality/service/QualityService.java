package ru.analystgym.quality.service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import com.fasterxml.jackson.databind.JsonNode;
import ru.analystgym.catalog.domain.Task;
import ru.analystgym.catalog.repo.TaskRepository;
import ru.analystgym.identity.domain.User;
import ru.analystgym.identity.repo.UserRepository;
import ru.analystgym.practice.domain.Attempt;
import ru.analystgym.practice.domain.Review;
import ru.analystgym.practice.repo.AttemptRepository;
import ru.analystgym.practice.repo.ReviewRepository;
import ru.analystgym.quality.domain.Complaint;
import ru.analystgym.quality.repo.ComplaintRepository;
import ru.analystgym.quality.web.QualityDto.AttentionItem;
import ru.analystgym.quality.web.QualityDto.AttemptDetail;
import ru.analystgym.quality.web.QualityDto.AttemptRow;
import ru.analystgym.quality.web.QualityDto.ComplaintView;
import ru.analystgym.quality.web.QualityDto.Dashboard;
import ru.analystgym.quality.web.QualityDto.Kpi;
import ru.analystgym.quality.web.QualityDto.MissItem;
import ru.analystgym.quality.web.QualityDto.StudentCard;
import ru.analystgym.quality.web.QualityDto.StudentRow;

/**
 * Контур качества (UC-Q01–Q04 + подача жалоб UC-S08).
 * Всё считается из живых попыток/ревью, а не демо-данных: дашборд пуст,
 * пока студенты не решали, — это честно (сигнал чинить рубрику, а не студентов).
 */
@Service
public class QualityService {

    private static final Pattern TAGS = Pattern.compile("<[^>]*>");
    private static final int MIN_REASON = 10;
    private static final int MAX_REASON = 2000;
    private static final int EXCERPT_LEN = 300;

    private final ComplaintRepository complaints;
    private final AttemptRepository attempts;
    private final ReviewRepository reviews;
    private final TaskRepository tasks;
    private final UserRepository users;

    public QualityService(
            ComplaintRepository complaints,
            AttemptRepository attempts,
            ReviewRepository reviews,
            TaskRepository tasks,
            UserRepository users) {
        this.complaints = complaints;
        this.attempts = attempts;
        this.reviews = reviews;
        this.tasks = tasks;
        this.users = users;
    }

    /** Подача жалобы: только своя reviewed-попытка, причина 10–2000 символов. */
    @Transactional
    public Complaint fileComplaint(UUID userId, UUID attemptId, String reason) {
        Attempt attempt = attempts.findByIdAndUserId(attemptId, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!"reviewed".equals(attempt.getStatus())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "attempt not reviewed");
        }
        String text = reason == null ? "" : reason.trim();
        if (text.length() < MIN_REASON || text.length() > MAX_REASON) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "bad reason length");
        }
        Review review = reviews.findById(attemptId).orElseThrow(
                () -> new ResponseStatusException(HttpStatus.CONFLICT, "review missing"));
        Complaint complaint = new Complaint();
        complaint.setId(UUID.randomUUID());
        complaint.setUserId(userId);
        complaint.setAttemptId(attemptId);
        complaint.setTaskId(attempt.getTaskId());
        complaint.setScore(review.getScore());
        complaint.setReason(text);
        complaint.setExcerpt(excerptOf(attempt.getTabs()));
        complaint.setPromptVersion(review.getEngine());
        complaint.setStatus("new");
        return complaints.save(complaint);
    }

    @Transactional(readOnly = true)
    public List<ComplaintView> myComplaints(UUID userId) {
        return views(complaints.findByUserIdOrderByCreatedAtDesc(userId));
    }

    @Transactional(readOnly = true)
    public List<ComplaintView> complaintQueue(String status) {
        if (status == null || status.isBlank() || "all".equals(status)) {
            return views(complaints.findAllByOrderByCreatedAtDesc());
        }
        if (!List.of("new", "review", "resolved", "rejected").contains(status)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "bad status");
        }
        return views(complaints.findByStatusOrderByCreatedAtDesc(status));
    }

    /**
     * Разбор жалобы: new → review|resolved|rejected, review → resolved|rejected.
     * Решённые/отклонённые терминальны; resolved требует итог разбора.
     */
    @Transactional
    public Complaint resolve(UUID complaintId, String status, String resolution) {
        Complaint complaint = complaints.findById(complaintId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!List.of("review", "resolved", "rejected").contains(status)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "bad status");
        }
        if ("resolved".equals(complaint.getStatus()) || "rejected".equals(complaint.getStatus())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "complaint closed");
        }
        if ("new".equals(complaint.getStatus()) && "new".equals(status)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "bad status");
        }
        if ("resolved".equals(status) && (resolution == null || resolution.trim().isEmpty())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "resolution required");
        }
        complaint.setStatus(status);
        complaint.setResolution(resolution == null || resolution.isBlank() ? null : resolution.trim());
        return complaints.save(complaint);
    }

    /** Дашборд: KPI + требующие внимания + MISS-топ + свежие жалобы. */
    @Transactional(readOnly = true)
    public Dashboard dashboard() {
        List<Task> allTasks = tasks.findAll();
        long published = allTasks.stream().filter(t -> "published".equals(t.getStatus())).count();
        List<Attempt> allAttempts = attempts.findAll();
        List<Review> allReviews = reviews.findAll();
        Map<UUID, Attempt> attemptById = new HashMap<>();
        for (Attempt attempt : allAttempts) {
            attemptById.put(attempt.getId(), attempt);
        }
        Map<String, List<Integer>> scoresByTask = new HashMap<>();
        for (Review review : allReviews) {
            Attempt attempt = attemptById.get(review.getAttemptId());
            if (attempt != null) {
                scoresByTask.computeIfAbsent(attempt.getTaskId(), k -> new ArrayList<>())
                        .add(review.getScore());
            }
        }
        Double avg = allReviews.isEmpty() ? null
                : allReviews.stream().mapToInt(Review::getScore).average().orElse(0);
        long complaintsNew = complaints.findByStatusOrderByCreatedAtDesc("new").size();

        // Требуют внимания: жалобы new|review по задачам + просевшие без жалоб.
        Map<String, Long> openByTask = new HashMap<>();
        for (Complaint complaint : complaints.findByStatusOrderByCreatedAtDesc("new")) {
            openByTask.merge(complaint.getTaskId(), 1L, Long::sum);
        }
        for (Complaint complaint : complaints.findByStatusOrderByCreatedAtDesc("review")) {
            openByTask.merge(complaint.getTaskId(), 1L, Long::sum);
        }
        List<AttentionItem> attention = new ArrayList<>();
        for (Map.Entry<String, Long> entry : openByTask.entrySet()) {
            attention.add(new AttentionItem(entry.getKey(), titleOf(entry.getKey()),
                    entry.getValue(), avgOf(scoresByTask.get(entry.getKey()))));
        }
        for (Map.Entry<String, List<Integer>> entry : scoresByTask.entrySet()) {
            Double taskAvg = avgOf(entry.getValue());
            if (taskAvg != null && taskAvg < 50 && !openByTask.containsKey(entry.getKey())) {
                attention.add(new AttentionItem(entry.getKey(), titleOf(entry.getKey()),
                        0, taskAvg));
            }
        }
        attention.sort(Comparator.comparingLong(AttentionItem::complaints).reversed()
                .thenComparing(item -> item.avgScore() == null ? Double.MAX_VALUE : item.avgScore()));

        // MISS-топ: несработавшие критерии по названиям (taskId — последний видевший).
        Map<String, MissAcc> miss = new LinkedHashMap<>();
        for (Review review : allReviews) {
            Attempt attempt = attemptById.get(review.getAttemptId());
            JsonNode node = review.getResult();
            if (node == null || !node.has("criteria")) {
                continue;
            }
            for (JsonNode criterion : node.get("criteria")) {
                if ("miss".equals(criterion.path("state").asText())) {
                    String title = criterion.path("title").asText("");
                    if (!title.isEmpty()) {
                        MissAcc acc = miss.computeIfAbsent(title, k -> new MissAcc(k, null, 0));
                        acc.count++;
                        if (attempt != null) {
                            acc.taskId = attempt.getTaskId();
                        }
                    }
                }
            }
        }
        List<MissItem> topMiss = miss.values().stream()
                .sorted(Comparator.comparingLong(MissAcc::count).reversed())
                .limit(5)
                .map(acc -> new MissItem(acc.title, acc.taskId, acc.count))
                .toList();

        List<ComplaintView> recent = views(complaints.findAllByOrderByCreatedAtDesc()).stream()
                .limit(4).toList();
        return new Dashboard(
                new Kpi(published, allTasks.size(), allAttempts.size(), avg, complaintsNew),
                attention.stream().limit(5).toList(), topMiss, recent);
    }

    /** Разбор попыток: фильтр по задаче, свежие первые, лимит 100. */
    @Transactional(readOnly = true)
    public List<AttemptRow> attemptRows(String taskId, int limit) {
        List<Attempt> all = attempts.findAll();
        all.sort(Comparator.comparing(Attempt::getCreatedAt,
                Comparator.nullsLast(Comparator.naturalOrder())).reversed());
        Map<UUID, Review> reviewByAttempt = new HashMap<>();
        for (Review review : reviews.findAll()) {
            reviewByAttempt.put(review.getAttemptId(), review);
        }
        List<AttemptRow> rows = new ArrayList<>();
        for (Attempt attempt : all) {
            if (taskId != null && !taskId.isBlank() && !taskId.equals(attempt.getTaskId())) {
                continue;
            }
            rows.add(rowOf(attempt, reviewByAttempt.get(attempt.getId())));
            if (rows.size() >= Math.max(1, Math.min(limit <= 0 ? 100 : limit, 500))) {
                break;
            }
        }
        return rows;
    }

    @Transactional(readOnly = true)
    public AttemptDetail attemptDetail(UUID attemptId) {
        Attempt attempt = attempts.findById(attemptId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        Review review = reviews.findById(attemptId).orElse(null);
        return new AttemptDetail(attempt.getId(), attempt.getTaskId(), titleOf(attempt.getTaskId()),
                nameOf(attempt.getUserId()), attempt.getStatus(), stamp(attempt.getCreatedAt()),
                attempt.getTabs(), review == null ? null : review.getResult());
    }

    /** Студенты: попытки, средний балл, активность — контекст для разбора жалоб. */
    @Transactional(readOnly = true)
    public List<StudentRow> students() {
        Map<UUID, List<Attempt>> byUser = new HashMap<>();
        for (Attempt attempt : attempts.findAll()) {
            byUser.computeIfAbsent(attempt.getUserId(), k -> new ArrayList<>()).add(attempt);
        }
        Map<UUID, Review> reviewByAttempt = new HashMap<>();
        for (Review review : reviews.findAll()) {
            reviewByAttempt.put(review.getAttemptId(), review);
        }
        List<StudentRow> rows = new ArrayList<>();
        for (User user : users.findAll()) {
            List<Attempt> mine = byUser.getOrDefault(user.getId(), List.of());
            List<Integer> scores = new ArrayList<>();
            InstantLast seen = new InstantLast();
            for (Attempt attempt : mine) {
                Review review = reviewByAttempt.get(attempt.getId());
                if (review != null) {
                    scores.add(review.getScore());
                }
                if (attempt.getCreatedAt() != null
                        && (seen.value == null || attempt.getCreatedAt().isAfter(seen.value))) {
                    seen.value = attempt.getCreatedAt();
                }
            }
            rows.add(new StudentRow(user.getId(), user.getName(), user.getEmail(), user.getRole(),
                    mine.size(), avgInts(scores),
                    seen.value == null ? null : seen.value.toString()));
        }
        rows.sort(Comparator.comparing(StudentRow::name, Comparator.nullsLast(String::compareTo)));
        return rows;
    }

    @Transactional(readOnly = true)
    public StudentCard studentCard(UUID userId) {
        User user = users.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        StudentRow row = students().stream().filter(s -> s.id().equals(userId)).findFirst()
                .orElse(new StudentRow(user.getId(), user.getName(), user.getEmail(),
                        user.getRole(), 0, null, null));
        Map<UUID, Review> reviewByAttempt = new HashMap<>();
        for (Review review : reviews.findAll()) {
            reviewByAttempt.put(review.getAttemptId(), review);
        }
        List<Attempt> mine = new ArrayList<>();
        for (Attempt attempt : attempts.findAll()) {
            if (userId.equals(attempt.getUserId())) {
                mine.add(attempt);
            }
        }
        mine.sort(Comparator.comparing(Attempt::getCreatedAt,
                Comparator.nullsLast(Comparator.naturalOrder())).reversed());
        List<AttemptRow> recent = new ArrayList<>();
        for (Attempt attempt : mine.subList(0, Math.min(5, mine.size()))) {
            recent.add(rowOf(attempt, reviewByAttempt.get(attempt.getId())));
        }
        return new StudentCard(row, recent);
    }

    /* ---------- внутреннее ---------- */

    private List<ComplaintView> views(List<Complaint> list) {
        List<ComplaintView> result = new ArrayList<>();
        for (Complaint complaint : list) {
            result.add(new ComplaintView(complaint.getId(), complaint.getTaskId(),
                    titleOf(complaint.getTaskId()), complaint.getAttemptId(),
                    nameOf(complaint.getUserId()), complaint.getScore(), complaint.getReason(),
                    complaint.getExcerpt(), complaint.getPromptVersion(), complaint.getStatus(),
                    complaint.getResolution(),
                    complaint.getCreatedAt() == null ? null : complaint.getCreatedAt().toString()));
        }
        return result;
    }

    private AttemptRow rowOf(Attempt attempt, Review review) {
        Integer score = null;
        String gradeLabel = null;
        int hit = 0;
        int total = 0;
        Integer sa = null;
        Integer arch = null;
        if (review != null && review.getResult() != null) {
            JsonNode node = review.getResult();
            score = review.getScore();
            gradeLabel = node.path("grade").path("label").asText(null);
            JsonNode criteria = node.get("criteria");
            if (criteria != null && criteria.isArray()) {
                total = criteria.size();
                for (JsonNode criterion : criteria) {
                    if ("hit".equals(criterion.path("state").asText())) {
                        hit++;
                    }
                }
            }
            JsonNode agents = node.get("agents");
            if (agents != null && agents.isArray()) {
                for (JsonNode agent : agents) {
                    if ("sa".equals(agent.path("id").asText())) {
                        sa = agent.path("score").asInt();
                    }
                    if ("arch".equals(agent.path("id").asText())) {
                        arch = agent.path("score").asInt();
                    }
                }
            }
        }
        return new AttemptRow(attempt.getId(), attempt.getTaskId(), titleOf(attempt.getTaskId()),
                nameOf(attempt.getUserId()), score, gradeLabel, hit, total, sa, arch,
                attempt.getStatus(), stamp(attempt.getCreatedAt()));
    }

    private String titleOf(String taskId) {
        return tasks.findById(taskId).map(Task::getTitle).orElse(taskId);
    }

    private String nameOf(UUID userId) {
        return users.findById(userId).map(User::getName).orElse("—");
    }

    private static String stamp(java.time.Instant value) {
        return value == null ? null : value.toString();
    }

    private static Double avgOf(List<Integer> scores) {
        return avgInts(scores);
    }

    private static Double avgInts(List<Integer> scores) {
        if (scores == null || scores.isEmpty()) {
            return null;
        }
        return scores.stream().mapToInt(Integer::intValue).average().orElse(0);
    }

    /** Сводка решения: plain-text первых строк всех вкладок (HTML режем). */
    static String excerptOf(JsonNode tabs) {
        if (tabs == null || !tabs.isArray()) {
            return "";
        }
        StringBuilder text = new StringBuilder();
        for (JsonNode tab : tabs) {
            JsonNode content = tab.get("content");
            if (content != null && content.isTextual() && !content.asText().isBlank()) {
                if (text.length() > 0) {
                    text.append('\n');
                }
                text.append(TAGS.matcher(content.asText()).replaceAll(" ").trim());
            }
            if (text.length() >= EXCERPT_LEN) {
                break;
            }
        }
        String value = text.toString().replaceAll("\\s+", " ").trim();
        return value.length() <= EXCERPT_LEN ? value : value.substring(0, EXCERPT_LEN) + "…";
    }

    private static final class MissAcc {
        final String title;
        String taskId;
        long count;

        MissAcc(String title, String taskId, long count) {
            this.title = title;
            this.taskId = taskId;
            this.count = count;
        }

        long count() {
            return count;
        }
    }

    private static final class InstantLast {
        java.time.Instant value;
    }
}
