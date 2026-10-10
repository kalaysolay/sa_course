package ru.analystgym.notify.service;

import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

/**
 * SMTP-провайдер: включается флагом app.mail.enabled=true (+ MAIL_* в env).
 * Письма только транзакционные, plain-text без трекеров. Отправка не должна
 * ронять основной сценарий: любая ошибка уходит в лог, исключение наружу
 * не летит (см. контракт NotificationContractTest).
 */
@Service
@ConditionalOnProperty(name = "app.mail.enabled", havingValue = "true")
// При включённой почте побеждает этот бин (лог-провайдер остаётся запасным).
@org.springframework.context.annotation.Primary
public class SmtpNotificationService implements NotificationService {

    private static final Logger log = LoggerFactory.getLogger(SmtpNotificationService.class);

    private final JavaMailSender mail;
    private final String from;
    private final String siteBaseUrl;
    private final String resetPath;

    public SmtpNotificationService(
            JavaMailSender mail,
            @Value("${app.mail.from:}") String from,
            @Value("${app.site.base-url:http://localhost:8080}") String siteBaseUrl,
            @Value("${app.mail.reset-path:/login.html?mode=reset&token=}") String resetPath) {
        this.mail = mail;
        this.from = from;
        this.siteBaseUrl = siteBaseUrl;
        this.resetPath = resetPath;
    }

    @Override
    public void passwordReset(UUID userId, String email, String token) {
        // Токен живёт час (см. AuthService.requestReset); ссылка ведёт на
        // форму сброса в login.html (?mode=reset), токен — только в query.
        String link = base() + resetPath + token;
        send(email,
                "AnalystGym: сброс пароля",
                "Ссылка для сброса пароля (действует 1 час):\n" + link
                        + "\n\nЕсли это были не вы — просто проигнорируйте письмо.");
    }

    @Override
    public void reviewReady(UUID userId, String taskTitle, int score) {
        // Email пользователя здесь нет (вызывающие передают userId) —
        // рассылку «ревью готово» включим, когда появится профиль с email
        // в notify-контексте. Пока — лог, как раньше.
        log.info("MAIL review-ready to-user={} task={} score={}", userId, taskTitle, score);
    }

    @Override
    public void complaintResolved(UUID userId, UUID complaintId, String status) {
        log.info("MAIL complaint-resolved to-user={} complaint={} status={}",
                userId, complaintId, status);
    }

    private void send(String to, String subject, String text) {
        if (from.isBlank()) {
            log.warn("MAIL skipped (no APP_MAIL_FROM): to={} subject={}", to, subject);
            return;
        }
        try {
            SimpleMailMessage message = new SimpleMailMessage();
            message.setFrom(from);
            message.setTo(to);
            message.setSubject(subject);
            message.setText(text);
            mail.send(message);
            log.info("MAIL sent to={} subject={}", to, subject);
        } catch (RuntimeException e) {
            // Почта легла — сценарий (регистрация/сброс) продолжает работать.
            log.warn("MAIL failed to={} subject={}: {}", to, subject, e.toString());
        }
    }

    private String base() {
        String base = siteBaseUrl == null ? "" : siteBaseUrl.trim();
        return base.endsWith("/") ? base.substring(0, base.length() - 1) : base;
    }
}
