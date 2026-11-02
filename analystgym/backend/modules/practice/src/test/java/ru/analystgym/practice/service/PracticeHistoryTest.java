package ru.analystgym.practice.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import ru.analystgym.catalog.domain.Task;
import ru.analystgym.catalog.repo.LevelRepository;
import ru.analystgym.catalog.repo.TaskRepository;
import ru.analystgym.practice.domain.Attempt;
import ru.analystgym.practice.domain.Review;
import ru.analystgym.practice.repo.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

/** История и кабинет скрывают искусственные демо-баллы, сохраняя реальные оценки. */
class PracticeHistoryTest {
    @ParameterizedTest
    @ValueSource(strings = {"mock-agents/v1", "mock-agents/v2", "llm-demo/v2", "llm:provider/model", "human-correction/v1"})
    void историяРазличаетЗаглушкуИПроверку(String engine) {
        // Даны сохранённая попытка и балл старого контракта: его нельзя показывать как оценку демо.
        var userId = UUID.randomUUID();
        var attempt = new Attempt();
        attempt.setId(UUID.randomUUID()); attempt.setUserId(userId);
        attempt.setTaskId("task"); attempt.setStatus("reviewed");
        var json = new ObjectMapper();
        var review = new Review();
        review.setEngine(engine); review.setScore(45); review.setGradeCode(2);
        review.setResult(json.createObjectNode().set("grade", json.createObjectNode().put("label", "Оценка")));
        var task = new Task(); task.setId("task"); task.setTitle("Задача"); task.setStatus("published");
        var tasks = mock(TaskRepository.class);
        when(tasks.findById("task")).thenReturn(Optional.of(task));
        var attempts = mock(AttemptRepository.class);
        when(attempts.findAll()).thenReturn(List.of(attempt));
        when(attempts.findByUserIdAndTaskIdOrderByCreatedAtDesc(userId, "task")).thenReturn(List.of(attempt));
        var reviews = mock(ReviewRepository.class);
        when(reviews.findById(attempt.getId())).thenReturn(Optional.of(review));
        var service = new PracticeService(tasks, mock(LevelRepository.class), mock(DraftRepository.class),
                attempts, reviews, mock(ReviewJobRepository.class), json,
                mock(ru.analystgym.billing.service.BillingService.class), 2,
                mock(ru.analystgym.identity.repo.UserRepository.class), mock(ru.analystgym.review.ReviewPipeline.class), "mock");

        // Когда читаем оба списка, демо остаётся сохранённой попыткой без оценки.
        var history = service.history(userId, "task").getFirst();
        var feed = service.myAttempts(userId, 20).getFirst();
        boolean demo = engine.startsWith("mock") || engine.startsWith("llm-demo");
        assertThat(history.score()).isEqualTo(demo ? null : 45);
        assertThat(feed.score()).isEqualTo(demo ? null : 45);
        assertThat(history.gradeCode()).isEqualTo(demo ? null : 2);
        assertThat(history.gradeLabel()).isEqualTo(demo ? "Решение сохранено · без оценки" : "Оценка");
        assertThat(feed.gradeLabel()).isEqualTo(history.gradeLabel());
    }
}
