package ru.analystgym.notify.service;

import java.util.UUID;

/**
 * Уведомления (сброс пароля, «ревью готово», итог жалобы).
 * Провайдер выбирается флагом: по умолчанию лог-провайдер
 * (LogNotificationService), при app.mail.enabled=true — SMTP
 * (SmtpNotificationService). Контракт: исключение наружу не летит —
 * письмо не должно ронять основной сценарий.
 */
public interface NotificationService {

    void passwordReset(UUID userId, String email, String token);

    void reviewReady(UUID userId, String taskTitle, int score);

    void complaintResolved(UUID userId, UUID complaintId, String status);
}
