package ru.analystgym.admin.web;

import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import com.fasterxml.jackson.databind.JsonNode;
import ru.analystgym.admin.service.LlmAdminService;
import ru.analystgym.admin.service.QuestionAdminService;
import ru.analystgym.admin.service.ReferenceAdminService;
import ru.analystgym.admin.service.TaskAdminService;
import ru.analystgym.admin.service.UserAdminService;
import ru.analystgym.admin.web.AdminDto.AuditRow;
import ru.analystgym.admin.web.AdminDto.AgentDto;
import ru.analystgym.admin.web.AdminDto.CollectionDto;
import ru.analystgym.admin.web.AdminDto.LevelDto;
import ru.analystgym.admin.web.AdminDto.PromptVersionDto;
import ru.analystgym.admin.web.AdminDto.ProviderDto;
import ru.analystgym.admin.web.AdminDto.QuestionDto;
import ru.analystgym.admin.web.AdminDto.RevisionView;
import ru.analystgym.admin.web.AdminDto.RoleRequest;
import ru.analystgym.admin.web.AdminDto.SimulateRequest;
import ru.analystgym.admin.web.AdminDto.TagDto;
import ru.analystgym.admin.web.AdminDto.TaskCreateRequest;
import ru.analystgym.admin.web.AdminDto.TaskFull;
import ru.analystgym.admin.web.AdminDto.TaskImportRequest;
import ru.analystgym.admin.web.AdminDto.TaskRow;
import ru.analystgym.admin.web.AdminDto.TaskUpdateRequest;
import ru.analystgym.admin.web.AdminDto.TrafficRequest;
import ru.analystgym.admin.web.AdminDto.UserRow;
import ru.analystgym.admin.web.AdminDto.VersionCreateRequest;
import ru.analystgym.identity.domain.User;
import ru.analystgym.identity.repo.UserRepository;
import ru.analystgym.identity.security.Roles;
import ru.analystgym.review.ReviewResult;

/**
 * Серверная админка контента, связанная с формами admin-server.js/admin-tasks.js.
 * Контент — METHODIST/SUPERADMIN, пользователи и журнал — только SUPERADMIN.
 */
@RestController
@RequestMapping("/api/admin")
public class AdminController {

    private final TaskAdminService tasks;
    private final ReferenceAdminService refs;
    private final UserAdminService usersAdmin;
    private final QuestionAdminService questionBank;
    private final LlmAdminService llm;
    private final UserRepository users;

    public AdminController(
            TaskAdminService tasks,
            ReferenceAdminService refs,
            UserAdminService usersAdmin,
            QuestionAdminService questionBank,
            LlmAdminService llm,
            UserRepository users) {
        this.tasks = tasks;
        this.refs = refs;
        this.usersAdmin = usersAdmin;
        this.questionBank = questionBank;
        this.llm = llm;
        this.users = users;
    }

    /* ---------- задачи ---------- */

    @GetMapping("/tasks")
    public List<TaskRow> listTasks(
            @RequestParam(required = false) String status, Authentication authentication) {
        methodist(authentication);
        return tasks.listTasks(status);
    }

    @GetMapping("/tasks/{id}")
    public TaskFull getTask(@PathVariable String id, Authentication authentication) {
        methodist(authentication);
        return tasks.getTask(id);
    }

