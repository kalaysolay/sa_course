package ru.analystgym.catalog.web;

import java.util.Arrays;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import ru.analystgym.catalog.domain.Tag;
import ru.analystgym.catalog.domain.Task;
import ru.analystgym.catalog.domain.TaskCollection;
import ru.analystgym.catalog.repo.LevelRepository;
import ru.analystgym.catalog.repo.TagRepository;
import ru.analystgym.catalog.repo.TaskCollectionRepository;
import ru.analystgym.catalog.repo.TaskRepository;
import ru.analystgym.catalog.web.DictionariesResponse.LevelDto;
import ru.analystgym.catalog.web.DictionariesResponse.TagDto;

/**
 * Чтение каталога: задачи, подборки, словари. Запись — только из админки (Фаза 3).
 * Пустые строки фильтров считаем отсутствием фильтра: фронт шлёт level= при сбросе.
 * Черновики (status != published) витрина не отдаёт — их видит только админка.
 */
@RestController
@RequestMapping("/api")
public class CatalogController {

    private final TaskRepository tasks;
    private final TaskCollectionRepository collections;
    private final LevelRepository levels;
    private final TagRepository tags;

    public CatalogController(
            TaskRepository tasks,
            TaskCollectionRepository collections,
            LevelRepository levels,
            TagRepository tags) {
        this.tasks = tasks;
        this.collections = collections;
        this.levels = levels;
        this.tags = tags;
    }

    @GetMapping("/tasks")
    public List<TaskCard> tasks(
            @RequestParam(required = false) String level,
            @RequestParam(required = false) String tag,
            @RequestParam(required = false, name = "q") String query) {
        // Витрина показывает только опубликованное; поиск по подстроке в названии.
        return tasks.search(blankToNull(level), blankToNull(tag), "published", blankToNull(query)).stream()
                .map(CatalogController::toCard)
                .toList();
    }

    @GetMapping("/tasks/{id}")
    public TaskCard task(@PathVariable String id) {
        Task task = tasks.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!"published".equals(task.getStatus())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        return toCard(task);
    }

    @GetMapping("/collections")
    public List<CollectionCard> collections() {
        return collections.findByActiveTrue().stream()
                .map(CatalogController::toCard)
                .toList();
    }

    @GetMapping("/collections/{id}")
    public CollectionCard collection(@PathVariable String id) {
        TaskCollection collection = collections.findById(id)
                .filter(TaskCollection::isActive)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        return toCard(collection);
    }

    @GetMapping("/dictionaries")
    public DictionariesResponse dictionaries() {
        List<LevelDto> levelDtos = levels.findAll().stream()
                .filter(l -> l.isActive())
                .map(l -> new LevelDto(l.getId(), l.getName(), l.getCssClass(),
                        l.getProfile(), l.getTimeHint(), l.getDescription()))
                .toList();
        List<TagDto> tagDtos = tags.findAll().stream()
                .filter(Tag::isActive)
                .map(t -> new TagDto(t.getId(), t.getName(), t.getCategory(),
                        t.getSynonyms() == null ? List.of() : Arrays.asList(t.getSynonyms())))
                .toList();
        return new DictionariesResponse(levelDtos, tagDtos);
    }

    private static TaskCard toCard(Task task) {
        return new TaskCard(
                task.getId(),
                task.getTitle(),
                task.getLevelId(),
                task.getTags() == null ? List.of() : Arrays.asList(task.getTags()),
                task.getTimeMin(),
                task.getSolvedRate());
    }

    private static CollectionCard toCard(TaskCollection collection) {
        return new CollectionCard(
                collection.getId(),
                collection.getTitle(),
                collection.getTagline(),
                collection.getDescription(),
                collection.getIcon(),
                collection.getAudience(),
                collection.getTaskIds() == null ? List.of() : Arrays.asList(collection.getTaskIds()));
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }
}
