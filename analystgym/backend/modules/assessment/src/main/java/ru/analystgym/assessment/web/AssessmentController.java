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
    private final ru.analystgym.assessment.service.AssessmentRuns runs;

    public AssessmentController(AssessmentService assessment, ru.analystgym.assessment.service.AssessmentRuns runs) {
        this.assessment = assessment;
        this.runs = runs;
    }

    @GetMapping("/questions")
    public List<QuestionCard> questions(Authentication authentication) {
        return assessment.questionCards();
    }

    @PostMapping("/submissions")
    public ResponseEntity<SubmitResponse> submit(
            @RequestBody SubmitRequest body, Authentication authentication) {
        throw new ResponseStatusException(HttpStatus.GONE,"assessment_run_required");
    }

    /** Публичны только точечные операции прохождения с секретом гостя; история требует входа. */
    @PostMapping("/runs")
    public ru.analystgym.assessment.service.AssessmentRuns.View start(@RequestBody AssessmentDto.StartRequest request,
            @org.springframework.web.bind.annotation.RequestHeader(value="X-Assessment-Token",required=false) String token, Authentication auth) {
        return runs.start(request.id(),optionalUser(auth),token);
    }

    @GetMapping("/runs/current")
    public ResponseEntity<ru.analystgym.assessment.service.AssessmentRuns.View> current(Authentication auth) {
        var view=runs.current(currentUser(auth));
        return view==null ? ResponseEntity.noContent().build() : ResponseEntity.ok(view);
    }

    @GetMapping("/runs/{id}")
    public ru.analystgym.assessment.service.AssessmentRuns.View run(@PathVariable UUID id,
            @org.springframework.web.bind.annotation.RequestHeader(value="X-Assessment-Token",required=false) String token, Authentication auth) {
        return runs.get(id,optionalUser(auth),token);
    }

    @org.springframework.web.bind.annotation.PutMapping("/runs/{id}")
    public ru.analystgym.assessment.service.AssessmentRuns.View progress(@PathVariable UUID id, @RequestBody AssessmentDto.ProgressRequest request,
            @org.springframework.web.bind.annotation.RequestHeader(value="X-Assessment-Token",required=false) String token, Authentication auth) {
        return runs.update(id,optionalUser(auth),token,request,false);
    }

    @PostMapping("/runs/{id}/finish")
    public ru.analystgym.assessment.service.AssessmentRuns.View finish(@PathVariable UUID id, @RequestBody AssessmentDto.ProgressRequest request,
            @org.springframework.web.bind.annotation.RequestHeader(value="X-Assessment-Token",required=false) String token, Authentication auth) {
        return runs.update(id,optionalUser(auth),token,request,true);
    }

    @PostMapping("/runs/{id}/claim")
    public ru.analystgym.assessment.service.AssessmentRuns.View claim(@PathVariable UUID id,
            @org.springframework.web.bind.annotation.RequestHeader(value="X-Assessment-Token",required=false) String token, Authentication auth) {
        return runs.claim(id,currentUser(auth),token);
    }

    private static UUID optionalUser(Authentication auth) { return auth!=null && auth.getPrincipal() instanceof UUID id ? id : null; }

    @org.springframework.web.bind.annotation.ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<java.util.Map<String,String>> rejected(ResponseStatusException e) {
        return ResponseEntity.status(e.getStatusCode()).body(java.util.Map.of("error",e.getReason()==null?"request_rejected":e.getReason()));
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
