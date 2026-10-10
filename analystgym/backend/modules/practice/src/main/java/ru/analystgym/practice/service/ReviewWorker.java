package ru.analystgym.practice.service;

import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import ru.analystgym.notify.service.NotificationService;

/**
 * Воркер очереди ревью: раз в 500 мс забирает одну queued-задачу и ведёт
 * её по стадиям system -> sa -> arch -> grading -> done.
 * Паузы между стадиями — осознанно: mock считается мгновенно, а polling
 * фронта должен успеть показать живой прогресс (как стадии в task.js).
 */
@Component
public class ReviewWorker {

    private static final Logger log = LoggerFactory.getLogger(ReviewWorker.class);

    private final ReviewProcessor processor;
    private final NotificationService notify;

    public ReviewWorker(ReviewProcessor processor, NotificationService notify) {
        this.processor = processor;
        this.notify = notify;
    }

    @Scheduled(fixedDelay = 500)
    public void pump() {
        Optional<UUID> claimed;
        try {
            claimed = processor.claim();
        } catch (Exception error) {
            log.warn("claim review job failed", error);
            return;
        }
        if (claimed.isEmpty()) {
            return;
        }
        UUID jobId = claimed.get();
        try {
            sleep(400);
            processor.markStage(jobId, "sa_running", "sa", 30);
            sleep(400);
            processor.markStage(jobId, "arch_running", "arch", 65);
            processor.markStage(jobId, "grading", "grading", 80);
            processor.finish(jobId);
            // Письмо «ревью готово» — после коммита, вне транзакции.
            processor.doneInfo(jobId).ifPresent(done ->
                    notify.reviewReady(done.userId(), done.taskTitle(), done.score()));
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            processor.fail(jobId, "worker interrupted");
        } catch (Exception error) {
            log.warn("review job {} failed", jobId, error);
            try {
                processor.fail(jobId, messageOf(error));
            } catch (Exception nested) {
                log.warn("marking job {} failed failed", jobId, nested);
            }
        }
    }

    private static void sleep(long millis) throws InterruptedException {
        Thread.sleep(millis);
    }

    private static String messageOf(Exception error) {
        String message = error.getMessage();
        return message == null || message.isBlank() ? error.toString() : message;
    }
}
