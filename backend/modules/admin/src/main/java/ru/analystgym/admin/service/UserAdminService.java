package ru.analystgym.admin.service;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import ru.analystgym.admin.repo.AuditRepository;
import ru.analystgym.admin.web.AdminDto.AuditRow;
import ru.analystgym.admin.web.AdminDto.UserRow;
import ru.analystgym.identity.domain.User;
import ru.analystgym.identity.repo.UserRepository;
import ru.analystgym.identity.security.Roles;

/**
 * Пользователи и журнал (UC-A01): список, смена ролей, чтение аудита.
 * Всё — только для SUPERADMIN. Свою роль менять нельзя (не закрыть
 * себе доступ по невнимательности).
 */
@Service
public class UserAdminService {

    private static final List<String> KNOWN_ROLES = List.of(
            Roles.STUDENT, Roles.METHODIST, Roles.REVIEWER, Roles.LLM_ADMIN, Roles.SUPERADMIN);

    private final UserRepository users;
    private final AuditRepository auditLog;
    private final AdminAudit audit;

    public UserAdminService(UserRepository users, AuditRepository auditLog, AdminAudit audit) {
        this.users = users;
        this.auditLog = auditLog;
        this.audit = audit;
    }

    @Transactional(readOnly = true)
    public List<UserRow> listUsers() {
        List<UserRow> rows = new ArrayList<>();
        for (User user : users.findAll()) {
            rows.add(new UserRow(user.getId(), user.getName(), user.getEmail(), user.getRole(),
                    user.getCreatedAt() == null ? "" : user.getCreatedAt().toString()));
        }
        return rows;
    }

    @Transactional
    public UserRow setRole(UUID callerId, UUID targetId, String role) {
        if (!KNOWN_ROLES.contains(role)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "unknown role");
        }
        if (callerId.equals(targetId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "cannot change own role");
        }
        User user = users.findById(targetId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        user.setRole(role);
        users.save(user);
        audit.log(callerId, "user.role", "user:" + targetId + "=" + role);
        return new UserRow(user.getId(), user.getName(), user.getEmail(), user.getRole(),
                user.getCreatedAt() == null ? "" : user.getCreatedAt().toString());
    }

    @Transactional(readOnly = true)
    public List<AuditRow> audit(int limit) {
        int max = Math.max(1, Math.min(limit <= 0 ? 100 : limit, 500));
        List<AuditRow> rows = new ArrayList<>();
        for (var event : auditLog.findAllByOrderByCreatedAtDesc()) {
            if (rows.size() >= max) {
                break;
            }
            rows.add(new AuditRow(event.getId(), event.getUserId(), event.getAction(),
                    event.getTarget(),
                    event.getCreatedAt() == null ? "" : event.getCreatedAt().toString()));
        }
        return rows;
    }
}
