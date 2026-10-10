package ru.analystgym.notify.service;

import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.mail.MailSendException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

/**
 * SMTP-провайдер: ссылка сброса собирается из base-url + путь + токен,
 * падение почты глотается (основной сценарий не должен лечь).
 */
class SmtpNotificationServiceTest {

    private static SmtpNotificationService service(JavaMailSender mail) {
        return new SmtpNotificationService(
                mail, "noreply@example.com", "https://site.example/", "/login.html?mode=reset&token=");
    }

    @Test
    void ссылкаСбросаВедётНаФормуСТокеном() {
        JavaMailSender mail = mock(JavaMailSender.class);
        SmtpNotificationService smtp = service(mail);

        smtp.passwordReset(UUID.randomUUID(), "user@t.t", "tok123");

        ArgumentCaptor<SimpleMailMessage> sent = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mail).send(sent.capture());
        SimpleMailMessage message = sent.getValue();
        assertThat(message.getTo()).containsExactly("user@t.t");
        assertThat(message.getSubject()).contains("сброс");
        // Слэш на конце base-url не должен двоиться.
        assertThat(message.getText())
                .contains("https://site.example/login.html?mode=reset&token=tok123");
    }

    @Test
    void падениеПочтыНеРоняетСценарий() {
        JavaMailSender mail = mock(JavaMailSender.class);
        org.mockito.Mockito.doThrow(new MailSendException("smtp down"))
                .when(mail).send(any(SimpleMailMessage.class));

        assertThatCode(() -> service(mail).passwordReset(UUID.randomUUID(), "u@t.t", "tok"))
                .doesNotThrowAnyException();
    }

    @Test
    void безFromПисьмоНеУходитНоИНеПадает() {
        JavaMailSender mail = mock(JavaMailSender.class);
        SmtpNotificationService smtp =
                new SmtpNotificationService(mail, "", "https://site.example", "/r?token=");

        assertThatCode(() -> smtp.passwordReset(UUID.randomUUID(), "u@t.t", "tok"))
                .doesNotThrowAnyException();
        verify(mail, org.mockito.Mockito.never()).send(any(SimpleMailMessage.class));
    }
}