    @PostMapping("/tasks")
    public ResponseEntity<TaskFull> createTask(
            @RequestBody TaskCreateRequest body, Authentication authentication) {
        User user = methodist(authentication);
        if (body == null || body.title() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "title required");
        }
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(tasks.createWithContent(user.getId(), body.title(), body.content()));
    }

    @PutMapping("/tasks/{id}")
    public TaskFull updateTask(
            @PathVariable String id, @RequestBody AdminDto.TaskUpdateRequest body,
            Authentication authentication) {
        User user = methodist(authentication);
        if (body == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "empty body");
        }
        return tasks.updateTask(user.getId(), id, body.title(), body.level(), body.tags(),
                body.timeMin(), body.status(), body.statement(), body.starterTabs(),
                body.rubric(), body.hints(), body.interviewQuestions(), body.authorSolution(), body.version());
    }

    @GetMapping("/tasks/{id}/revisions")
    public List<RevisionView> revisions(@PathVariable String id, Authentication authentication) {
        methodist(authentication);
        return tasks.revisionsOf(id);
    }

    @PostMapping("/tasks/{id}/simulate")
    public ReviewResult simulate(
            @PathVariable String id, @RequestBody SimulateRequest body,
            Authentication authentication) {
        methodist(authentication);
        return tasks.simulate(id, body == null ? null : body.text(),
                body == null ? null : body.rubric());
    }

    @GetMapping("/tasks/{id}/export")
    public JsonNode exportTask(@PathVariable String id, Authentication authentication) {
        methodist(authentication);
        return tasks.exportTask(id);
    }

    @GetMapping("/tasks/export")
    public List<TaskRow> exportAll(Authentication authentication) {
        methodist(authentication);
        return tasks.listTasks(null);
    }

    @PostMapping("/tasks/import")
    public ResponseEntity<TaskFull> importTask(
            @RequestBody TaskImportRequest body, Authentication authentication) {
        User user = methodist(authentication);
        if (body == null || body.task() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "task required");
        }
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(tasks.importTask(user.getId(), body.task()));
    }

    /* ---------- подборки и справочники ---------- */

    @GetMapping("/collections")
    public List<CollectionDto> collections(Authentication authentication) {
        methodist(authentication);
        return refs.listCollections();
    }

    @PostMapping("/collections")
    public ResponseEntity<CollectionDto> saveCollection(
            @RequestBody CollectionDto body, Authentication authentication) {
        User user = methodist(authentication);
        boolean created = body == null || body.id() == null || body.id().isBlank();
        var saved = refs.saveCollection(user.getId(), body);
        return ResponseEntity.status(created ? HttpStatus.CREATED : HttpStatus.OK).body(saved);
    }

    @DeleteMapping("/collections/{id}")
    public ResponseEntity<Void> deleteCollection(
            @PathVariable String id, @RequestParam Long version, Authentication authentication) {
        User user = methodist(authentication);
        refs.deleteCollection(user.getId(), id, version);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/tags")
    public List<TagDto> tags(Authentication authentication) {
        methodist(authentication);
        return refs.listTags();
    }

    @PostMapping("/tags")
    public ResponseEntity<TagDto> saveTag(
            @RequestBody TagDto body, Authentication authentication) {
        User user = methodist(authentication);
        boolean created = body == null || body.id() == null || body.id().isBlank();
        var saved = refs.saveTag(user.getId(), body);
        return ResponseEntity.status(created ? HttpStatus.CREATED : HttpStatus.OK).body(saved);
    }

    @DeleteMapping("/tags/{id}")
    public ResponseEntity<Void> deleteTag(
            @PathVariable String id, @RequestParam Long version, Authentication authentication) {
        User user = methodist(authentication);
        refs.deleteTag(user.getId(), id, version);
        return ResponseEntity.noContent().build();
    }

    @PutMapping("/levels/{id}")
    public ru.analystgym.catalog.domain.Level updateLevel(
            @PathVariable String id, @RequestBody LevelDto body, Authentication authentication) {
        User user = methodist(authentication);
        return refs.updateLevel(user.getId(), id, body);
    }

    @GetMapping("/levels")
    public List<ru.analystgym.catalog.domain.Level> levels(Authentication authentication) {
        methodist(authentication);
        return refs.listLevels();
    }

    /** Устаревшая форма и одновременные записи возвращают одинаковый конфликт. */
    @org.springframework.web.bind.annotation.ExceptionHandler(org.springframework.dao.OptimisticLockingFailureException.class)
    public ResponseEntity<java.util.Map<String, String>> editConflict() {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(java.util.Map.of("error", "edit_conflict"));
    }

    /** Именованные ошибки формы доступны клиенту без включения подробных ошибок всего приложения. */
    @org.springframework.web.bind.annotation.ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<java.util.Map<String, String>> validationError(ResponseStatusException error) {
        String reason = error.getReason() == null ? "request_rejected" : error.getReason();
        String message = switch (reason) {
            case "publication_requires_brief_goal_deliverables_rubric_reference" ->
                    "Для публикации заполните условие, цель, ожидаемый результат, рубрику и эталон.";
            case "publication_requires_starter_tabs" -> "Для публикации добавьте стартовую вкладку решения.";
            case "bad status transition" -> "Недопустимый переход: черновик → на ревью → опубликована → архив.";
            case "bad criterion keywords" -> "У каждого критерия нужны 1–20 ключевых маркеров.";
            case "bad criterion weight" -> "Вес критерия должен быть от 1 до 10.";
            case "duplicate or invalid criterion id" -> "ID критериев должны быть уникальны и не длиннее 100 символов.";
            case "create_new_version_for_live_prompt" -> "Создайте новую редакцию рабочего промпта.";
            case "traffic_must_total_100" -> "Сумма трафика должна быть 100%. Сначала назначьте активную редакцию.";
            case "bad traffic" -> "Трафик должен быть 0–100%; новая редакция создаётся с 0%.";
            case "tag exists" -> "Метка с таким ID уже существует.";
            case "unknown task" -> "В подборке указан неизвестный ID задачи.";
            default -> reason;
        };
        return ResponseEntity.status(error.getStatusCode()).body(java.util.Map.of("error", reason, "message", message));
    }

    /** Коллизия новых ID или зависимая запись, изменённая соседней транзакцией. */
    @org.springframework.web.bind.annotation.ExceptionHandler(org.springframework.dao.DataIntegrityViolationException.class)
    public ResponseEntity<java.util.Map<String, String>> writeConflict() {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(java.util.Map.of("error", "write_conflict"));
    }

    /* ---------- банк вопросов ---------- */

    @GetMapping("/questions")
    public List<QuestionDto> questions(Authentication authentication) {
        methodist(authentication);
        return questionBank.listAll();
    }

    @PostMapping("/questions")
    public ResponseEntity<QuestionDto> createQuestion(
            @RequestBody QuestionDto body, Authentication authentication) {
        User user = methodist(authentication);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(questionBank.create(user.getId(), body));
    }

    @PutMapping("/questions/{id}")
    public QuestionDto updateQuestion(
            @PathVariable String id, @RequestBody QuestionDto body, Authentication authentication) {
        User user = methodist(authentication);
        return questionBank.update(user.getId(), id, body);
    }

    /* ---------- пользователи и журнал ---------- */
    @GetMapping("/users")
    public List<UserRow> listUsers(Authentication authentication) {
        superadmin(authentication);
        return usersAdmin.listUsers();
    }

    @PutMapping("/users/{id}/role")
    public UserRow setRole(
            @PathVariable UUID id, @RequestBody RoleRequest body, Authentication authentication) {
        User caller = superadmin(authentication);
        if (body == null || body.role() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "role required");
        }
        return usersAdmin.setRole(caller.getId(), id, body.role(), body.expectedRole());
    }

    @GetMapping("/audit")
    public List<AuditRow> audit(
            @RequestParam(required = false, defaultValue = "100") int limit,
            Authentication authentication) {
        superadmin(authentication);
        return usersAdmin.audit(limit);
    }

    /* ---------- LLM-инфраструктура (UC-L01–L06) ---------- */

    @GetMapping("/llm/providers")
    public List<ProviderDto> providers(Authentication authentication) {
        llmAdmin(authentication);
        return llm.listProviders();
    }

    @PostMapping("/llm/providers")
    public ResponseEntity<ProviderDto> saveProvider(
            @RequestBody ProviderDto body, Authentication authentication) {
        User user = llmAdmin(authentication);
        var saved = llm.saveProvider(user.getId(), body);
        return ResponseEntity.status(saved.created() ? HttpStatus.CREATED : HttpStatus.OK)
                .body(saved.provider());
    }

    @PostMapping("/llm/providers/{id}/check")
    public ProviderDto checkProvider(@PathVariable String id, Authentication authentication) {
        llmAdmin(authentication);
        return llm.healthCheck(id);
    }

    @GetMapping("/llm/agents")
    public List<AgentDto> agents(Authentication authentication) {
        llmAdmin(authentication);
        return llm.listAgents();
    }

    @PutMapping("/llm/agents/{id}")
    public AgentDto saveAgent(
            @PathVariable String id, @RequestBody AgentDto body, Authentication authentication) {
        User user = llmAdmin(authentication);
        return llm.saveAgent(user.getId(), id, body);
    }

    @GetMapping("/llm/prompts/{key}/versions")
    public List<PromptVersionDto> versions(
            @PathVariable String key, Authentication authentication) {
        llmAdmin(authentication);
        return llm.listVersions(key);
    }

    @GetMapping("/llm/prompts")
    public List<ru.analystgym.review.domain.Prompt> prompts(Authentication authentication) {
        llmAdmin(authentication);
        return llm.listPrompts();
    }

    @PostMapping("/llm/prompts/{key}/versions")
    public ResponseEntity<PromptVersionDto> createVersion(
            @PathVariable String key, @RequestBody VersionCreateRequest body,
            Authentication authentication) {
        User user = llmAdmin(authentication);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(llm.createVersion(user.getId(), key, body));
    }

    @PutMapping("/llm/versions/{id}")
    public PromptVersionDto updateVersion(
            @PathVariable UUID id, @RequestBody VersionCreateRequest body,
            Authentication authentication) {
        User user = llmAdmin(authentication);
        return llm.updateVersion(user.getId(), id, body);
    }

    @PostMapping("/llm/versions/{id}/traffic")
    public PromptVersionDto setTraffic(
            @PathVariable UUID id, @RequestBody TrafficRequest body,
            Authentication authentication) {
        User user = llmAdmin(authentication);
        return llm.setTraffic(user.getId(), id, body);
    }

    @PostMapping("/llm/versions/{id}/promote")
    public PromptVersionDto promote(@PathVariable UUID id, @RequestBody TrafficRequest body, Authentication authentication) {
        User user = llmAdmin(authentication);
        return llm.promote(user.getId(), id, body.version());
    }

    /* ---------- доступ ---------- */

    private static UUID currentUser(Authentication authentication) {
        if (authentication == null || !(authentication.getPrincipal() instanceof UUID userId)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        }
        return userId;
    }

    private User methodist(Authentication authentication) {
        User user = users.findById(currentUser(authentication))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        Roles.require(user, Roles.METHODIST, Roles.SUPERADMIN);
        return user;
    }

    private User superadmin(Authentication authentication) {
        User user = users.findById(currentUser(authentication))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        Roles.require(user, Roles.SUPERADMIN);
        return user;
    }

    /** Персонал LLM-контура: админ инфраструктуры или суперадмин. */
    private User llmAdmin(Authentication authentication) {
        User user = users.findById(currentUser(authentication))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        Roles.require(user, Roles.LLM_ADMIN, Roles.SUPERADMIN);
        return user;
    }
}
