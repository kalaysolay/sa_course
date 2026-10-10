package ru.analystgym.assessment.web;

import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import ru.analystgym.assessment.domain.AssessmentSubmission;
import ru.analystgym.assessment.service.AssessmentService;
import ru.analystgym.assessment.web.AssessmentDto.PlanResponse;
import ru.analystgym.assessment.web.AssessmentDto.QuestionCard;
import ru.analystgym.assessment.web.AssessmentDto.SubmissionSummary;
import ru.analystgym.assessment.web.AssessmentDto.SubmissionView;
import ru.analystgym.assessment.web.AssessmentDto.SubmitRequest;
import ru.analystgym.assessment.web.AssessmentDto.SubmitResponse;

/**
 * Диагностика (Фаза 3). Вопросы — без ответов (иначе тест сдаётся
 * просмотром кода), приём — целиком, план — по свежему или
 * указанному замеру. Всё — только своим.
 */
@RestController
@RequestMapping("/api/assessment")
public class AssessmentController {

    private final AssessmentService assessment;

    public AssessmentController(AssessmentService assessment) {
        this.assessment = assessment;
    }

    @GetMapping("/questions")
    public List<QuestionCard> questions(Authentication authentication) {
        currentUser(authentication);
        return assessment.questionCards();
    }

    @PostMapping("/submissions")
    public ResponseEntity<SubmitResponse> submit(
            @RequestBody SubmitRequest body, Authentication authentication) {
        UUID userId = currentUser(authentication);
        AssessmentSubmission submission = assessment.submit(
                userId, body == null ? null : body.answers(),
                body == null ? null : body.durationSec());
        var view = assessment.submissionOf(userId, submission.getId());
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(new SubmitResponse(submission.getId(), view.result()));
    }

    @GetMapping("/submissions")
    public List<SubmissionSummary> history(Authentication authentication) {
        return assessment.history(currentUser(authentication));
    }

    @GetMapping("/submissions/{id}")
    public SubmissionView submission(@PathVariable UUID id, Authentication authentication) {
        return assessment.submissionOf(currentUser(authentication), id);
    }

    @GetMapping("/plan")
    public PlanResponse plan(
            @RequestParam(required = false) UUID submissionId, Authentication authentication) {
        return assessment.plan(currentUser(authentication), submissionId);
    }

    private static UUID currentUser(Authentication authentication) {
        if (authentication == null || !(authentication.getPrincipal() instanceof UUID userId)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        }
        return userId;
    }
}
