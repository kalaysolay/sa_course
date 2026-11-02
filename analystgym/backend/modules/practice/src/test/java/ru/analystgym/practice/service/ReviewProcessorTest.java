package ru.analystgym.practice.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import ru.analystgym.identity.repo.UserRepository;
import ru.analystgym.notify.service.NotificationOutbox;
import ru.analystgym.practice.domain.Attempt;
import ru.analystgym.practice.domain.ReviewJob;
import ru.analystgym.practice.repo.*;
import ru.analystgym.review.ReviewResult;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

/** Заглушка завершает очередь и сохраняет попытку без ложного уведомления о готовом разборе. */
class ReviewProcessorTest {
    @ParameterizedTest
    @ValueSource(strings = {"mock-agents/v2", "llm-demo/v2"})
    void демоЗавершаетЗадачуБезУведомленияСОценкой(String engine) {
        // Дано задание с действующим захватом воркера и результат заглушки.
        var token = UUID.randomUUID();
        var job = new ReviewJob(); job.setId(UUID.randomUUID()); job.setStatus("grading");
        job.setLeaseToken(token); job.setLeaseUntil(Instant.now().plusSeconds(60));
        var attempt = new Attempt(); attempt.setId(UUID.randomUUID()); attempt.setStatus("in_review");
        var jobs = mock(ReviewJobRepository.class);
        when(jobs.lockById(job.getId())).thenReturn(Optional.of(job));
        var attempts = mock(AttemptRepository.class);
        when(attempts.lockById(attempt.getId())).thenReturn(Optional.of(attempt));
        var reviews = mock(ReviewRepository.class);
        var revisions = mock(ReviewRevisions.class);
        var outbox = mock(NotificationOutbox.class);
        var users = mock(UserRepository.class);
        var processor = new ReviewProcessor(jobs, attempts, reviews, mock(ReviewCallRepository.class),
                new ObjectMapper(), revisions, outbox, users, 30, 3, 2);
        var claim = new ReviewProcessor.Claim(job.getId(), attempt.getId(), token, null, List.of());
        var result = new ReviewResult("review", "task", Instant.now().toString(), engine,
                new ReviewResult.Grade(2, "Демо", "Демо", "info", 45), "", List.of(), List.of(),
                List.of(), null, null, List.of());

        // Когда результат фиксируется, задача освобождает захват и не остаётся в повторной обработке.
        assertThat(processor.finish(claim, result, Map.of())).isEmpty();
        assertThat(job.getStatus()).isEqualTo("done");
        assertThat(job.getStage()).isEqualTo("done");
        assertThat(job.getProgress()).isEqualTo(100);
        assertThat(job.getLeaseToken()).isNull();
        assertThat(job.getLeaseUntil()).isNull();
        assertThat(attempt.getStatus()).isEqualTo("reviewed");
        verify(reviews).saveAndFlush(any());
        verify(revisions).record(any(), isNull(), isNull());
        verifyNoInteractions(outbox, users);
    }
}
