package ru.analystgym.app;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.Cookie;
import java.net.HttpCookie;
import java.sql.DriverManager;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import ru.analystgym.identity.repo.UserRepository;
import ru.analystgym.identity.security.JwtService;
import ru.analystgym.identity.service.AuthService;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** HTTP, настоящие транзакции и миграции: проверяем границы безопасности без моков репозиториев. */
@Testcontainers
@SpringBootTest(properties = {
        "app.admin-emails=boss@example.com", "app.google.enabled=false", "app.mail.enabled=false",
        "ratelimit.login-per-min=1000", "ratelimit.register-per-min=1000", "ratelimit.reset-per-min=1000",
        "review.engine=mock", "review.queue.enabled=false", "quality.recheck.enabled=false"
})
@AutoConfigureMockMvc
class SessionIntegrationTest {
    @Container
    static final PostgreSQLContainer<?> DB = new PostgreSQLContainer<>("postgres:16-alpine");

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry properties) {
        properties.add("spring.datasource.url", DB::getJdbcUrl);
        properties.add("spring.datasource.username", DB::getUsername);
        properties.add("spring.datasource.password", DB::getPassword);
    }

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired AuthService auth;
    @Autowired UserRepository users;
    @Autowired JwtService jwt;
    @Autowired ru.analystgym.practice.repo.AttemptRepository attempts;
    @Autowired ru.analystgym.practice.repo.ReviewRepository reviews;
    @Autowired ru.analystgym.practice.service.PracticeService practice;
    @Autowired ru.analystgym.practice.service.ReviewProcessor processor;
    @Autowired ru.analystgym.practice.repo.ReviewJobRepository jobs;
    @Autowired ru.analystgym.practice.repo.ReviewCallRepository calls;
    @Autowired ru.analystgym.review.ReviewPipeline pipeline;
    @Autowired org.springframework.jdbc.core.JdbcTemplate jdbc;
    @Autowired ru.analystgym.assessment.service.AssessmentRuns assessmentRuns;
    @Autowired ru.analystgym.quality.service.QualityService quality;
    @Autowired ru.analystgym.practice.service.ReviewRevisions revisionService;
    @Autowired ru.analystgym.notify.service.NotificationOutbox outbox;

    @org.junit.jupiter.api.BeforeEach
    void изолироватьОчередьТестовойБазы() {
        // Воркеры отключены; незавершённые сценарии предыдущего теста не захватываются следующим.
        jdbc.update("UPDATE review_jobs SET status='failed', stage='failed', lease_token=NULL, lease_until=NULL WHERE status <> 'done'");
        jdbc.update("UPDATE attempts SET status='failed' WHERE status IN ('queued','in_review')");
        jdbc.update("UPDATE user_notifications SET status='sent',lease_token=NULL,lease_until=NULL");
    }

    private UUID studentId() throws Exception {
        String address = email(); register(address);
        return users.findByEmail(address).orElseThrow().getId();
    }

    /** Стенд без SMTP остаётся здоровым при работающей БД; выключенный канал не даёт ложный 503. */
    @Test
    void проверкаЗдоровьяНеТребуетВыключеннуюПочту() throws Exception {
        var health = bodyOf(mvc.perform(get("/actuator/health")).andExpect(status().isOk()).andReturn());
        assertThat(health.path("status").asText()).isEqualTo("UP");
    }

    @Test
    void гостевойТестФиксируетБанкИСохраняетсяПослеВходаНаДругомУстройстве() throws Exception {
        mvc.perform(get("/assets/js/questions.js")).andExpect(status().isNotFound());
        UUID id=UUID.randomUUID();String token=UUID.randomUUID().toString().replace("-","");
        mvc.perform(post("/api/assessment/runs").contentType("application/json").header("X-Assessment-Token",token)
                .content(json.writeValueAsString(Map.of("id",id)))).andExpect(status().isForbidden());
        var started=bodyOf(mvc.perform(post("/api/assessment/runs").with(csrf()).contentType("application/json").header("X-Assessment-Token",token)
                .content(json.writeValueAsString(Map.of("id",id)))).andExpect(status().isOk()).andReturn());
        assertThat(started.path("questions").findValues("answer")).isEmpty();
        assertThat(started.path("questions").findValues("explain")).isEmpty();
        String questionId=started.path("questions").get(0).path("id").asText();
        int answer=jdbc.queryForObject("SELECT answer FROM questions WHERE id=?",Integer.class,questionId);
        String original=jdbc.queryForObject("SELECT question FROM questions WHERE id=?",String.class,questionId);
        try {
            jdbc.update("UPDATE questions SET active=false,question='Другой текст' WHERE id=?",questionId);
            var progress=new ru.analystgym.assessment.web.AssessmentDto.ProgressRequest(Map.of(questionId,answer),Map.of(questionId,true),0,0L);
            var saved=assessmentRuns.update(id,null,token,progress,false);
            assertThat(saved.version()).isEqualTo(1);
            assertThat(assessmentRuns.start(id,null,token).bankVersion()).isEqualTo(started.path("bankVersion").asText());
            var finish=new ru.analystgym.assessment.web.AssessmentDto.ProgressRequest(Map.of(questionId,answer),Map.of(questionId,true),0,1L);
            var complete=assessmentRuns.update(id,null,token,finish,true);
            assertThat(complete.result().path("correctCount").asInt()).isEqualTo(1);
            assertThat(complete.result().path("detail").get(0).path("question").asText()).isEqualTo(original);
            assertThat(assessmentRuns.update(id,null,token,finish,true).result()).isEqualTo(complete.result());
            var registered=register(email());var access=cookie(registered,"ag_access");
            var claimed=bodyOf(mvc.perform(post("/api/assessment/runs/"+id+"/claim").with(csrf()).cookie(access).header("X-Assessment-Token",token))
                    .andExpect(status().isOk()).andReturn());
            UUID owner=UUID.fromString(bodyOf(registered).path("id").asText());
            assertThat(assessmentRuns.claim(id,owner,token).submissionId().toString()).isEqualTo(claimed.path("submissionId").asText());
            assertThat(jdbc.queryForObject("SELECT count(*) FROM assessment_submissions WHERE user_id=?",Integer.class,owner)).isEqualTo(1);
            mvc.perform(get("/api/assessment/runs/"+id).header("X-Assessment-Token",token)).andExpect(status().isNotFound());
            var other=cookie(register(email()),"ag_access");
            mvc.perform(get("/api/assessment/runs/"+id).cookie(other)).andExpect(status().isNotFound());
            mvc.perform(get("/api/assessment/submissions/"+claimed.path("submissionId").asText()).cookie(access)).andExpect(status().isOk());
            var secondSession=auth.login(users.findById(owner).orElseThrow().getEmail(),"password123");
            mvc.perform(get("/api/assessment/runs/"+id).cookie(new Cookie("ag_access",secondSession.access())))
                    .andExpect(status().isOk()).andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.result.correctCount").value(1));
        } finally {jdbc.update("UPDATE questions SET active=true,question=? WHERE id=?",original,questionId);}
    }

    @Test
    void версияПрогрессаЗащищаетУстройстваАЧужойИИстёкшийТокенНеДаётДоступ() throws Exception {
        UUID id=UUID.randomUUID();String token="a".repeat(64);var run=assessmentRuns.start(id,null,token);
        String q=run.questions().get(0).id();
        var progress=new ru.analystgym.assessment.web.AssessmentDto.ProgressRequest(Map.of(q,0),Map.of(),0,0L);
        try(var executor=Executors.newFixedThreadPool(2)) {
            var gate=new java.util.concurrent.CountDownLatch(1);
            Callable<Boolean> change=()->{gate.await();try{assessmentRuns.update(id,null,token,progress,false);return true;}catch(org.springframework.web.server.ResponseStatusException e){assertThat(e.getStatusCode().value()).isEqualTo(409);return false;}};
            var a=executor.submit(change);var b=executor.submit(change);gate.countDown();
            assertThat(List.of(a.get(10,java.util.concurrent.TimeUnit.SECONDS),b.get(10,java.util.concurrent.TimeUnit.SECONDS))).containsExactlyInAnyOrder(true,false);
        }
        assertThatThrownBy(()->assessmentRuns.get(id,null,"b".repeat(64))).hasMessageContaining("404");
        jdbc.update("UPDATE assessment_runs SET expires_at=now()-interval '1 day' WHERE id=?",id);
        assertThatThrownBy(()->assessmentRuns.get(id,null,token)).hasMessageContaining("410");
        assertThatThrownBy(()->assessmentRuns.claim(id,studentId(),token)).hasMessageContaining("410");
    }

    private UUID readyAttempt(UUID user,com.fasterxml.jackson.databind.JsonNode task) {
        UUID id=submit(user,task,UUID.randomUUID().toString(),"Контракт. Сервис валидирует запрос, возвращает результат и сохраняет состояние. "+"Обоснование решения. ".repeat(100));
        var claim=processor.claim().orElseThrow();
        processor.finish(claim,ru.analystgym.review.MockReviewProvider.buildReview(claim.plan().input(),claim.tabs(),claim.plan().candidates()),Map.of());
        return id;
    }

    @Test
    void исправлениеЖалобыМеняетРезультатИСохраняетИсториюИУведомлениеАтомарно() throws Exception {
        var task=publishedTask(staff("METHODIST"));var user=studentId();var actor=studentId();UUID id=readyAttempt(user,task);
        var original=reviews.findById(id).orElseThrow().getResult().deepCopy();
        var filed=quality.fileComplaint(user,id,"Не учтён критерий контракта",1);
        assertThatThrownBy(()->quality.fileComplaint(user,id,"Повторная открытая жалоба",1)).hasMessageContaining("complaint_already_open");
        assertThatThrownBy(()->quality.resolve(filed.getId(),"resolved","Только текст без исправления",filed.getVersion(),null,null,actor)).hasMessageContaining("complaint_action_required");
        var corrected=quality.resolve(filed.getId(),"resolved","Критерий раскрыт, добавлено обоснование",filed.getVersion(),"correct",Map.of("contract","hit"),actor);
        assertThat(corrected.getOutcome()).isEqualTo("corrected");
        var current=reviews.findById(id).orElseThrow();
        assertThat(current.getRevision()).isEqualTo(2);assertThat(current.getEngine()).isEqualTo("human-review/v1");
        assertThat(current.getScore()).isGreaterThan(original.path("grade").path("score").asInt());
        var history=revisionService.history(id);assertThat(history).hasSize(2);
        assertThat(history.get(0).get("result")).isEqualTo(original);
        assertThat(history.get(1).get("actorId")).isEqualTo(actor);
        assertThat(quality.myComplaints(user).get(0).reviewSnapshot()).isEqualTo(original);
        assertThat(quality.myComplaints(user).get(0).decisions()).hasSize(1);
        assertThat(outbox.mine(user)).hasSize(2); // готовность исходного ревью + решение по жалобе
        assertThatThrownBy(()->quality.fileComplaint(user,id,"Старый экран с первой оценкой",1)).hasMessageContaining("review_changed");
    }

    @Test
    void повторнаяПроверкаЗакрываетЖалобуТолькоПослеГотовогоРезультата() throws Exception {
        var task=publishedTask(staff("METHODIST"));var user=studentId();UUID id=readyAttempt(user,task);
        var c=quality.fileComplaint(user,id,"Нужна независимая повторная проверка",1);
        c=quality.resolve(c.getId(),"review","Проверить исходное решение повторно",c.getVersion(),"recheck",null,studentId());
        UUID complaintId=c.getId();var child=c.getRecheckAttemptId();
        assertThat(c.getStatus()).isEqualTo("review");assertThat(c.getOutcome()).isEqualTo("recheck_pending");
        quality.reconcileRecheck(complaintId);assertThat(reviews.findById(id).orElseThrow().getRevision()).isEqualTo(1);
        var claim=processor.claim().orElseThrow();assertThat(claim.attemptId()).isEqualTo(child);
        processor.finish(claim,ru.analystgym.review.MockReviewProvider.buildReview(claim.plan().input(),claim.tabs(),claim.plan().candidates()),Map.of());
        quality.reconcileRecheck(complaintId);quality.reconcileRecheck(complaintId);
        var finalComplaint=quality.myComplaints(user).get(0);
        assertThat(finalComplaint.status()).isEqualTo("resolved");assertThat(finalComplaint.outcome()).isEqualTo("rechecked");
        assertThat(reviews.findById(id).orElseThrow().getRevision()).isEqualTo(2);
        assertThat(revisionService.history(id)).hasSize(2);
        assertThat(finalComplaint.decisions()).hasSize(2);
    }

    @Test
    void ошибкаПовторнойПроверкиОставляетЖалобуВРаботе() throws Exception {
        var task=publishedTask(staff("METHODIST"));var user=studentId();UUID id=readyAttempt(user,task);
        var c=quality.fileComplaint(user,id,"Повторная проверка решения",1);
        c=quality.resolve(c.getId(),"review","Проверить решение ещё раз по рубрике",c.getVersion(),"recheck",null,studentId());
        var claim=processor.claim().orElseThrow();processor.fail(claim,"provider_unavailable",false);
        quality.reconcileRecheck(c.getId());
        assertThat(quality.myComplaints(user).get(0).outcome()).isEqualTo("recheck_failed");
        assertThat(quality.myComplaints(user).get(0).status()).isEqualTo("review");
        assertThat(reviews.findById(id).orElseThrow().getRevision()).isEqualTo(1);
    }

    @Test
    void письмоПовторяетсяПослеSMTPСбояБезПовторногоРешенияЖалобы() throws Exception {
        var user=studentId();outbox.enqueue(user,"local@example.com","mail-test","Тема","Текст","/account.html");
        outbox.enqueue(user,"local@example.com","mail-test","Тема","Текст","/account.html");
        var mail=org.mockito.Mockito.mock(org.springframework.mail.javamail.JavaMailSender.class);
        org.mockito.Mockito.doThrow(new org.springframework.mail.MailSendException("SMTP недоступен")).doNothing().when(mail).send(org.mockito.ArgumentMatchers.any(org.springframework.mail.SimpleMailMessage.class));
        var delivery=new ru.analystgym.notify.service.NotificationDelivery(outbox,mail,"sender@example.com");
        try {
            delivery.sendNext();assertThat(outbox.mine(user).get(0).get("emailStatus")).isEqualTo("pending");
            assertThat(outbox.claim()).isEmpty();
            jdbc.update("UPDATE user_notifications SET next_run_at=now()-interval '1 second' WHERE user_id=?",user);
            delivery.sendNext();assertThat(outbox.mine(user)).hasSize(1);
            assertThat(outbox.mine(user).get(0).get("emailStatus")).isEqualTo("sent");
            org.mockito.Mockito.verify(mail,org.mockito.Mockito.times(2)).send(org.mockito.ArgumentMatchers.any(org.springframework.mail.SimpleMailMessage.class));
        } finally {delivery.close();}
    }

    private UUID submit(UUID user, com.fasterxml.jackson.databind.JsonNode task, String key, String text) {
        return practice.submit(user, task.path("id").asText(), List.of(
                new ru.analystgym.practice.web.PracticeDto.TabDto("doc", "doc", "Решение", text)),
                key, task.path("version").asLong());
    }

    private void expire(ru.analystgym.practice.service.ReviewProcessor.Claim claim) {
        jdbc.update("UPDATE review_jobs SET lease_until=now()-interval '1 second', next_run_at=now() WHERE id=?", claim.jobId());
    }

    @Test
    void seedПромптыРаботаютПоHTTPАВосстановлениеНеПовторяетГотовогоАгента() throws Exception {
        var editor = staff("METHODIST"); var task = publishedTask(editor);
        task = updateTask(editor, task, Map.of("rubric", List.of(
                Map.of("id", "contract", "title", "Контракт", "weightValue", 7, "focus", "sa", "keywords", List.of("контракт"), "why", "Договор"),
                Map.of("id", "arch-c", "title", "Надёжность", "weightValue", 7, "focus", "arch", "keywords", List.of("резерв"), "why", "Сбой"))));
        var user = studentId(); String solution = "Контракт " + "x".repeat(13000) + " tail_evidence";
        UUID id = submit(user, task, "http", solution);
        var attempt = attempts.findById(id).orElseThrow();
        var original = json.convertValue(attempt.getReviewPlan(), ru.analystgym.review.ReviewPlan.class);
        var tabs = ru.analystgym.practice.service.ReviewMapper.toTabs(attempt.getTabs());
        // Берём реальные seed-версии промптов из БД, заменяется только адрес провайдера.
        jdbc.update("UPDATE prompt_versions SET traffic=CASE WHEN v=1 THEN 100 ELSE 0 END WHERE prompt_key IN ('sa-reviewer','arch-reviewer')");
        var seeded = pipeline.prepare("llm", original.input(), tabs, original.candidates());
        assertThat(seeded.agents()).hasSize(2).allSatisfy(a -> {
            assertThat(a.promptVersion()).isEqualTo(1);
            assertThat(a.system()).contains(ru.analystgym.review.ReviewPipeline.CONTRACT).doesNotContain("tail_evidence");
        });
        var requests = new java.util.concurrent.CopyOnWriteArrayList<com.fasterxml.jackson.databind.JsonNode>();
        var server = com.sun.net.httpserver.HttpServer.create(new java.net.InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/chat/completions", exchange -> {
            var request = json.readTree(exchange.getRequestBody()); requests.add(request);
            var context = json.readTree(request.path("messages").get(1).path("content").asText());
            var answer = json.createObjectNode(); var criteria = answer.putArray("criteria");
            if (requests.size() > 1) {
                var c = criteria.addObject(); c.put("id", context.path("criteriaToReview").get(0).path("id").asText());
                c.put("state", "hit"); c.put("evidence", "tail_evidence");
            }
            answer.put("narrative", "Полный разбор по условию.");
            for (String name : List.of("covered", "missed", "improve", "questions")) answer.putArray(name);
            var envelope = Map.of("model", "stub-actual-model", "usage", Map.of("prompt_tokens", 7, "completion_tokens", 3),
                    "choices", List.of(Map.of("message", Map.of("content", answer.toString()))));
            byte[] response = json.writeValueAsBytes(envelope);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, response.length);
            try (var output = exchange.getResponseBody()) { output.write(response); }
        });
        server.start();
        try {
            var route = new ru.analystgym.review.ReviewPlan.Route("stub", 5L,
                    "http://127.0.0.1:" + server.getAddress().getPort(), "stub-model", "UNUSED_TEST_ENV", 10);
            var frozen = new ru.analystgym.review.ReviewPlan(1, "llm", seeded.input(), seeded.candidates(), seeded.agents(), List.of(route), seeded.limits());
            attempt.setReviewPlan(json.valueToTree(frozen)); attempts.saveAndFlush(attempt);
            updateTask(editor, task, Map.of("title", "Уже другая редакция"));
            var old = processor.claim().orElseThrow(); var firstAgent = frozen.agents().get(0); var secondAgent = frozen.agents().get(1);
            assertThat(firstAgent.id()).isEqualTo("arch");
            var firstRequest = new ru.analystgym.review.LlmClient.LlmRequest("stub-model", firstAgent.system(), firstAgent.user(), 10, 2000);
            var call = processor.reserve(old, firstAgent, route, firstRequest, ru.analystgym.review.ReviewPipeline.reservation(firstRequest));
            var parsed = new ru.analystgym.review.LlmReviewer.ParsedAnswer(Map.of("arch-c", "miss"), Map.of("arch-c", ""),
                    Map.of("arch", new ru.analystgym.review.LlmReviewer.AgentPart("arch", List.of(), List.of(), "Сохранённый разбор архитектора", List.of(), List.of())));
            assertThat(processor.answered(old, call, new ru.analystgym.review.LlmClient.LlmAnswer("Сырой ответ", "cached-model", 2, 3), parsed, null)).isFalse();
            var interruptedRequest = new ru.analystgym.review.LlmClient.LlmRequest("stub-model", secondAgent.system(), secondAgent.user(), 10, 2000);
            var interrupted = processor.reserve(old, secondAgent, route, interruptedRequest, ru.analystgym.review.ReviewPipeline.reservation(interruptedRequest));
            expire(old); var recovered = processor.claim().orElseThrow();
            assertThat(calls.findById(interrupted).orElseThrow().getStatus()).isEqualTo("unknown");
            assertThatThrownBy(() -> processor.failedCall(old, interrupted, "late"))
                    .isInstanceOf(ru.analystgym.practice.service.ReviewProcessor.LostLease.class);
            var httpPipeline = new ru.analystgym.review.ReviewPipeline(null, null, null, json, null, "", "") {
                @Override protected ru.analystgym.review.LlmClient clientFor(ru.analystgym.review.ReviewPlan.Route r) {
                    assertThat(org.springframework.transaction.support.TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
                    return new ru.analystgym.review.HttpLlmClient(r.baseUrl(), r.model(), r.keyEnv(), json) {
                        @Override protected String apiKey() { return "local-stub-only"; }
                    };
                }
            };
            var worker = new ru.analystgym.practice.service.ReviewWorker(processor, httpPipeline,
                    org.mockito.Mockito.mock(ru.analystgym.notify.service.NotificationService.class), 1);
            try { worker.process(recovered); } finally { worker.close(); }
            assertThat(attempts.findById(id).orElseThrow().getStatus()).isEqualTo("reviewed");
            var result = reviews.findById(id).orElseThrow();
            assertThat(result.getInputTokens()).isEqualTo(16); // включая невалидный ответ и сохранённого агента
            assertThat(requests).hasSize(2).allSatisfy(r -> {
                assertThat(r.path("max_tokens").asInt()).isEqualTo(2000);
                try {
                    var context = json.readTree(r.path("messages").get(1).path("content").asText());
                    assertThat(context.path("solution").asText().trim()).endsWith("tail_evidence").hasSize(solution.length());
                    assertThat(context.path("task").path("statement").path("brief").asText()).isEqualTo("Новое условие с сервера");
                    assertThat(context.path("task").path("taskVersion").asLong()).isEqualTo(frozen.input().taskVersion());
                    assertThat(context.path("criteriaToReview")).hasSize(1);
                } catch (java.io.IOException e) { throw new AssertionError(e); }
            });
            assertThat(result.getResult().path("criteria").findValuesAsText("state")).containsExactly("hit", "miss");
            var ledger = calls.findByAttemptIdOrderByStartedAtAsc(id);
            assertThat(ledger).hasSize(4).extracting(ru.analystgym.practice.domain.ReviewCall::getStatus)
                    .containsExactly("accepted", "unknown", "invalid", "accepted");
            assertThat(ledger.get(2).getChargedTokens()).isEqualTo(10);
            assertThat(ledger.get(3).getActualModel()).isEqualTo("stub-actual-model");
            assertThat(ledger.get(1).getChargedTokens()).isEqualTo(ledger.get(1).getReservedTokens());
            assertThat(practice.taskContext(user, id).path("version").asLong()).isEqualTo(frozen.input().taskVersion());
        } finally { server.stop(0); }
    }

    @Test
    void исчерпанныйБюджетНеРазрешаетСледующийHTTPИПревышениеUsageФиксируется() throws Exception {
        var task = publishedTask(staff("METHODIST")); var user = studentId(); var id = submit(user, task, "budget", "Контракт");
        var attempt = attempts.findById(id).orElseThrow();
        var plan = json.convertValue(attempt.getReviewPlan(), ru.analystgym.review.ReviewPlan.class);
        attempt.setReviewPlan(json.valueToTree(new ru.analystgym.review.ReviewPlan(1, "llm", plan.input(), plan.candidates(), List.of(), List.of(),
                new ru.analystgym.review.ReviewPlan.Limits(20000, 64000, 2000, 5000, 1))));
        attempts.saveAndFlush(attempt);
        var claim = processor.claim().orElseThrow();
        var agent = new ru.analystgym.review.ReviewPlan.Agent("sa", "Имя", "Роль", "И", List.of(), "m", 1L, "sa-reviewer", UUID.randomUUID(), 1, 1L, "s", "u");
        var route = new ru.analystgym.review.ReviewPlan.Route("p", 1L, "mock://local", "m", "", 10);
        var request = new ru.analystgym.review.LlmClient.LlmRequest("m", "s", "u", 10, 2000);
        var call = processor.reserve(claim, agent, route, request, 3000);
        assertThat(processor.answered(claim, call, new ru.analystgym.review.LlmClient.LlmAnswer("{}", "m", Integer.MAX_VALUE, Integer.MAX_VALUE), null, "invalid")).isTrue();
        assertThat(calls.findById(call).orElseThrow().getError()).isEqualTo("provider_usage_over_limit");
        assertThat(attempts.findById(id).orElseThrow().getChargedTokens()).isEqualTo(3000);
        assertThatThrownBy(() -> processor.reserve(claim, agent, route, request, 3000))
                .isInstanceOf(ru.analystgym.review.LlmClient.LlmFailedException.class).hasMessage("review_budget_exhausted");
        assertThat(calls.findByAttemptIdOrderByStartedAtAsc(id)).hasSize(1);
        processor.fail(claim, "provider_usage_over_limit", false);
    }

    @Test
    void конкурентныеПовторыВозвращаютОднуПопыткуАИзменениеТелаДаёт409() throws Exception {
        var editor = staff("METHODIST"); var task = publishedTask(editor); var user = studentId();
        try (var executor = java.util.concurrent.Executors.newFixedThreadPool(2)) {
            var gate = new java.util.concurrent.CountDownLatch(1);
            var first = executor.submit(() -> { gate.await(); return submit(user, task, "same", "Первое решение"); });
            var second = executor.submit(() -> { gate.await(); return submit(user, task, "same", "Первое решение"); });
            gate.countDown();
            UUID id = first.get(15, java.util.concurrent.TimeUnit.SECONDS);
            assertThat(second.get(15, java.util.concurrent.TimeUnit.SECONDS)).isEqualTo(id);
            assertThat(attempts.findByUserIdAndTaskIdOrderByCreatedAtDesc(user, task.path("id").asText())).hasSize(1);
            assertThatThrownBy(() -> submit(user, task, "same", "Другое решение"))
                    .isInstanceOf(org.springframework.web.server.ResponseStatusException.class).hasMessageContaining("idempotency_conflict");
            updateTask(editor, task, Map.of("title", "Правка после приёма"));
            assertThat(submit(user, task, "same", "Первое решение")).isEqualTo(id);
            assertThat(practice.submission(user, "same").attemptId()).isEqualTo(id);
            assertThat(practice.taskContext(user, id).path("title").asText()).isEqualTo(task.path("title").asText());
            assertThatThrownBy(() -> practice.taskContext(UUID.randomUUID(), id))
                    .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        }
    }

    @Test
    void конкурентнаяКвотаВключаетРаботуВОчередиИТехническийСбойОсвобождаетМесто() throws Exception {
        var editor = staff("METHODIST"); var user = studentId();
        var tasks = List.of(publishedTask(editor), publishedTask(editor), publishedTask(editor));
        var accepted = new java.util.concurrent.ConcurrentLinkedQueue<UUID>();
        var denied = new java.util.concurrent.atomic.AtomicInteger();
        try (var executor = java.util.concurrent.Executors.newFixedThreadPool(3)) {
            var gate = new java.util.concurrent.CountDownLatch(1);
            var futures = tasks.stream().map(t -> executor.submit(() -> {
                gate.await();
                try { accepted.add(submit(user, t, t.path("id").asText(), "Контракт")); }
                catch (ru.analystgym.practice.web.QuotaExceededException expected) { denied.incrementAndGet(); }
                return true;
            })).toList();
            gate.countDown();
            for (var f : futures) f.get(15, java.util.concurrent.TimeUnit.SECONDS);
        }
        assertThat(accepted).hasSize(2); assertThat(denied.get()).isEqualTo(1);
        var claim = processor.claim().orElseThrow(); processor.fail(claim, "technical_failure", false);
        assertThat(attempts.reservedTaskIds(user)).hasSize(1);
        var deniedTask = tasks.stream().filter(t -> attempts.findByUserIdAndIdempotencyKey(user, t.path("id").asText()).isEmpty()).findFirst().orElseThrow();
        assertThat(submit(user, deniedTask, "after-failure", "Контракт")).isNotNull();
    }

    @Test
    void истёкшийЗахватВосстанавливаетсяАСтарыйВоркерНеМожетЗаписатьРезультат() throws Exception {
        var task = publishedTask(staff("METHODIST")); var user = studentId(); var id = submit(user, task, "lease", "Контракт");
        var old = processor.claim().orElseThrow(); processor.stage(old, "grading", 90); expire(old);
        var recovered = processor.claim().orElseThrow();
        assertThat(recovered.token()).isNotEqualTo(old.token());
        assertThatThrownBy(() -> processor.stage(old, "sa", 10))
                .isInstanceOf(ru.analystgym.practice.service.ReviewProcessor.LostLease.class);
        var result = ru.analystgym.review.MockReviewProvider.buildReview(old.plan().input(), old.tabs(), old.plan().candidates());
        assertThatThrownBy(() -> processor.finish(old, result, Map.of()))
                .isInstanceOf(ru.analystgym.practice.service.ReviewProcessor.LostLease.class);
        processor.finish(recovered, result, Map.of());
        assertThat(reviews.findById(id)).isPresent();
        assertThat(attempts.findById(id).orElseThrow().getStatus()).isEqualTo("reviewed");
        assertThatThrownBy(() -> processor.finish(recovered, result, Map.of()))
                .isInstanceOf(ru.analystgym.practice.service.ReviewProcessor.LostLease.class);
        assertThat(processor.claim()).isEmpty();
    }

    @Test
    void backoffИЧислоЗахватовОграничены() throws Exception {
        var task = publishedTask(staff("METHODIST")); var user = studentId(); var id = submit(user, task, "retry", "Контракт");
        var first = processor.claim().orElseThrow(); processor.fail(first, "provider_rate_limited", true);
        assertThat(processor.claim()).isEmpty();
        jdbc.update("UPDATE review_jobs SET next_run_at=now()-interval '1 second' WHERE id=?", first.jobId());
        var second = processor.claim().orElseThrow(); expire(second);
        var third = processor.claim().orElseThrow(); expire(third);
        assertThat(processor.claim()).isEmpty();
        assertThat(attempts.findById(id).orElseThrow().getStatus()).isEqualTo("failed");
        assertThat(attempts.reservedTaskIds(user)).isEmpty();
        assertThat(jobs.findByAttemptId(id).orElseThrow().getTries()).isEqualTo(3);
    }

    @Test
    void слишкомБольшоеРешениеОтклоняетсяДоПопыткиИЖурнала() throws Exception {
        var task = publishedTask(staff("METHODIST")); var user = studentId();
        assertThatThrownBy(() -> submit(user, task, "big", "x".repeat(20001)))
                .isInstanceOf(org.springframework.web.server.ResponseStatusException.class).hasMessageContaining("solution_too_large");
        assertThat(attempts.findByUserIdAndIdempotencyKey(user, "big")).isEmpty();
        assertThat(attempts.reservedTaskIds(user)).isEmpty();
    }

    @Test
    void контекстДоступенВладельцуИПерсоналуНоНеДругомуСтуденту() throws Exception {
        var editor = staff("METHODIST"); var task = publishedTask(editor);
        var login = register(email()); var access = cookie(login, "ag_access");
        var postBody = Map.of("taskId", task.path("id").asText(), "taskVersion", task.path("version").asLong(), "tabs", List.of());
        var created = bodyOf(mvc.perform(post("/api/attempts").with(csrf()).cookie(access)
                .header("Idempotency-Key", "context").contentType("application/json").content(json.writeValueAsString(postBody)))
                .andExpect(status().isAccepted()).andReturn());
        String id = created.path("attemptId").asText();
        mvc.perform(get("/api/attempts/submissions/context").cookie(access)).andExpect(status().isOk());
        mvc.perform(get("/api/attempts/" + id + "/context").cookie(access)).andExpect(status().isOk())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.authorSolution").doesNotExist());
        mvc.perform(get("/api/admin/attempts/" + id + "/context").cookie(access)).andExpect(status().isForbidden());
        mvc.perform(get("/api/admin/attempts/" + id + "/context").cookie(editor)).andExpect(status().isOk());
        var other = cookie(register(email()), "ag_access");
        mvc.perform(get("/api/attempts/" + id + "/context").cookie(other)).andExpect(status().isNotFound());
        mvc.perform(get("/api/attempts/submissions/context").cookie(other)).andExpect(status().isNotFound());
        mvc.perform(post("/api/attempts").with(csrf()).cookie(access).header("Idempotency-Key", "context")
                .contentType("application/json").content(json.writeValueAsString(Map.of("taskId", task.path("id").asText(), "tabs", List.of()))))
                .andExpect(status().isConflict());
    }

    private MvcResult register(String email) throws Exception {
        return mvc.perform(post("/api/auth/register").with(csrf()).contentType("application/json")
                .content(json.writeValueAsString(Map.of("email", email, "password", "password123", "name", "Тест"))))
                .andExpect(status().isCreated()).andReturn();
    }

    private String email() {
        return "test-" + UUID.randomUUID() + "@example.com";
    }

    private Cookie cookie(MvcResult result, String name) {
        return result.getResponse().getHeaders("Set-Cookie").stream()
                .flatMap(value -> HttpCookie.parse(value).stream()).filter(value -> value.getName().equals(name))
                .map(value -> new Cookie(name, value.getValue())).findFirst().orElseThrow();
    }

    private com.fasterxml.jackson.databind.JsonNode bodyOf(MvcResult result) throws Exception {
        return json.readTree(result.getResponse().getContentAsByteArray());
    }

    private Cookie staff(String role) throws Exception {
        String email = email();
        var registered = register(email);
        var user = users.findByEmail(email).orElseThrow();
        user.setRole(role);
        users.saveAndFlush(user);
        return cookie(registered, "ag_access");
    }

    private com.fasterxml.jackson.databind.JsonNode createTask(Cookie editor) throws Exception {
        String title = "Задача " + UUID.randomUUID();
        return bodyOf(mvc.perform(post("/api/admin/tasks").with(csrf()).cookie(editor)
                .contentType("application/json").content(json.writeValueAsString(Map.of("title", title))))
                .andExpect(status().isCreated()).andReturn());
    }

    private com.fasterxml.jackson.databind.JsonNode updateTask(Cookie editor,
            com.fasterxml.jackson.databind.JsonNode task, Map<String, Object> changes) throws Exception {
        var body = new java.util.HashMap<>(changes);
        body.put("version", task.path("version").asLong());
        return bodyOf(mvc.perform(put("/api/admin/tasks/" + task.path("id").asText()).with(csrf()).cookie(editor)
                .contentType("application/json").content(json.writeValueAsString(body)))
                .andExpect(status().isOk()).andReturn());
    }

    private com.fasterxml.jackson.databind.JsonNode publishedTask(Cookie editor) throws Exception {
        var task = createTask(editor);
        task = updateTask(editor, task, Map.of(
                "statement", Map.of("brief", "Новое условие с сервера", "goal", "Спроектировать контракт",
                        "context", List.of("Контекст"), "inputs", List.of(), "deliverables", List.of("Контракт API"),
                        "constraints", List.of(), "interview", "Объясните решение"),
                "rubric", List.of(Map.of("id", "contract", "title", "Контракт API", "weightValue", 7,
                        "focus", "sa", "keywords", List.of("контракт"), "why", "Иначе стороны не договорятся")),
                "authorSolution", Map.of("doc", "<p>Защищённый эталон</p>", "plantuml", "@startuml\nA -> B\n@enduml"),
                "status", "review"));
        return updateTask(editor, task, Map.of("status", "published"));
    }

    @Test
    void публикацияПустойЗадачиОтклоняетсяБезИзмененияРевизии() throws Exception {
        // Нельзя опубликовать карточку, по которой студент не сможет решить задачу.
        var editor = staff("METHODIST");
        var task = updateTask(editor, createTask(editor), Map.of("status", "review"));
        String path = "/api/admin/tasks/" + task.path("id").asText();
        mvc.perform(put(path).with(csrf()).cookie(editor).contentType("application/json")
                .content(json.writeValueAsString(Map.of("version", task.path("version").asLong(), "status", "published"))))
                .andExpect(status().isBadRequest());
        var current = bodyOf(mvc.perform(get(path).cookie(editor)).andExpect(status().isOk()).andReturn());
        assertThat(current.path("version")).isEqualTo(task.path("version"));
        assertThat(current.path("status").asText()).isEqualTo("review");
        assertThat(bodyOf(mvc.perform(get(path + "/revisions").cookie(editor)).andReturn()).size()).isEqualTo(2);
    }

    @Test
    void двеФормыМетодистаНеЗатираютПравкиИНеДублируютНомерРевизии() throws Exception {
        // Настоящая гонка транзакций: обе формы прочитали одну версию.
        var editor = staff("METHODIST");
        var task = createTask(editor);
        String path = "/api/admin/tasks/" + task.path("id").asText();
        String content = json.writeValueAsString(Map.of("version", task.path("version").asLong(), "title", "Первая новая редакция"));
        try (var executor = Executors.newFixedThreadPool(2)) {
            Callable<Integer> edit = () -> mvc.perform(put(path).with(csrf()).cookie(editor)
                    .contentType("application/json").content(content)).andReturn().getResponse().getStatus();
            var results = executor.invokeAll(List.of(edit, edit));
            assertThat(List.of(results.get(0).get(), results.get(1).get())).containsExactlyInAnyOrder(200, 409);
        }
        var revisions = bodyOf(mvc.perform(get(path + "/revisions").cookie(editor)).andReturn());
        assertThat(revisions.size()).isEqualTo(2);
        assertThat(revisions.get(0).path("snapshot").path("title").asText()).isEqualTo("Первая новая редакция");
    }

    @Test
    void студентПолучаетТелоИзБазыАЭталонТолькоПослеСвоегоРевью() throws Exception {
        // Условия и веса совпадают с сервером, авторское решение нельзя скачать как статику.
        var task = publishedTask(staff("METHODIST"));
        String id = task.path("id").asText();
        var registered = register(email());
        var student = cookie(registered, "ag_access");
        var detail = bodyOf(mvc.perform(get("/api/tasks/" + id + "/detail")).andExpect(status().isOk()).andReturn());
        assertThat(detail.path("statement").path("brief").asText()).isEqualTo("Новое условие с сервера");
        assertThat(detail.path("rubric").get(0).path("weightValue").asInt()).isEqualTo(7);
        assertThat(detail.has("authorSolution")).isFalse();
        mvc.perform(get("/assets/js/data-tasks-1.js")).andExpect(status().isNotFound());
        mvc.perform(get("/api/tasks/" + id + "/reference").cookie(student)).andExpect(status().isForbidden());
        var attempt = new ru.analystgym.practice.domain.Attempt();
        attempt.setId(UUID.randomUUID());
        attempt.setUserId(UUID.fromString(bodyOf(registered).path("id").asText()));
        attempt.setTaskId(id); attempt.setTabs(json.createArrayNode());
        attempt.setRubricSnapshot(task.path("rubric")); attempt.setStatus("reviewed");
        attempts.saveAndFlush(attempt);
        var reference = bodyOf(mvc.perform(get("/api/tasks/" + id + "/reference").cookie(student)).andExpect(status().isOk()).andReturn());
        assertThat(reference.path("doc").asText()).contains("Защищённый эталон");
        mvc.perform(get("/api/tasks/" + id + "/reference").cookie(cookie(register(email()), "ag_access")))
                .andExpect(status().isForbidden());
    }

    @Test
    void архивУбираетЗадачуИзКаталогаПодборкиИПрямойСсылки() throws Exception {
        // Архив не должен продолжать показываться из встроенного каталога или состава подборки.
        var editor = staff("METHODIST");
        var task = publishedTask(editor);
        String id = task.path("id").asText();
        var collection = bodyOf(mvc.perform(post("/api/admin/collections").with(csrf()).cookie(editor)
                .contentType("application/json").content(json.writeValueAsString(Map.of("title", "Подборка " + UUID.randomUUID(), "taskIds", List.of(id)))))
                .andExpect(status().isCreated()).andReturn());
        updateTask(editor, task, Map.of("status", "archived"));
        mvc.perform(get("/api/tasks/" + id + "/detail")).andExpect(status().isNotFound());
        mvc.perform(get("/api/tasks/" + id)).andExpect(status().isNotFound());
        var catalog = bodyOf(mvc.perform(get("/api/tasks")).andReturn());
        assertThat(catalog.findValuesAsText("id")).doesNotContain(id);
        var publicCollection = bodyOf(mvc.perform(get("/api/collections/" + collection.path("id").asText())).andReturn());
        assertThat(publicCollection.path("taskIds").size()).isZero();
    }

    @Test
    void изменённаяПослеОткрытияЗадачаНеПринимаетсяНаПроверкуПоДругойРубрике() throws Exception {
        // Пользователь должен увидеть новую редакцию до списания квоты и постановки в очередь.
        var editor = staff("METHODIST"); var task = publishedTask(editor);
        var student = cookie(register(email()), "ag_access");
        updateTask(editor, task, Map.of("title", "Новая редакция задачи"));
        mvc.perform(post("/api/attempts").header("Idempotency-Key", UUID.randomUUID()).with(csrf()).cookie(student).contentType("application/json")
                .content(json.writeValueAsString(Map.of("taskId", task.path("id").asText(), "taskVersion", task.path("version").asLong(), "tabs", List.of()))))
                .andExpect(status().isConflict());
    }

    @Test
    void справочникиСохраняютсяВБазеИСтараяФормаПолучаетКонфликт() throws Exception {
        // Переименование не должно теряться после перезагрузки и не должно затирать соседа.
        var editor = staff("METHODIST");
        var tag = (com.fasterxml.jackson.databind.node.ObjectNode) bodyOf(mvc.perform(post("/api/admin/tags").with(csrf()).cookie(editor)
                .contentType("application/json").content(json.writeValueAsString(Map.of("name", "Метка " + UUID.randomUUID()))))
                .andExpect(status().isCreated()).andReturn());
        var stale = tag.deepCopy(); tag.put("name", "Переименованная метка");
        mvc.perform(post("/api/admin/tags").with(csrf()).cookie(editor).contentType("application/json").content(json.writeValueAsBytes(tag))).andExpect(status().isOk());
        mvc.perform(post("/api/admin/tags").with(csrf()).cookie(editor).contentType("application/json").content(json.writeValueAsBytes(stale))).andExpect(status().isConflict());
        var dictionary = bodyOf(mvc.perform(get("/api/dictionaries")).andReturn());
        assertThat(dictionary.path("tags").findValuesAsText("name")).contains("Переименованная метка");
        String path = "/api/admin/tags/" + tag.path("id").asText();
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete(path + "?version=0").with(csrf()).cookie(editor))
                .andExpect(status().isConflict());
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete(path + "?version=1").with(csrf()).cookie(editor))
                .andExpect(status().isNoContent());
    }

    @Test
    void праваАдминкиПроверяютсяПриКаждомЗапросе() throws Exception {
        // Скрытие кнопок недостаточно; прямой вызов API студентом или другой ролью тоже запрещён.
        var student = cookie(register(email()), "ag_access");
        for (String endpoint : List.of("tasks", "tags", "collections", "quality/dashboard", "llm/agents", "users")) {
            mvc.perform(get("/api/admin/" + endpoint).cookie(student)).andExpect(status().isForbidden());
        }
        var reviewer = staff("REVIEWER");
        mvc.perform(get("/api/admin/attempts").cookie(reviewer)).andExpect(status().isOk());
        mvc.perform(post("/api/admin/tasks").with(csrf()).cookie(reviewer).contentType("application/json").content("{\"title\":\"Чужая задача\"}"))
                .andExpect(status().isForbidden());
        var methodist = staff("METHODIST");
        mvc.perform(get("/api/admin/llm/agents").cookie(methodist)).andExpect(status().isForbidden());
    }

    @Test
    void промптыВерсионируютсяИТрафикНеТеряетсяПриРедактировании() throws Exception {
        // Проверяем номера, stale-форму, неизменность рабочей редакции и сумму трафика на реальной БД.
        var llm = staff("LLM_ADMIN");
        var prompts = bodyOf(mvc.perform(get("/api/admin/llm/prompts").cookie(llm)).andExpect(status().isOk()).andReturn());
        String key = prompts.get(0).path("key").asText();
        String route = "/api/admin/llm/prompts/" + key + "/versions";
        var version = bodyOf(mvc.perform(post(route).with(csrf()).cookie(llm).contentType("application/json")
                .content("{\"text\":\"Новый промпт\",\"changelog\":\"Уточнение рубрики\",\"traffic\":0}"))
                .andExpect(status().isCreated()).andReturn());
        String path = "/api/admin/llm/versions/" + version.path("id").asText();
        String body = json.writeValueAsString(Map.of("version", version.path("version").asLong()));
        mvc.perform(post(path + "/promote").with(csrf()).cookie(llm).contentType("application/json").content(body)).andExpect(status().isOk());
        mvc.perform(post(path + "/promote").with(csrf()).cookie(llm).contentType("application/json").content(body)).andExpect(status().isConflict());
        var rows = bodyOf(mvc.perform(get(route).cookie(llm)).andReturn());
        int traffic = 0;
        for (var row : rows) traffic += row.path("traffic").asInt();
        assertThat(traffic).isEqualTo(100);
        var active = rows.get(0);
        mvc.perform(put(path).with(csrf()).cookie(llm).contentType("application/json")
                .content(json.writeValueAsString(Map.of("version", active.path("version").asLong(), "text", "Попытка затереть рабочий текст"))))
                .andExpect(status().isBadRequest());
    }

    @Test
    void невалиднаяЗаполненнаяФормаНеОставляетПустуюЗадачу() throws Exception {
        // Создание и сохранение формы атомарны, после ошибки не возникает дубликат при повторе.
        var editor = staff("METHODIST");
        String title = "Атомарная задача " + UUID.randomUUID();
        mvc.perform(post("/api/admin/tasks").with(csrf()).cookie(editor).contentType("application/json")
                .content(json.writeValueAsString(Map.of("title", title, "content", Map.of("timeMin", 1)))))
                .andExpect(status().isBadRequest());
        var rows = bodyOf(mvc.perform(get("/api/admin/tasks").cookie(editor)).andReturn());
        assertThat(rows.findValuesAsText("title")).doesNotContain(title);
    }

    @Test
    void устаревшиеФормыУровняАгентаИПровайдераПолучают409() throws Exception {
        // Версионный контракт одинаков для разделов с разными HTTP-методами.
        var editor = staff("SUPERADMIN");
        for (String endpoint : List.of("levels", "llm/agents", "llm/providers")) {
            var rows = bodyOf(mvc.perform(get("/api/admin/" + endpoint).cookie(editor)).andExpect(status().isOk()).andReturn());
            var row = (com.fasterxml.jackson.databind.node.ObjectNode) rows.get(0);
            var stale = row.deepCopy(); row.put("name", "Изменённая запись " + UUID.randomUUID());
            String path = "/api/admin/" + endpoint;
            var request = endpoint.equals("llm/providers") ? post(path) : put(path + "/" + row.path("id").asText());
            mvc.perform(request.with(csrf()).cookie(editor).contentType("application/json").content(json.writeValueAsBytes(row)))
                    .andExpect(status().isOk());
            request = endpoint.equals("llm/providers") ? post(path) : put(path + "/" + row.path("id").asText());
            mvc.perform(request.with(csrf()).cookie(editor).contentType("application/json").content(json.writeValueAsBytes(stale)))
                    .andExpect(status().isConflict());
        }
    }

    @Test
    void жалобуНеМожетЗатеретьВторойРецензент() throws Exception {
        // Реальные данные качества и версия жалобы доходят до браузерного контракта.
        var registered = register(email());
        var student = cookie(registered, "ag_access");
        var attempt = new ru.analystgym.practice.domain.Attempt();
        attempt.setId(UUID.randomUUID());
        attempt.setUserId(UUID.fromString(bodyOf(registered).path("id").asText()));
        attempt.setTaskId("int-idempotency"); attempt.setTabs(json.createArrayNode());
        attempt.setRubricSnapshot(json.createArrayNode()); attempt.setStatus("reviewed");
        attempts.saveAndFlush(attempt);
        var review = new ru.analystgym.practice.domain.Review();
        review.setAttemptId(attempt.getId()); review.setGradeCode(3); review.setScore(55);
        review.setResult(json.createObjectNode()); review.setPromptVersions(json.createObjectNode());
        reviews.saveAndFlush(review);
        var filed = bodyOf(mvc.perform(post("/api/complaints").with(csrf()).cookie(student).contentType("application/json")
                .content(json.writeValueAsString(Map.of("attemptId", attempt.getId(), "reason", "Не учтён критерий контракта API", "reviewRevision",1))))
                .andExpect(status().isCreated()).andReturn());
        var reviewer = staff("REVIEWER");
        var queue = bodyOf(mvc.perform(get("/api/admin/complaints?status=all").cookie(reviewer)).andReturn());
        com.fasterxml.jackson.databind.JsonNode complaint = null;
        for (var row : queue) if (row.path("id").asText().equals(filed.path("id").asText())) complaint = row;
        assertThat(complaint).isNotNull();
        String content = json.writeValueAsString(Map.of("status", "review", "version", complaint.path("version").asLong()));
        String path = "/api/admin/complaints/" + complaint.path("id").asText();
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch(path).with(csrf()).cookie(reviewer)
                .contentType("application/json").content(content)).andExpect(status().isOk());
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch(path).with(csrf()).cookie(reviewer)
                .contentType("application/json").content(content)).andExpect(status().isConflict());
    }

    @Test
    void refreshНеАвторизуетApiИAccessНеОбменивается() throws Exception {
        // Даже подписанный refresh в ag_access не должен давать доступ к профилю.
        var login = register(email());
        mvc.perform(get("/api/auth/me").cookie(new Cookie("ag_access", cookie(login, "ag_refresh").getValue())))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/auth/refresh").with(csrf())
                .cookie(new Cookie("ag_refresh", cookie(login, "ag_access").getValue())))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void ротацияГаситСтаруюПаруИДаётНовую() throws Exception {
        // Старую пару нельзя ни использовать, ни обновить после успешной ротации.
        var login = register(email());
        var rotated = mvc.perform(post("/api/auth/refresh").with(csrf()).cookie(cookie(login, "ag_refresh")))
                .andExpect(status().isOk()).andReturn();
        assertThat(cookie(rotated, "ag_refresh").getValue()).isNotEqualTo(cookie(login, "ag_refresh").getValue());
        mvc.perform(get("/api/auth/me").cookie(cookie(login, "ag_access"))).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/auth/me").cookie(cookie(rotated, "ag_access"))).andExpect(status().isOk());
        mvc.perform(post("/api/auth/refresh").with(csrf()).cookie(cookie(login, "ag_refresh")))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void дваОдновременныхRefreshПроходятТолькоОдинРаз() throws Exception {
        // Проверяем настоящую блокировку PostgreSQL: один токен создаёт ровно одну новую пару.
        var token = cookie(register(email()), "ag_refresh");
        try (var executor = Executors.newFixedThreadPool(2)) {
            Callable<Integer> refresh = () -> mvc.perform(post("/api/auth/refresh").with(csrf())
                    .cookie(token)).andReturn().getResponse().getStatus();
            var results = executor.invokeAll(List.of(refresh, refresh));
            assertThat(List.of(results.get(0).get(), results.get(1).get()))
                    .containsExactlyInAnyOrder(200, 401);
        }
    }

    @Test
    void выходОтзываетAccessИRefresh() throws Exception {
        // Удаление куки недостаточно: проверяем повтор с сохранёнными значениями токенов.
        var login = register(email());
        mvc.perform(post("/api/auth/logout").with(csrf()).cookie(cookie(login, "ag_refresh")))
                .andExpect(status().isOk());
        mvc.perform(get("/api/auth/me").cookie(cookie(login, "ag_access"))).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/auth/refresh").with(csrf()).cookie(cookie(login, "ag_refresh")))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void выходЗакрываетРотациюУспевшуюЗавершитьсяРаньше() throws Exception {
        // Если refresh выиграл гонку с logout, выход по старой куке закрывает его потомка.
        String email = email();
        var login = register(email);
        var otherDevice = auth.login(email, "password123");
        var rotated = mvc.perform(post("/api/auth/refresh").with(csrf()).cookie(cookie(login, "ag_refresh")))
                .andExpect(status().isOk()).andReturn();
        mvc.perform(post("/api/auth/logout").with(csrf()).cookie(cookie(login, "ag_refresh")))
                .andExpect(status().isOk());
        mvc.perform(get("/api/auth/me").cookie(cookie(rotated, "ag_access"))).andExpect(status().isUnauthorized());
        assertThatThrownBy(() -> auth.refresh(cookie(rotated, "ag_refresh").getValue()))
                .isInstanceOf(AuthService.InvalidSessionException.class);
        // Выход на одном устройстве не завершает самостоятельный вход на другом.
        mvc.perform(get("/api/auth/me").cookie(new Cookie("ag_access", otherDevice.access())))
                .andExpect(status().isOk());
    }

    @Test
    void сбросПроверяетПарольИГаситВсеСессии() throws Exception {
        // Неверный новый пароль не расходует ссылку; успешный сброс завершает обе сессии.
        String email = email();
        var login = register(email);
        var second = auth.login(email, "password123");
        String token = auth.requestReset(email);
        mvc.perform(post("/api/auth/password/confirm").with(csrf()).contentType("application/json")
                .content(json.writeValueAsString(Map.of("token", token, "password", "short"))))
                .andExpect(status().isBadRequest());
        auth.confirmReset(token, "new-password123");
        mvc.perform(get("/api/auth/me").cookie(cookie(login, "ag_access"))).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/auth/me").cookie(new Cookie("ag_access", second.access())))
                .andExpect(status().isUnauthorized());
        assertThatThrownBy(() -> auth.refresh(second.refresh())).isInstanceOf(AuthService.InvalidSessionException.class);
        assertThatThrownBy(() -> auth.confirmReset(token, "another-password"))
                .isInstanceOf(AuthService.InvalidSessionException.class);
        assertThat(auth.login(email, "new-password123")).isNotNull();
    }

    @Test
    void сменаПароляГаситТекущуюИДругиеСессии() throws Exception {
        // Пароль и отзыв сессий коммитятся атомарно, новый вход принимает только новый пароль.
        String email = email();
        var login = register(email);
        var second = auth.login(email, "password123");
        mvc.perform(post("/api/auth/password/change").with(csrf()).cookie(cookie(login, "ag_access"))
                .contentType("application/json").content("{\"currentPassword\":\"password123\",\"newPassword\":\"changed-password\"}"))
                .andExpect(status().isOk());
        mvc.perform(get("/api/auth/me").cookie(cookie(login, "ag_access"))).andExpect(status().isUnauthorized());
        assertThatThrownBy(() -> auth.refresh(second.refresh())).isInstanceOf(AuthService.InvalidSessionException.class);
        assertThat(auth.login(email, "changed-password")).isNotNull();
    }

    @Test
    void регистрацияИзСтарогоBootstrapСпискаНеДаётПрав() throws Exception {
        // Даже явно настроенный старый APP_ADMIN_EMAILS больше не является способом повышения роли.
        var login = register("boss@example.com");
        assertThat(json.readTree(login.getResponse().getContentAsString()).path("role").asText()).isEqualTo("STUDENT");
        mvc.perform(get("/api/admin/users").cookie(cookie(login, "ag_access"))).andExpect(status().isForbidden());
    }

    @Test
    void заголовокАккаунтаЗащищаетОтСменыКукВДругойВкладке() throws Exception {
        // Старая вкладка А не может записать её данные под свежими куками Б.
        var login = register(email());
        mvc.perform(put("/api/auth/profile").with(csrf()).cookie(cookie(login, "ag_access"))
                .header("X-Account-ID", UUID.randomUUID()).contentType("application/json")
                .content("{\"name\":\"Чужая запись\"}")).andExpect(status().isConflict());
    }

    @Test
    void конфликтВерсийНеПерезаписываетЧерновик() throws Exception {
        // Устройство со старой версией получает 409, актуальное содержимое остаётся в БД.
        var login = register(email());
        Cookie access = cookie(login, "ag_access");
        String path = "/api/tasks/int-idempotency/draft";
        var first = mvc.perform(put(path).with(csrf()).cookie(access).contentType("application/json")
                .content("{\"tabs\":[{\"id\":\"d\",\"type\":\"doc\",\"title\":\"Решение\",\"content\":\"Первая версия\"}],\"version\":null}"))
                .andExpect(status().isOk()).andReturn();
        long version = json.readTree(first.getResponse().getContentAsString()).path("version").asLong();
        mvc.perform(put(path).with(csrf()).cookie(access).contentType("application/json")
                .content("{\"tabs\":[],\"version\":" + version + "}")).andExpect(status().isOk());
        mvc.perform(put(path).with(csrf()).cookie(access).contentType("application/json")
                .content("{\"tabs\":[],\"version\":" + version + "}")).andExpect(status().isConflict());
    }

    @Test
    void bootstrapСоздаётТолькоНовогоПервогоАдминистратора() throws Exception {
        // Команда не повышает уже зарегистрированный email и отказывается при существующем SUPERADMIN.
        Map<String, String> environment = Map.of("APP_DB_URL", DB.getJdbcUrl(), "APP_DB_USER", DB.getUsername(),
                "APP_DB_PASSWORD", DB.getPassword(), "APP_BOOTSTRAP_ADMIN_EMAIL", email(),
                "APP_BOOTSTRAP_ADMIN_PASSWORD", "bootstrap-password");
        BootstrapAdminCommand.run(environment);
        assertThat(users.findByEmail(environment.get("APP_BOOTSTRAP_ADMIN_EMAIL")).orElseThrow().getRole())
                .isEqualTo("SUPERADMIN");
        assertThatThrownBy(() -> BootstrapAdminCommand.run(environment)).isInstanceOf(IllegalStateException.class);
        try (var connection = DriverManager.getConnection(DB.getJdbcUrl(), DB.getUsername(), DB.getPassword());
                var delete = connection.prepareStatement("DELETE FROM users WHERE email = ?")) {
            delete.setString(1, environment.get("APP_BOOTSTRAP_ADMIN_EMAIL"));
            delete.executeUpdate();
        }
        String occupied = email();
        register(occupied);
        var changed = new java.util.HashMap<>(environment);
        changed.put("APP_BOOTSTRAP_ADMIN_EMAIL", occupied);
        assertThatThrownBy(() -> BootstrapAdminCommand.run(changed)).isInstanceOf(java.sql.SQLException.class);
        assertThat(users.findByEmail(occupied).orElseThrow().getRole()).isEqualTo("STUDENT");
    }
}
