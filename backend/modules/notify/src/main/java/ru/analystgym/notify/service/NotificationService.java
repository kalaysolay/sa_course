package ru.analystgym.notify.service;

import java.util.UUID;

/**
 * Уведомления (сброс пароля, «ревью готово», итог жалобы, реактивация).
 * Реализация — позже (SMTP/Resend за этим же интерфейсом), сейчас —
 * лог-провайдер: контракт и точки вызова фиксируем, письма не теряем
 * даже без почты (видно в логах, уйдёт с провайдером).
 */
public interface NotificationService {

    void passwordReset(UUID userId, String email, String token);

    void reviewReady(UUID userId, String taskTitle, int score);

    void complaintResolved(UUID userId, UUID complaintId, String status);
}
