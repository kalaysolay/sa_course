package ru.analystgym.quality.web;

import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import ru.analystgym.identity.domain.User;
import ru.analystgym.identity.repo.UserRepository;
import ru.analystgym.identity.security.Roles;
import ru.analystgym.quality.service.QualityService;
import ru.analystgym.quality.web.QualityDto.AttemptDetail;
import ru.analystgym.quality.web.QualityDto.AttemptRow;
import ru.analystgym.quality.web.QualityDto.ComplaintView;
import ru.analystgym.quality.web.QualityDto.Dashboard;
import ru.analystgym.quality.web.QualityDto.FileComplaintRequest;
import ru.analystgym.quality.web.QualityDto.ResolveRequest;
import ru.analystgym.quality.web.QualityDto.StudentCard;
import ru.analystgym.quality.web.QualityDto.StudentRow;

/**
 * Жалобы студентов + разборы методиста (UC-S08, UC-Q01–Q04).
 * Роль сверяем по БД при каждом вызове (отзыв прав — до протухания JWT).
 * Персонал: REVIEWER, METHODIST, SUPERADMIN.
 */
@RestController
public class QualityController {

    private final QualityService quality;
    private final UserRepository users;

    public QualityController(QualityService quality, UserRepository users) {
        this.quality = quality;
        this.users = users;
    }

    /** Оспорить ревью: жалоба уходит в очередь со статусом «Новая». */
    @PostMapping("/api/complaints")
    public ResponseEntity<ComplaintView> file(
            @RequestBody FileComplaintRequest body, Authentication authentication) {
        UUID userId = currentUser(authentication);
        if (body == null || body.attemptId() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "attemptId required");
        }
        var saved = quality.fileComplaint(userId, body.attemptId(), body.reason());
        var view = quality.myComplaints(userId).stream()
                .filter(c -> c.id().equals(saved.getId())).findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT));
        return ResponseEntity.status(HttpStatus.CREATED).body(view);
    }

    @GetMapping("/api/complaints/mine")
    public List<ComplaintView> mine(Authentication authentication) {
        return quality.myComplaints(currentUser(authentication));
    }

    @GetMapping("/api/admin/complaints")
    public List<ComplaintView> queue(
            @RequestParam(required = false) String status, Authentication authentication) {
        staff(authentication);
        return quality.complaintQueue(status);
    }

    @PatchMapping("/api/admin/complaints/{id}")
    public ComplaintView resolve(
            @PathVariable UUID id, @RequestBody ResolveRequest body, Authentication authentication) {
        staff(authentication);
        if (body == null || body.status() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "status required");
        }
        var saved = quality.resolve(id, body.status(), body.resolution());
        return quality.complaintQueue("all").stream()
                .filter(c -> c.id().equals(saved.getId())).findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT));
    }

    @GetMapping("/api/admin/quality/dashboard")
    public Dashboard dashboard(Authentication authentication) {
        staff(authentication);
        return quality.dashboard();
    }

    @GetMapping("/api/admin/attempts")
    public List<AttemptRow> attempts(
            @RequestParam(required = false) String taskId,
            @RequestParam(required = false, defaultValue = "100") int limit,
            Authentication authentication) {
        staff(authentication);
        return quality.attemptRows(taskId, limit);
    }

    @GetMapping("/api/admin/attempts/{id}")
    public AttemptDetail attempt(@PathVariable UUID id, Authentication authentication) {
        staff(authentication);
        return quality.attemptDetail(id);
    }

    @GetMapping("/api/admin/students")
    public List<StudentRow> students(Authentication authentication) {
        staff(authentication);
        return quality.students();
    }

    @GetMapping("/api/admin/students/{id}")
    public StudentCard student(@PathVariable UUID id, Authentication authentication) {
        staff(authentication);
        return quality.studentCard(id);
    }

    private static UUID currentUser(Authentication authentication) {
        if (authentication == null || !(authentication.getPrincipal() instanceof UUID userId)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        }
        return userId;
    }

    /** Персонал контура качества; 403 — чужой, 401 — аноним (цепочка раньше). */
    private User staff(Authentication authentication) {
        UUID userId = currentUser(authentication);
        User user = users.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        Roles.require(user, Roles.REVIEWER, Roles.METHODIST, Roles.SUPERADMIN);
        return user;
    }
}
