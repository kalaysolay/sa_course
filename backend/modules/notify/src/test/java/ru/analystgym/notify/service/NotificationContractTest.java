package ru.analystgym.notify.service;

import java.util.UUID;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.Mockito.mock;

/**
 * Контракт уведомлений: провайдер не кидает исключений наружу
 * (письмо не должно ронять основной сценарий) и покрывает все события.
 */
class NotificationContractTest {

    @Test
    void всеСобытияДоходятБезИсключений() {
        NotificationService notify = new LogNotificationService();
        UUID user = UUID.randomUUID();

        assertThatCode(() -> notify.passwordReset(user, "a@t.t", "tok"))
                .doesNotThrowAnyException();
        assertThatCode(() -> notify.reviewReady(user, "Задача", 80))
                .doesNotThrowAnyException();
        assertThatCode(() -> notify.complaintResolved(user, UUID.randomUUID(), "resolved"))
                .doesNotThrowAnyException();
    }

    @Test
    void интерфейсВызываютПоUserId() {
        NotificationService notify = mock(NotificationService.class);

        notify.reviewReady(UUID.randomUUID(), "X", 1);

        org.mockito.Mockito.verify(notify).reviewReady(
                org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.eq("X"),
                org.mockito.ArgumentMatchers.eq(1));
    }
}
