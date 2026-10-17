package ru.analystgym.admin.service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import ru.analystgym.admin.domain.TaskRevision;
import ru.analystgym.admin.repo.TaskRevisionRepository;
import ru.analystgym.admin.web.AdminDto.CriterionDto;
import ru.analystgym.admin.web.AdminDto.TaskFull;
import ru.analystgym.admin.web.AdminDto.TaskRow;
import ru.analystgym.catalog.domain.Level;
import ru.analystgym.catalog.domain.Tag;
import ru.analystgym.catalog.domain.Task;
import ru.analystgym.catalog.repo.LevelRepository;
import ru.analystgym.catalog.repo.TagRepository;
import ru.analystgym.catalog.repo.TaskRepository;
import ru.analystgym.practice.service.ReviewMapper;
import ru.analystgym.review.MockReviewProvider;
import ru.analystgym.review.RecCandidate;
import ru.analystgym.review.ReviewInput;
import ru.analystgym.review.ReviewResult;
import ru.analystgym.review.SolutionTab;

/**
 * Задачи методиста (UC-M01–M05, M09): создание через транслит-id,
 * правки с ревизиями, линейный workflow статусов, симулятор тем же
 * движком, экспорт/импорт JSON. Удаления нет — вместо него архив.
 */
@Service
public class TaskAdminService {

    /** Допустимые переходы статусов (UC-M04 + возврат на доработку). */
    static final Map<String, List<String>> TRANSITIONS = Map.of(
            "draft", List.of("draft", "review"),
            "review", List.of("review", "draft", "published"),
            "published", List.of("published", "archived"),
            "archived", List.of("archived", "draft"));

    private final TaskRepository tasks;
    private final TaskRevisionRepository revisions;
    private final LevelRepository levels;
    private final TagRepository tags;
    private final ObjectMapper mapper;
    private final AdminAudit audit;

    public TaskAdminService(
            TaskRepository tasks,
            TaskRevisionRepository revisions,
            LevelRepository levels,
            TagRepository tags,
            ObjectMapper mapper,
            AdminAudit audit) {
        this.tasks = tasks;
        this.revisions = revisions;
        this.levels = levels;
        this.tags = tags;
        this.mapper = mapper;
        this.audit = audit;
    }

    @Transactional(readOnly = true)
    public List<TaskRow> listTasks(String status) {
        List<TaskRow> rows = new ArrayList<>();
        for (Task task : tasks.findAll()) {
            if (status != null && !status.isBlank() && !status.equals(task.getStatus())) {
                continue;
            }
            rows.add(rowOf(task));
        }
        rows.sort((a, b) -> b.updatedAt().compareTo(a.updatedAt()));
        return rows;
    }

    @Transactional(readOnly = true)
    public TaskFull getTask(String id) {
        return fullOf(taskOrThrow(id));
    }

