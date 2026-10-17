package ru.analystgym.practice.service;

import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import ru.analystgym.review.*;
import ru.analystgym.notify.service.NotificationService;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

/** Зависший HTTP не блокирует heartbeat и не расширяет пул обработок. */
class ReviewWorkerTest {
    @Test void параллельностьОграниченаАHeartbeatИОшибкаПисьмаНеЛомаютРевью() throws Exception {
        var processor = mock(ReviewProcessor.class); var pipeline = mock(ReviewPipeline.class);
        var notify = mock(NotificationService.class);
        var plan = new ReviewPlan(1, "llm", null, List.of(), List.of(), List.of(), null);
        var first = new ReviewProcessor.Claim(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), plan, List.of());
        var second = new ReviewProcessor.Claim(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), plan, List.of());
        when(processor.claim()).thenReturn(Optional.of(first), Optional.of(second));
        var started = new CountDownLatch(2); var release = new CountDownLatch(1); var finished = new CountDownLatch(2);
        when(pipeline.review(any(), anyList(), any())).thenAnswer(invocation -> {
            started.countDown();
            if (!release.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("Тест не снял блокировку");
            return new ReviewPipeline.LlmOutcome(null, "", "", Map.of(), 0, 0);
        });
        when(processor.finish(any(), isNull(), anyMap())).thenAnswer(invocation -> {
            finished.countDown(); return Optional.of(new ReviewProcessor.DoneInfo(UUID.randomUUID(), "Задача", 50));
        });
        doThrow(new IllegalStateException("Канал писем недоступен")).when(notify).reviewReady(any(), anyString(), anyInt());
        var worker = new ReviewWorker(processor, pipeline, notify, 2);
        try {
            worker.pump(); worker.pump(); assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();
            worker.pump(); verify(processor, times(2)).claim();
            worker.heartbeat(); verify(processor).renew(first); verify(processor).renew(second);
            release.countDown(); assertThat(finished.await(5, TimeUnit.SECONDS)).isTrue();
        } finally { release.countDown(); worker.close(); }
        verify(processor, never()).fail(any(), anyString(), anyBoolean());
    }
}
