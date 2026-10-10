package ru.analystgym.admin.service;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import com.fasterxml.jackson.databind.ObjectMapper;
import ru.analystgym.admin.web.AdminDto.QuestionDto;
import ru.analystgym.assessment.domain.Question;
import ru.analystgym.assessment.repo.QuestionRepository;

/**
 * Банк вопросов методиста (минимальный CRUD: в админке макета вопросов
 * нет, поэтому API проектируем с нуля). Удаления нет — вместо него
 * active=false: старые замеры ссылаются на вопросы истории.
 */
@Service
public class QuestionAdminService {

    private static final List<String> COMPETENCIES = List.of(
            "requirements", "integrations", "data", "architecture",
            "modeling", "process", "quality");

    private final QuestionRepository questions;
    private final ObjectMapper mapper;
    private final AdminAudit audit;

    public QuestionAdminService(QuestionRepository questions, ObjectMapper mapper, AdminAudit audit) {
        this.questions = questions;
        this.mapper = mapper;
        this.audit = audit;
    }

    @Transactional(readOnly = true)
    public List<QuestionDto> listAll() {
        List<QuestionDto> result = new ArrayList<>();
        for (Question question : questions.findAll()) {
            result.add(dtoOf(question));
        }
        result.sort((a, b) -> a.id().compareTo(b.id()));
        return result;
    }

    @Transactional
    public QuestionDto create(UUID authorId, QuestionDto body) {
        validate(body, true);
        if (questions.existsById(body.id())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "question exists");
        }
        Question question = new Question();
        question.setId(body.id().trim());
        apply(question, body);
        questions.save(question);
        audit.log(authorId, "question.create", "question:" + question.getId());
        return dtoOf(question);
    }

    @Transactional
    public QuestionDto update(UUID authorId, String id, QuestionDto body) {
        Question question = questions.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        validate(body, false);
        apply(question, body);
        questions.save(question);
        audit.log(authorId, "question.update", "question:" + id);
        return dtoOf(question);
    }

    private void apply(Question question, QuestionDto body) {
        question.setCompetency(body.competency());
        question.setDifficulty(body.difficulty());
        question.setQuestion(body.question().trim());
        question.setOptions(mapper.valueToTree(body.options()));
        question.setAnswer(body.answer());
        question.setExplain(body.explain() == null ? "" : body.explain().trim());
        question.setActive(body.active() == null || body.active());
    }

    static void validate(QuestionDto body, boolean withId) {
        if (body == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "empty body");
        }
        if (withId && (body.id() == null || !body.id().matches("q-[a-z]+-[0-9]+"))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "bad id");
        }
        if (!COMPETENCIES.contains(body.competency())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "bad competency");
        }
        if (body.difficulty() == null || body.difficulty() < 1 || body.difficulty() > 3) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "bad difficulty");
        }
        if (body.question() == null || body.question().trim().length() < 10
                || body.question().trim().length() > 5000) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "bad question");
        }
        if (body.options() == null || body.options().size() < 2 || body.options().size() > 6
                || body.options().stream().anyMatch(o -> o == null || o.isBlank())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "bad options");
        }
        if (body.answer() == null || body.answer() < 0 || body.answer() >= body.options().size()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "bad answer");
        }
        if (body.explain() != null && body.explain().length() > 5000) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "bad explain");
        }
    }

    private static QuestionDto dtoOf(Question question) {
        List<String> options = new ArrayList<>();
        if (question.getOptions() != null && question.getOptions().isArray()) {
            for (var option : question.getOptions()) {
                options.add(option.asText(""));
            }
        }
        return new QuestionDto(question.getId(), question.getCompetency(),
                question.getDifficulty(), question.getQuestion(), options,
                question.getAnswer(), question.getExplain(), question.isActive());
    }
}
