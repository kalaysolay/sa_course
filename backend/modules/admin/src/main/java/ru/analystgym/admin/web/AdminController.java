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
import ru.analystgym.admin.service.QuestionAdminService;
import ru.analystgym.admin.service.ReferenceAdminService;
import ru.analystgym.admin.service.TaskAdminService;
import ru.analystgym.admin.service.UserAdminService;
import ru.analystgym.admin.web.AdminDto.AuditRow;
import ru.analystgym.admin.web.AdminDto.CollectionDto;
import ru.analystgym.admin.web.AdminDto.LevelDto;
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
import ru.analystgym.admin.web.AdminDto.UserRow;
import ru.analystgym.identity.domain.User;
import ru.analystgym.identity.repo.UserRepository;
import ru.analystgym.identity.security.Roles;
import ru.analystgym.review.ReviewResult;

/**
 * Админка контента (UC-M01–M09 без UI: демо Фазы 3 — правки через API).
 * Контент — METHODIST/SUPERADMIN, пользователи и журнал — только SUPERADMIN.
 */
@RestController
@RequestMapping("/api/admin")
public class AdminController {

    private final TaskAdminService tasks;
    private final ReferenceAdminService refs;
    private final UserAdminService usersAdmin;
    private final QuestionAdminService questionBank;
    private final UserRepository users;

    public AdminController(
            TaskAdminService tasks,
            ReferenceAdminService refs,
            UserAdminService usersAdmin,
            QuestionAdminService questionBank,
            UserRepository users) {
        this.tasks = tasks;
        this.refs = refs;
        this.usersAdmin = usersAdmin;
        this.questionBank = questionBank;
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
                .body(tasks.createTask(user.getId(), body.title()));
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
                body.rubric(), body.hints(), body.interviewQuestions(), body.authorSolution());
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
            @PathVariable String id, Authentication authentication) {
        User user = methodist(authentication);
        refs.deleteCollection(user.getId(), id);
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
            @PathVariable String id, Authentication authentication) {
        User user = methodist(authentication);
        refs.deleteTag(user.getId(), id);
        return ResponseEntity.noContent().build();
    }

    @PutMapping("/levels/{id}")
    public ru.analystgym.catalog.domain.Level updateLevel(
            @PathVariable String id, @RequestBody LevelDto body, Authentication authentication) {
        User user = methodist(authentication);
        return refs.updateLevel(user.getId(), id, body);
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
        return usersAdmin.setRole(caller.getId(), id, body.role());
    }

    @GetMapping("/audit")
    public List<AuditRow> audit(
            @RequestParam(required = false, defaultValue = "100") int limit,
            Authentication authentication) {
        superadmin(authentication);
        return usersAdmin.audit(limit);
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
}
