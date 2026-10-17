package ru.analystgym.notify.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** SMTP вне транзакции. Неопределённый исход может дать повтор письма, но не повтор исправления оценки. */
@Component
@ConditionalOnProperty(name="app.mail.enabled",havingValue="true")
public class NotificationDelivery {
    private final NotificationOutbox outbox;
    private final JavaMailSender mail;
    private final String from;
    private final java.util.concurrent.ExecutorService executor=java.util.concurrent.Executors.newSingleThreadExecutor();
    private final java.util.concurrent.atomic.AtomicBoolean running=new java.util.concurrent.atomic.AtomicBoolean();
    public NotificationDelivery(NotificationOutbox outbox,JavaMailSender mail,@Value("${app.mail.from:}") String from) {
        this.outbox=outbox;this.mail=mail;this.from=from;
    }
    @Scheduled(fixedDelayString="${notifications.poll-ms:1000}")
    public void pump() {
        if(!running.compareAndSet(false,true)) return;
        executor.execute(()->{try{sendNext();}finally{running.set(false);}});
    }

    /** Транспорт не занимает поток планировщика, который продлевает lease проверок. */
    public void sendNext() {
        var next=outbox.claim();if(next.isEmpty()) return;var m=next.get();
        try {
            if(from.isBlank()) throw new IllegalStateException("Не задан адрес отправителя");
            var message=new SimpleMailMessage();message.setFrom(from);message.setTo(m.email());
            message.setSubject(m.subject());message.setText(m.body());mail.send(message);outbox.delivered(m);
        } catch(RuntimeException failure) { outbox.failed(m); }
    }
    @jakarta.annotation.PreDestroy
    public void close(){executor.shutdownNow();}
}
