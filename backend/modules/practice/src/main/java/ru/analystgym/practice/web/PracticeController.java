package ru.analystgym.practice.web;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import ru.analystgym.practice.domain.Draft;
import ru.analystgym.practice.service.PracticeService;
import ru.analystgym.practice.web.PracticeDto.AttemptSummary;
import ru.analystgym.practice.web.PracticeDto.AttemptView;
import ru.analystgym.practice.web.PracticeDto.DraftRequest;
import ru.analystgym.practice.web.PracticeDto.DraftResponse;
import ru.analystgym.practice.web.PracticeDto.SubmitRequest;
import ru.analystgym.practice.web.PracticeDto.SubmitResponse;
import ru.analystgym.practice.web.PracticeDto.TaskDetail;

/**
 * Контур практики (Фаза 2). Черновики/попытки/эталон — только своим,
 * полное тело задачи (без эталона) — публично, как условие в task.js.
 * Submit всегда отвечает 202: ревью считается асинхронно воркером,
 * фронт опрашивает GET /api/attempts/{id}.
 */
@RestController
@RequestMapping("/api")
public class PracticeController {

    private final PracticeService practice;

    public PracticeController(PracticeService practice) {
        this.practice = practice;
    }

    @PutMapping("/tasks/{id}/draft")
    public DraftResponse saveDraft(
            @PathVariable String id,
            @RequestBody DraftRequest body,
            Authentication authentication) {
        UUID userId = currentUser(authentication);
        var updatedAt = practice.saveDraft(userId, id, body == null ? null : body.tabs());
        Draft draft = practice.draftOf(userId, id);
        return new DraftResponse(id, draft == null ? emptyTabs() : draft.getTabs(),
                updatedAt == null ? null : updatedAt.toString());
    }

    @GetMapping("/tasks/{id}/draft")
    public DraftResponse getDraft(@PathVariable String id, Authentication authentication) {
        UUID userId = currentUser(authentication);
        Draft draft = practice.draftOf(userId, id);
        if (draft == null) {
            return new DraftResponse(id, emptyTabs(), null);
        }
        return new DraftResponse(id, draft.getTabs(),
                draft.getUpdatedAt() == null ? null : draft.getUpdatedAt().toString());
    }

    @PostMapping("/attempts")
    public ResponseEntity<SubmitResponse> submit(
            @RequestBody SubmitRequest body,
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
            Authentication authentication) {
        UUID userId = currentUser(authentication);
        if (body == null || body.taskId() == null || body.taskId().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "taskId required");
        }
        UUID attemptId = practice.submit(userId, body.taskId(), body.tabs(), idempotencyKey);
        // 202 и для новой, и для повторной (идемпотентной) отправки:
        // работа уже принята, результат — polling.
        return ResponseEntity.status(HttpStatus.ACCEPTED)
                .body(new SubmitResponse(attemptId, body.taskId(), "in_review"));
    }

    @GetMapping("/attempts/{attemptId}")
    public AttemptView attempt(@PathVariable UUID attemptId, Authentication authentication) {
        return practice.attemptView(currentUser(authentication), attemptId);
    }

    @GetMapping("/tasks/{id}/attempts")
    public List<AttemptSummary> history(@PathVariable String id, Authentication authentication) {
        return practice.history(currentUser(authentication), id);
    }

    @GetMapping("/tasks/{id}/detail")
    public TaskDetail detail(@PathVariable String id) {
        return practice.taskDetail(id);
    }

    @GetMapping("/tasks/{id}/reference")
    public JsonNode reference(@PathVariable String id, Authentication authentication) {
        return practice.reference(currentUser(authentication), id);
    }

    /** Эталон закрыт — 403 с кодом, а не 404: задача существует, прав нет. */
    @ExceptionHandler(ReferenceLockedException.class)
    public ResponseEntity<Map<String, String>> referenceLocked(ReferenceLockedException error) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(Map.of("error", "reference_locked"));
    }

    private static UUID currentUser(Authentication authentication) {
        if (authentication == null || !(authentication.getPrincipal() instanceof UUID userId)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        }
        return userId;
    }

    private static JsonNode emptyTabs() {
        return JsonNodeFactory.instance.arrayNode();
    }
}
