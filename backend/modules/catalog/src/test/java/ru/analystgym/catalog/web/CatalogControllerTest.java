package ru.analystgym.catalog.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;
import ru.analystgym.catalog.domain.Task;
import ru.analystgym.catalog.domain.TaskCollection;
import ru.analystgym.catalog.repo.LevelRepository;
import ru.analystgym.catalog.repo.TagRepository;
import ru.analystgym.catalog.repo.TaskCollectionRepository;
import ru.analystgym.catalog.repo.TaskRepository;

/**
 * Контракт витрины без БД: пустые фильтры не ломают запрос,
 * черновики наружу не торчат, битые id дают 404.
 */
@ExtendWith(MockitoExtension.class)
class CatalogControllerTest {

    @Mock
    TaskRepository tasks;

    @Mock
    TaskCollectionRepository collections;

    @Mock
    LevelRepository levels;

    @Mock
    TagRepository tags;

    @InjectMocks
    CatalogController controller;

    @Test
    void пустыеФильтрыПревращаютсяВNull() {
        when(tasks.search(null, null, "published", null)).thenReturn(List.of());

        List<TaskCard> result = controller.tasks("", null, "  ");

        assertThat(result).isEmpty();
    }

    @Test
    void черновикПоПрямойСсылкеНеОтдаётся() {
        Task draft = task("draft-1", "draft");
        when(tasks.findById("draft-1")).thenReturn(Optional.of(draft));

        assertThatThrownBy(() -> controller.task("draft-1"))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void выключеннаяПодборкаДаёт404() {
        TaskCollection hidden = new TaskCollection();
        hidden.setId("hidden");
        hidden.setActive(false);
        when(collections.findById("hidden")).thenReturn(Optional.of(hidden));

        assertThatThrownBy(() -> controller.collection("hidden"))
                .isInstanceOf(ResponseStatusException.class);
    }

    private static Task task(String id, String status) {
        Task task = new Task();
        task.setId(id);
        task.setTitle("Заголовок");
        task.setLevelId("easy");
        task.setTags(new String[]{"sql"});
        task.setStatus(status);
        return task;
    }
}
