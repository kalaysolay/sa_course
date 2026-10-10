package ru.analystgym.admin.service;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import ru.analystgym.admin.web.AdminDto.CollectionDto;
import ru.analystgym.admin.web.AdminDto.LevelDto;
import ru.analystgym.admin.web.AdminDto.TagDto;
import ru.analystgym.catalog.domain.Level;
import ru.analystgym.catalog.domain.Tag;
import ru.analystgym.catalog.domain.Task;
import ru.analystgym.catalog.domain.TaskCollection;
import ru.analystgym.catalog.repo.LevelRepository;
import ru.analystgym.catalog.repo.TagRepository;
import ru.analystgym.catalog.repo.TaskCollectionRepository;
import ru.analystgym.catalog.repo.TaskRepository;

/**
 * Подборки и справочники (UC-M06–M07): CRUD подборок, метки со скрытием
 * вместо удаления занятых, уровни — только переименование/описание.
 */
@Service
public class ReferenceAdminService {

    private final TaskCollectionRepository collections;
    private final TagRepository tags;
    private final LevelRepository levels;
    private final TaskRepository tasks;
    private final AdminAudit audit;

    public ReferenceAdminService(
            TaskCollectionRepository collections,
            TagRepository tags,
            LevelRepository levels,
            TaskRepository tasks,
            AdminAudit audit) {
        this.collections = collections;
        this.tags = tags;
        this.levels = levels;
        this.tasks = tasks;
        this.audit = audit;
    }

    /* ---------- подборки ---------- */

    @Transactional(readOnly = true)
    public List<CollectionDto> listCollections() {
        List<CollectionDto> result = new ArrayList<>();
        for (TaskCollection collection : collections.findAll()) {
            result.add(new CollectionDto(collection.getId(), collection.getTitle(),
                    collection.getTagline(), collection.getDescription(), collection.getIcon(),
                    collection.getAudience(),
                    collection.getTaskIds() == null ? List.of() : List.of(collection.getTaskIds()),
                    collection.isActive()));
        }
        return result;
    }

    @Transactional
    public CollectionDto saveCollection(UUID authorId, CollectionDto body) {
        if (body == null || body.title() == null || body.title().trim().length() < 3
                || body.title().trim().length() > 120) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "bad title");
        }
        List<String> taskIds = body.taskIds() == null ? List.of() : body.taskIds();
        for (String taskId : taskIds) {
            if (!tasks.existsById(taskId)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "unknown task");
            }
        }
        TaskCollection collection;
        boolean created;
        if (body.id() == null || body.id().isBlank()) {
            String base = Slug.slugify(body.title());
            if (base.isEmpty()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "bad title");
            }
            String id = base;
            int n = 2;
            while (collections.existsById(id)) {
                id = base + "-" + n;
                n++;
            }
            collection = new TaskCollection();
            collection.setId(id);
            created = true;
        } else {
            collection = collections.findById(body.id())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
            created = false;
        }
        collection.setTitle(body.title().trim());
        collection.setTagline(str(body.tagline(), 500));
        collection.setDescription(str(body.description(), 5000));
        collection.setIcon(str(body.icon(), 100));
        collection.setAudience(str(body.audience(), 500));
        collection.setTaskIds(taskIds.toArray(new String[0]));
        collection.setActive(body.active() == null || body.active());
        collections.save(collection);
        audit.log(authorId, created ? "collection.create" : "collection.update",
                "collection:" + collection.getId());
        return new CollectionDto(collection.getId(), collection.getTitle(),
                collection.getTagline(), collection.getDescription(), collection.getIcon(),
                collection.getAudience(), List.of(collection.getTaskIds()), collection.isActive());
    }

    @Transactional
    public void deleteCollection(UUID authorId, String id) {
        TaskCollection collection = collections.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        collections.delete(collection);
        audit.log(authorId, "collection.delete", "collection:" + id);
    }

    /* ---------- метки ---------- */

    @Transactional(readOnly = true)
    public List<TagDto> listTags() {
        List<TagDto> result = new ArrayList<>();
        for (Tag tag : tags.findAll()) {
            result.add(new TagDto(tag.getId(), tag.getName(), tag.getCategory(),
                    tag.getSynonyms() == null ? List.of() : List.of(tag.getSynonyms()),
                    tag.isActive()));
        }
        return result;
    }

    @Transactional
    public TagDto saveTag(UUID authorId, TagDto body) {
        if (body == null || body.name() == null || body.name().trim().length() < 2
                || body.name().trim().length() > 100) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "bad name");
        }
        Tag tag;
        boolean created;
        if (body.id() == null || body.id().isBlank()) {
            String id = Slug.slugify(body.name());
            if (!Slug.isValidId(id)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "bad name");
            }
            if (tags.existsById(id)) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "tag exists");
            }
            tag = new Tag();
            tag.setId(id);
            created = true;
        } else {
            tag = tags.findById(body.id())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
            created = false;
        }
        tag.setName(body.name().trim());
        tag.setCategory(body.category() == null ? "" : body.category().trim());
        List<String> synonyms = body.synonyms() == null ? List.of() : body.synonyms().stream()
                .filter(s -> s != null && !s.isBlank()).map(String::trim).toList();
        tag.setSynonyms(synonyms.toArray(new String[0]));
        tag.setActive(body.active() == null || body.active());
        tags.save(tag);
        audit.log(authorId, created ? "tag.create" : "tag.update", "tag:" + tag.getId());
        return new TagDto(tag.getId(), tag.getName(), tag.getCategory(),
                List.of(tag.getSynonyms()), tag.isActive());
    }

    /**
     * Удаление — только неиспользуемой метки. Занятую скрываем (active=false):
     * молча рвать фильтры и рубрики чужих задач нельзя.
     */
    @Transactional
    public void deleteTag(UUID authorId, String id) {
        Tag tag = tags.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        for (Task task : tasks.findAll()) {
            if (task.getTags() != null && List.of(task.getTags()).contains(id)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "tag in use, hide instead");
            }
        }
        tags.delete(tag);
        audit.log(authorId, "tag.delete", "tag:" + id);
    }

    /* ---------- уровни ---------- */

    @Transactional(readOnly = true)
    public List<Level> listLevels() {
        return levels.findAll();
    }

    /** Уровни нельзя удалять и выключать — только тексты (правило UC-M07). */
    @Transactional
    public Level updateLevel(UUID authorId, String id, LevelDto body) {
        Level level = levels.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (body == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "empty body");
        }
        if (body.name() != null) {
            if (body.name().trim().length() < 2 || body.name().trim().length() > 100) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "bad name");
            }
            level.setName(body.name().trim());
        }
        if (body.description() != null) {
            level.setDescription(str(body.description(), 2000));
        }
        if (body.profile() != null) {
            level.setProfile(str(body.profile(), 2000));
        }
        if (body.timeHint() != null) {
            level.setTimeHint(str(body.timeHint(), 500));
        }
        levels.save(level);
        audit.log(authorId, "level.update", "level:" + id);
        return level;
    }

    private static String str(String value, int max) {
        if (value == null) {
            return "";
        }
        String clean = value.trim();
        if (clean.length() > max) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "field too long");
        }
        return clean;
    }
}
