package ru.analystgym.practice.service;

import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import com.fasterxml.jackson.databind.ObjectMapper;
import ru.analystgym.catalog.domain.Task;
import ru.analystgym.practice.web.PracticeDto.TabDto;
import ru.analystgym.practice.web.QuotaExceededException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Квота Free без БД: Pro идёт мимо квоты, повторная отправка по разобранной
 * задаче разрешена, третья новая задача — 402. Тарифы из practice.html.
 */
class PracticeQuotaTest {

    private PracticeService serviceOf(
            ru.analystgym.catalog.repo.TaskRepository tasks,
            ru.analystgym.practice.repo.AttemptRepository attempts,
            ru.analystgym.billing.service.BillingService billing) {
        return new PracticeService(tasks,
                mock(ru.analystgym.catalog.repo.LevelRepository.class),
                mock(ru.analystgym.practice.repo.DraftRepository.class),
                attempts,
                mock(ru.analystgym.practice.repo.ReviewRepository.class),
                mock(ru.analystgym.practice.repo.ReviewJobRepository.class),
                new ObjectMapper(), billing, 2);
    }

    private static Task published(String id) {
        Task task = new Task();
        task.setId(id);
        task.setTitle("Задача");
        task.setLevelId("easy");
        task.setTags(new String[0]);
        task.setStatus("published");
        task.setTimeMin(30);
        task.setSolvedRate(0);
        return task;
    }

    private static ru.analystgym.billing.service.BillingService freeBilling() {
        var billing = mock(ru.analystgym.billing.service.BillingService.class);
        when(billing.proState(any())).thenAnswer(call ->
                new ru.analystgym.billing.web.BillingDto.ProState(false, null, null, null));
        return billing;
    }

    @Test
    void третьяНоваяЗадачаДаёт402() {
        // given: две разобранные задачи, пользователь без Pro;
        var tasks = mock(ru.analystgym.catalog.repo.TaskRepository.class);
        when(tasks.findById("t3")).thenReturn(Optional.of(published("t3")));
        var attempts = mock(ru.analystgym.practice.repo.AttemptRepository.class);
        when(attempts.reviewedTaskIds(any())).thenReturn(Set.of("t1", "t2"));
        PracticeService service = serviceOf(tasks, attempts, freeBilling());
        List<TabDto> tabs = List.of(new TabDto("x", "doc", "D", "text"));

        // when/then: новая задача сверх квоты — 402.
        assertThatThrownBy(() -> service.submit(UUID.randomUUID(), "t3", tabs, null))
                .isInstanceOf(QuotaExceededException.class);
    }

    @Test
    void доработкаСвоейЗадачиКвотуНеЕст() {
        // given: задача уже разобрана;
        var tasks = mock(ru.analystgym.catalog.repo.TaskRepository.class);
        when(tasks.findById("t1")).thenReturn(Optional.of(published("t1")));
        var attempts = mock(ru.analystgym.practice.repo.AttemptRepository.class);
        when(attempts.reviewedTaskIds(any())).thenReturn(Set.of("t1", "t2"));
        when(attempts.saveAndFlush(any())).thenAnswer(call -> call.getArgument(0));
        PracticeService service = serviceOf(tasks, attempts, freeBilling());
        List<TabDto> tabs = List.of(new TabDto("x", "doc", "D", "text"));

        // when/then: повторная отправка идёт в очередь.
        assertThat(service.submit(UUID.randomUUID(), "t1", tabs, null)).isNotNull();
    }

    @Test
    void проМимоКвоты() {
        // given: Pro-подписка при тех же двух разобранных;
        var tasks = mock(ru.analystgym.catalog.repo.TaskRepository.class);
        when(tasks.findById("t3")).thenReturn(Optional.of(published("t3")));
        var attempts = mock(ru.analystgym.practice.repo.AttemptRepository.class);
        when(attempts.reviewedTaskIds(any())).thenReturn(Set.of("t1", "t2"));
        when(attempts.saveAndFlush(any())).thenAnswer(call -> call.getArgument(0));
        var billing = mock(ru.analystgym.billing.service.BillingService.class);
        when(billing.proState(any())).thenAnswer(call ->
                new ru.analystgym.billing.web.BillingDto.ProState(
                        true, UUID.randomUUID(), null, "pro-monthly"));
        PracticeService service = serviceOf(tasks, attempts, billing);
        List<TabDto> tabs = List.of(new TabDto("x", "doc", "D", "text"));

        // when/then: третья задача уходит без 402.
        assertThat(service.submit(UUID.randomUUID(), "t3", tabs, null)).isNotNull();
    }
}
