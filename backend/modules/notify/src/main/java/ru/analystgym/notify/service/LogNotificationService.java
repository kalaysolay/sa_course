package ru.analystgym.notify.service;

import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Лог-провайдер: «письмо» уходит в structured-лог (видно в journald/файле),
 * токены сброса — только здесь (в ответах API их нет и не будет).
 */
@Service
public class LogNotificationService implements NotificationService {

    private static final Logger log = LoggerFactory.getLogger(LogNotificationService.class);

    @Override
    public void passwordReset(UUID userId, String email, String token) {
        log.warn("MAIL password-reset to={} user={} token={}", email, userId, token);
    }

    @Override
    public void reviewReady(UUID userId, String taskTitle, int score) {
        log.info("MAIL review-ready to-user={} task={} score={}", userId, taskTitle, score);
    }

    @Override
    public void complaintResolved(UUID userId, UUID complaintId, String status) {
        log.info("MAIL complaint-resolved to-user={} complaint={} status={}",
                userId, complaintId, status);
    }
}