    /** Создание: название → транслит-id (−2/−3 при коллизии) → черновик. */
    @Transactional
    public TaskFull createTask(UUID authorId, String title) {
        String clean = title == null ? "" : title.trim();
        if (clean.length() < 3 || clean.length() > 200) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "bad title");
        }
        String base = Slug.slugify(clean);
        if (base.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "bad title");
        }
        String id = base;
        int n = 2;
        while (tasks.existsById(id)) {
            id = base + "-" + n;
            n++;
        }
        Task task = new Task();
        task.setId(id);
        task.setTitle(clean);
        task.setLevelId("easy");
        task.setTags(new String[0]);
        task.setStatus("draft");
        task.setTimeMin(30);
        task.setSolvedRate(0);
        task.setStatement(blankStatement());
        task.setStarterTabs(blankStarterTabs());
        task.setRubric(JsonNodeFactory.instance.arrayNode());
        task.setHints(JsonNodeFactory.instance.arrayNode());
        task.setInterviewQuestions(JsonNodeFactory.instance.arrayNode());
        task.setAuthorSolution(blankAuthorSolution());
        task = tasks.saveAndFlush(task);
        writeRevision(id, authorId, task);
        audit.log(authorId, "task.create", "task:" + id);
        return fullOf(task);
    }

    /** Правка: присланные поля заменяют целиком (массивы — не мерж, как в Store). */
    @Transactional
    public TaskFull createWithContent(UUID authorId, String title, ru.analystgym.admin.web.AdminDto.TaskUpdateRequest body) {
        TaskFull created = createTask(authorId, title);
        if (body == null) return created;
        return updateTask(authorId, created.id(), title, body.level(), body.tags(), body.timeMin(), "draft",
                body.statement(), body.starterTabs(), body.rubric(), body.hints(), body.interviewQuestions(),
                body.authorSolution(), created.version());
    }

    /** Правка одной версии с записью ревизии в той же транзакции. */
    @Transactional
    public TaskFull updateTask(UUID authorId, String id, String title, String level,
                               List<String> tagIds, Integer timeMin, String status,
                               JsonNode statement, JsonNode starterTabs,
                               List<CriterionDto> rubric, List<String> hints,
                               List<String> interviewQuestions, JsonNode authorSolution, Long version) {
        Task task = tasks.lockById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        EditVersion.require(task.getVersion(), version);
        if (title != null) {
            String clean = title.trim();
            if (clean.length() < 3 || clean.length() > 200) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "bad title");
            }
            task.setTitle(clean);
        }
        if (level != null) {
            requireLevel(level);
            task.setLevelId(level);
        }
        if (tagIds != null) {
            requireTags(tagIds);
            task.setTags(tagIds.toArray(new String[0]));
        }
        if (timeMin != null) {
            if (timeMin < 5 || timeMin > 480) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "bad timeMin");
            }
            task.setTimeMin(timeMin);
        }
        if (status != null) {
            List<String> allowed = TRANSITIONS.getOrDefault(task.getStatus(), List.of());
            if (!allowed.contains(status)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "bad status transition");
            }
            task.setStatus(status);
        }
        if (statement != null) {
            validateStatement(statement);
            task.setStatement(statement);
        }
        if (starterTabs != null) {
            validateTabs(starterTabs);
            task.setStarterTabs(starterTabs);
        }
        if (rubric != null) {
            task.setRubric(rubricNode(rubric));
        }
        if (hints != null) {
            validateStrings(hints, 50, 2000, "bad hints");
            task.setHints(mapper.valueToTree(hints));
        }
        if (interviewQuestions != null) {
            validateStrings(interviewQuestions, 20, 1000, "bad interviewQuestions");
            task.setInterviewQuestions(mapper.valueToTree(interviewQuestions));
        }
        if (authorSolution != null) {
            validateAuthor(authorSolution);
            task.setAuthorSolution(authorSolution);
        }
        validatePublication(task);
        tasks.saveAndFlush(task);
        writeRevision(id, authorId, task);
        audit.log(authorId, "task.update", "task:" + id);
        return fullOf(task);
    }

    @Transactional(readOnly = true)
    public List<ru.analystgym.admin.web.AdminDto.RevisionView> revisionsOf(String id) {
        taskOrThrow(id);
        List<ru.analystgym.admin.web.AdminDto.RevisionView> result = new ArrayList<>();
        for (TaskRevision revision : revisions.findByTaskIdOrderByRevDesc(id)) {
            result.add(new ru.analystgym.admin.web.AdminDto.RevisionView(revision.getRev(),
                    revision.getAuthorId(),
                    revision.getCreatedAt() == null ? null : revision.getCreatedAt().toString(),
                    revision.getSnapshot()));
        }
        return result;
    }

    /**
     * Симулятор (UC-M05): гоняем текст тем же движком через сохранённую
     * рубрику (или присланный черновик рубрики — сохранять не обязательно).
     */
    @Transactional(readOnly = true)
    public ReviewResult simulate(String id, String text, List<CriterionDto> rubricOverride) {
        Task task = taskOrThrow(id);
        JsonNode rubric = rubricOverride == null ? task.getRubric() : rubricNode(rubricOverride);
        String levelName = levels.findById(task.getLevelId()).map(Level::getName)
                .orElse(task.getLevelId());
        ReviewInput input = ReviewMapper.toInputFromSnapshot(task.getId(), task.getTitle(),
                task.getLevelId(), levelName,
                task.getTags() == null ? List.of() : List.of(task.getTags()),
                ReviewMapper.expectsDiagram(task.getStarterTabs()),
                rubric, task.getInterviewQuestions());
        List<RecCandidate> candidates = new ArrayList<>();
        for (Task candidate : tasks.search(null, null, "published", null)) {
            candidates.add(new RecCandidate(candidate.getId(), candidate.getTitle(),
                    candidate.getLevelId(),
                    candidate.getTags() == null ? List.of() : List.of(candidate.getTags())));
        }
        return MockReviewProvider.buildReview(input,
                List.of(new SolutionTab("sim", "doc", "Проверка", text == null ? "" : text)),
                candidates);
    }

    /** Экспорт задачи целиком (бэкап/перенос между стендами). */
    @Transactional(readOnly = true)
    public JsonNode exportTask(String id) {
        return snapshotOf(taskOrThrow(id));
    }

    /** Импорт с валидацией схемы: id занят — 409, правки поверх запрещены. */
    @Transactional
    public TaskFull importTask(UUID authorId, JsonNode node) {
        if (node == null || !node.isObject()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "bad task json");
        }
        String id = node.path("id").asText("");
        if (!Slug.isValidId(id)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "bad id");
        }
        if (tasks.existsById(id)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "task exists");
        }
        String title = node.path("title").asText("").trim();
        if (title.length() < 3 || title.length() > 200) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "bad title");
        }
        String level = node.path("level").asText("easy");
        requireLevel(level);
        List<String> tagIds = strings(node.get("tags"));
        requireTags(tagIds);
        int timeMin = node.path("timeMin").asInt(30);
        if (timeMin < 5 || timeMin > 480) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "bad timeMin");
        }
        String status = node.path("status").asText("draft");
        if (!TRANSITIONS.containsKey(status)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "bad status");
        }
        Task task = new Task();
        task.setId(id);
        task.setTitle(title);
        task.setLevelId(level);
        task.setTags(tagIds.toArray(new String[0]));
        task.setStatus(status);
        task.setTimeMin(timeMin);
        task.setSolvedRate(0);
        task.setStatement(node.has("statement") && node.get("statement").isObject()
                ? node.get("statement") : blankStatement());
        if (node.has("starterTabs")) {
            validateTabs(node.get("starterTabs"));
            task.setStarterTabs(node.get("starterTabs"));
        } else {
            task.setStarterTabs(blankStarterTabs());
        }
        if (node.has("rubric")) {
            task.setRubric(rubricJson(node.get("rubric")));
        } else {
            task.setRubric(JsonNodeFactory.instance.arrayNode());
        }
        task.setHints(node.has("hints") && node.get("hints").isArray()
                ? node.get("hints") : JsonNodeFactory.instance.arrayNode());
        task.setInterviewQuestions(node.has("interviewQuestions") && node.get("interviewQuestions").isArray()
                ? node.get("interviewQuestions") : JsonNodeFactory.instance.arrayNode());
        task.setAuthorSolution(node.has("authorSolution") && node.get("authorSolution").isObject()
                ? node.get("authorSolution") : blankAuthorSolution());
        validateStatement(task.getStatement());
        validateAuthor(task.getAuthorSolution());
        validateStrings(strings(task.getHints()), 50, 2000, "bad hints");
        validateStrings(strings(task.getInterviewQuestions()), 20, 1000, "bad interviewQuestions");
        validatePublication(task);
        task = tasks.saveAndFlush(task);
        writeRevision(id, authorId, task);
        audit.log(authorId, "task.import", "task:" + id);
        return fullOf(task);
    }

    /* ---------- внутреннее ---------- */

    Task taskOrThrow(String id) {
        return tasks.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    private void requireLevel(String level) {
        if (!levels.existsById(level)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "unknown level");
        }
    }

    private void requireTags(List<String> tagIds) {
        if (tagIds.size() > 30) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "too many tags");
        }
        for (String tagId : tagIds) {
            if (!tags.existsById(tagId)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "unknown tag");
            }
        }
    }

    /** Рубрика из формы: строгая валидация, id стабильны (генерим только пустым). */
    static ArrayNode rubricNode(List<CriterionDto> rubric) {
        ArrayNode result = JsonNodeFactory.instance.arrayNode();
        if (rubric == null) {
            return result;
        }
        if (rubric.size() > 30) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "too many criteria");
        }
        java.util.Set<String> ids = new java.util.HashSet<>();
        for (CriterionDto criterion : rubric) {
            if (criterion == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "bad criterion");
            }
            String title = criterion.title() == null ? "" : criterion.title().trim();
            if (title.length() < 3 || title.length() > 200) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "bad criterion title");
            }
            if (criterion.weightValue() == null || criterion.weightValue() < 1
                    || criterion.weightValue() > 10) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "bad criterion weight");
            }
            if (!"sa".equals(criterion.focus()) && !"arch".equals(criterion.focus())) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "bad criterion focus");
            }
            List<String> keywords = new ArrayList<>();
            if (criterion.keywords() != null) {
                for (String keyword : criterion.keywords()) {
                    String clean = keyword == null ? "" : keyword.trim();
                    if (!clean.isEmpty()) {
                        if (clean.length() > 100) {
                            throw new ResponseStatusException(
                                    HttpStatus.BAD_REQUEST, "bad criterion keyword");
                        }
                        keywords.add(clean);
                    }
                }
            }
            if (keywords.isEmpty() || keywords.size() > 20) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "bad criterion keywords");
            }
            String why = criterion.why() == null ? "" : criterion.why().trim();
            if (why.length() > 2000) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "bad criterion why");
            }
            ObjectNode node = JsonNodeFactory.instance.objectNode();
            String cid = criterion.id() == null || criterion.id().isBlank()
                    ? "c_" + UUID.randomUUID().toString().replace("-", "").substring(0, 6)
                    : criterion.id().trim();
            if (cid.length() > 100 || !ids.add(cid)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "duplicate or invalid criterion id");
            }
            node.put("id", cid);
            node.put("title", title);
            // Legacy-вес — заглушка как в макете, реальный вес — weightValue.
            node.put("weight", "high");
            node.put("weightValue", criterion.weightValue());
            node.put("focus", criterion.focus());
            node.put("critical", criterion.critical() == Boolean.TRUE);
            ArrayNode kw = node.putArray("keywords");
            for (String keyword : keywords) {
                kw.add(keyword);
            }
            node.put("why", why);
            result.add(node);
        }
        return result;
    }

    /** Рубрика из импорта: та же валидация через DTO. */
    private static ArrayNode rubricJson(JsonNode rubric) {
        if (rubric == null || !rubric.isArray()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "bad rubric");
        }
        List<CriterionDto> dtos = new ArrayList<>();
        for (JsonNode item : rubric) {
            List<String> keywords = new ArrayList<>();
            if (item.has("keywords") && item.get("keywords").isArray()) {
                for (JsonNode keyword : item.get("keywords")) {
                    keywords.add(keyword.asText(""));
                }
            }
            dtos.add(new CriterionDto(
                    item.path("id").asText(null),
                    item.path("title").asText(""),
                    item.has("weightValue") ? item.get("weightValue").asInt(-1) : null,
                    item.path("focus").asText(""),
                    item.path("critical").asBoolean(false),
                    keywords,
                    item.path("why").asText("")));
        }
        return rubricNode(dtos);
    }

    private static void validateTabs(JsonNode starterTabs) {
        if (starterTabs == null || !starterTabs.isArray()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "bad starterTabs");
        }
        if (starterTabs.size() > 20) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "too many tabs");
        }
        for (JsonNode tab : starterTabs) {
            String type = tab.path("type").asText("");
            if (!List.of("doc", "plantuml", "mermaid").contains(type)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "bad tab type");
            }
            if (!tab.path("title").isTextual() || tab.path("title").asText().isBlank()
                    || tab.path("title").asText().length() > 120
                    || !tab.path("content").isTextual() || tab.path("content").asText().length() > 200_000) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "bad tab title or content");
            }
        }
    }

    private static void validateStrings(List<String> values, int maxItems, int maxLen, String error) {
        if (values.size() > maxItems) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, error);
        }
        for (String value : values) {
            if (value == null || value.length() > maxLen) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, error);
            }
        }
    }

    private static void validateStatement(JsonNode statement) {
        if (statement == null || !statement.isObject()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "bad statement");
        }
        for (String key : List.of("brief", "goal", "interview")) {
            if (!statement.path(key).isTextual() || statement.path(key).asText().length() > 10_000) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "bad statement " + key);
            }
        }
        for (String key : List.of("context", "inputs", "deliverables", "constraints")) {
            JsonNode values = statement.path(key);
            if (!values.isArray() || values.size() > 50) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "bad statement " + key);
            }
            for (JsonNode value : values) {
                if (!value.isTextual() || value.asText().length() > 10_000) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "bad statement " + key);
                }
            }
        }
    }

    private static void validateAuthor(JsonNode author) {
        if (author == null || !author.isObject()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "bad authorSolution");
        }
        for (String key : List.of("doc", "plantuml", "mermaid")) {
            if (author.has(key) && (!author.get(key).isTextual() || author.get(key).asText().length() > 200_000)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "bad authorSolution " + key);
            }
        }
    }

    private static List<String> strings(JsonNode node) {
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

    private void writeRevision(String taskId, UUID authorId, Task task) {
        int rev = revisions.findFirstByTaskIdOrderByRevDesc(taskId)
                .map(r -> r.getRev() + 1).orElse(1);
        TaskRevision revision = new TaskRevision();
        revision.setId(UUID.randomUUID());
        revision.setTaskId(taskId);
        revision.setRev(rev);
        revision.setAuthorId(authorId);
        revision.setSnapshot(snapshotOf(task));
        revisions.save(revision);
    }

    private JsonNode snapshotOf(Task task) {
        ObjectNode snap = JsonNodeFactory.instance.objectNode();
        snap.put("id", task.getId());
        snap.put("version", task.getVersion());
        snap.put("title", task.getTitle());
        snap.put("level", task.getLevelId());
        snap.set("tags", mapper.valueToTree(
                task.getTags() == null ? List.of() : List.of(task.getTags())));
        snap.put("status", task.getStatus());
        snap.put("timeMin", task.getTimeMin());
        snap.put("solvedRate", task.getSolvedRate());
        snap.set("statement", task.getStatement() == null
                ? JsonNodeFactory.instance.objectNode() : task.getStatement());
        snap.set("starterTabs", task.getStarterTabs() == null
                ? JsonNodeFactory.instance.arrayNode() : task.getStarterTabs());
        snap.set("rubric", task.getRubric() == null
                ? JsonNodeFactory.instance.arrayNode() : task.getRubric());
        snap.set("hints", task.getHints() == null
                ? JsonNodeFactory.instance.arrayNode() : task.getHints());
        snap.set("interviewQuestions", task.getInterviewQuestions() == null
                ? JsonNodeFactory.instance.arrayNode() : task.getInterviewQuestions());
        snap.set("authorSolution", task.getAuthorSolution() == null
                ? JsonNodeFactory.instance.objectNode() : task.getAuthorSolution());
        return snap;
    }

    private TaskRow rowOf(Task task) {
        int criteria = task.getRubric() != null && task.getRubric().isArray()
                ? task.getRubric().size() : 0;
        return new TaskRow(task.getId(), task.getTitle(), task.getLevelId(), task.getStatus(),
                task.getTags() == null ? List.of() : List.of(task.getTags()),
                task.getTimeMin(), task.getSolvedRate(), criteria,
                task.getUpdatedAt() == null ? "" : task.getUpdatedAt().toString(), task.getVersion());
    }

    private TaskFull fullOf(Task task) {
        return new TaskFull(task.getId(), task.getTitle(), task.getLevelId(), task.getStatus(),
                task.getTags() == null ? List.of() : List.of(task.getTags()),
                task.getTimeMin(), task.getSolvedRate(), task.getStatement(),
                task.getStarterTabs(), task.getRubric(), task.getHints(),
                task.getInterviewQuestions(), task.getAuthorSolution(),
                task.getUpdatedAt() == null ? "" : task.getUpdatedAt().toString(), task.getVersion());
    }

    /** Публиковать можно только задачу с условием, результатом, рубрикой и эталоном. */
    private static void validatePublication(Task task) {
        if (!"published".equals(task.getStatus())) return;
        JsonNode statement = task.getStatement();
        if (statement == null || !hasText(statement.path("brief"))
                || !hasText(statement.path("goal"))
                || !statement.path("deliverables").isArray() || statement.path("deliverables").isEmpty()
                || java.util.stream.StreamSupport.stream(statement.path("deliverables").spliterator(), false)
                        .anyMatch(v -> !v.isTextual() || !hasText(v))
                || task.getRubric() == null || task.getRubric().isEmpty()
                || task.getAuthorSolution() == null || !hasText(task.getAuthorSolution().path("doc"))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "publication_requires_brief_goal_deliverables_rubric_reference");
        }
        rubricJson(task.getRubric());
        validateTabs(task.getStarterTabs());
        if (task.getStarterTabs().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "publication_requires_starter_tabs");
        }
    }

    private static boolean hasText(JsonNode value) {
        return !value.asText("").replaceAll("<[^>]*>", "").replace("&nbsp;", " ").replace('\u00a0', ' ').isBlank();
    }

    private static ObjectNode blankStatement() {
        ObjectNode statement = JsonNodeFactory.instance.objectNode();
        statement.put("brief", "");
        statement.set("context", JsonNodeFactory.instance.arrayNode());
        statement.put("goal", "");
        statement.set("inputs", JsonNodeFactory.instance.arrayNode());
        statement.set("deliverables", JsonNodeFactory.instance.arrayNode());
        statement.set("constraints", JsonNodeFactory.instance.arrayNode());
        statement.put("interview", "");
        return statement;
    }

    private static ArrayNode blankStarterTabs() {
        ArrayNode tabs = JsonNodeFactory.instance.arrayNode();
        ObjectNode tab = JsonNodeFactory.instance.objectNode();
        tab.put("type", "doc");
        tab.put("title", "Решение");
        tab.put("content", "");
        tabs.add(tab);
        return tabs;
    }

    private static ObjectNode blankAuthorSolution() {
        ObjectNode solution = JsonNodeFactory.instance.objectNode();
        solution.put("doc", "");
        return solution;
    }
}
