package ru.analystgym.admin.service;

import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import ru.analystgym.admin.domain.AuditEvent;
import ru.analystgym.admin.repo.AuditRepository;

/**
 * Журнал действий: пишем в своей транзакции, чтобы запись уцелела,
 * даже если вызывающая операция позже упадёт (аудит важнее удобства).
 */
@Component
public class AdminAudit {

    private final AuditRepository audit;

    public AdminAudit(AuditRepository audit) {
        this.audit = audit;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void log(UUID userId, String action, String target) {
        AuditEvent event = new AuditEvent();
        event.setId(UUID.randomUUID());
        event.setUserId(userId);
        event.setAction(action);
        event.setTarget(target == null ? "" : target);
        audit.save(event);
    }
}
