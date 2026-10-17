package ru.analystgym.assessment.service;

import java.time.*;
import java.util.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import com.fasterxml.jackson.databind.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import ru.analystgym.assessment.repo.QuestionRepository;
import ru.analystgym.assessment.web.AssessmentDto.QuestionCard;
import ru.analystgym.assessment.web.AssessmentDto.ProgressRequest;

/** Версионированные прохождения; секрет гостя ограничен одним прохождением и сроком жизни. */
@Service
public class AssessmentRuns {
    private final JdbcTemplate db;
    private final ObjectMapper json;
    private final QuestionRepository questions;
    private final AssessmentService assessment;
    private final int guestDays;

    public AssessmentRuns(JdbcTemplate db, ObjectMapper json, QuestionRepository questions, AssessmentService assessment,
                          @Value("${assessment.guest-days:7}") int guestDays) {
        if (guestDays < 1 || guestDays > 30) throw new IllegalArgumentException("Срок гостевого прохождения: 1–30 дней");
        this.db=db; this.json=json; this.questions=questions; this.assessment=assessment; this.guestDays=guestDays;
    }

    private record Run(UUID id, UUID user, String guestHash, Instant expires, String bank, JsonNode questions,
                       JsonNode answers, JsonNode flags, int position, long version, String status, JsonNode result,
                       UUID submission, Instant started, Instant finished) { }

    public record View(UUID id, long version, String bankVersion, String status, List<QuestionCard> questions,
                       JsonNode answers, JsonNode flags, int index, long startedAt, String finishedAt,
                       int durationSec, JsonNode result, UUID submissionId, String expiresAt) { }

    /** Идентификатор генерирует клиент до POST: потерянный ответ не создаёт второй тест. */
    @Transactional
    public View start(UUID id, UUID user, String guestToken) {
        if (id == null) throw error(HttpStatus.BAD_REQUEST,"run_id_required");
        String guest = user == null ? guestHash(guestToken) : null;
        // Повтор принятого старта возвращает прежний банк даже после его редактирования.
        if (!db.queryForList("SELECT id FROM assessment_runs WHERE id=?", id).isEmpty()) return view(owned(id,user,guestToken,true));
        var bank = questions.findByActiveTrueOrderByIdAsc().stream().map(q -> new AssessmentResult.QuestionInput(
                q.getId(),q.getCompetency(),q.getDifficulty(),q.getQuestion(),AssessmentService.strings(q.getOptions()),q.getAnswer(),q.getExplain())).toList();
        if (bank.isEmpty() || bank.size()>200) throw error(HttpStatus.CONFLICT,"assessment_bank_unavailable");
        String snapshot = encode(bank);
        db.update("INSERT INTO assessment_runs(id,user_id,guest_hash,expires_at,bank_version,questions) VALUES (?,?,?,?,?,CAST(? AS jsonb)) ON CONFLICT DO NOTHING",
                id,user,guest,java.sql.Timestamp.from(Instant.now().plus(Duration.ofDays(guestDays))),hash(snapshot),snapshot);
        return view(owned(id,user,guestToken,true));
    }

    @Transactional(readOnly=true)
    public View get(UUID id, UUID user, String token) { return view(owned(id,user,token,false)); }

    @Transactional(readOnly=true)
    public View current(UUID user) {
        if (user==null) throw error(HttpStatus.UNAUTHORIZED,"unauthorized");
        var ids=db.queryForList("SELECT id FROM assessment_runs WHERE user_id=? AND status='active' ORDER BY started_at DESC LIMIT 1",UUID.class,user);
        return ids.isEmpty() ? null : get(ids.get(0),user,null);
    }

    /** Ответы, отметки и позиция сохраняются вместе; чужой прогресс защищён версией. */
    @Transactional
    public View update(UUID id, UUID user, String token, ProgressRequest request, boolean finish) {
        var run=owned(id,user,token,true);
        if (request==null || request.answers()==null || request.flags()==null || request.index()==null) throw error(HttpStatus.BAD_REQUEST,"progress_required");
        var bank=bank(run); var byId=new HashMap<String,AssessmentResult.QuestionInput>(); bank.forEach(q->byId.put(q.id(),q));
        request.answers().forEach((key,value)-> {
            var q=byId.get(key);
            if (q==null || value==null || value<0 || value>=q.options().size()) throw error(HttpStatus.BAD_REQUEST,"bad_answer");
        });
        if (request.index()<0 || request.index()>=bank.size() || request.flags().entrySet().stream().anyMatch(e->!byId.containsKey(e.getKey()) || e.getValue()==null)) throw error(HttpStatus.BAD_REQUEST,"bad_position_or_flag");
        JsonNode answers=json.valueToTree(request.answers());
        if ("completed".equals(run.status())) {
            if (finish && answers.equals(run.answers())) return view(run);
            throw error(HttpStatus.CONFLICT,"assessment_completed");
        }
        if (request.version()==null || request.version()!=run.version()) throw error(HttpStatus.CONFLICT,"assessment_conflict");
        AssessmentResult result=finish ? AssessmentEngine.compute(bank,request.answers()) : null;
        UUID submission=null;
        if (finish && run.user()!=null) submission=assessment.saveFrozen(run.user(),request.answers(),duration(run),result).getId();
        db.update("UPDATE assessment_runs SET answers=CAST(? AS jsonb),flags=CAST(? AS jsonb),position=?,version=version+1,status=?,result=CAST(? AS jsonb),submission_id=?,finished_at=? WHERE id=?",
                encode(request.answers()),encode(request.flags()),request.index(),finish?"completed":"active",result==null?null:encode(result),submission,
                finish?java.sql.Timestamp.from(Instant.now()):null,id);
        return view(owned(id,user,token,false));
    }

    /** Привязка явная: токен другого гостя/аккаунта не переносит данные. Повтор запроса безопасен. */
    @Transactional
    public View claim(UUID id, UUID user, String token) {
        if (user==null) throw error(HttpStatus.UNAUTHORIZED,"unauthorized");
        var run=owned(id,user,token,true);
        if (run.user()!=null) return view(run);
        UUID submission="completed".equals(run.status()) ? assessment.saveFrozen(user,
                json.convertValue(run.answers(),new com.fasterxml.jackson.core.type.TypeReference<Map<String,Integer>>(){}),
                duration(run),json.convertValue(run.result(),AssessmentResult.class)).getId() : null;
        db.update("UPDATE assessment_runs SET user_id=?,guest_hash=NULL,submission_id=?,version=version+1 WHERE id=?",user,submission,id);
        return view(owned(id,user,null,false));
    }

    private Run owned(UUID id, UUID user, String token, boolean lock) {
        var list=db.query("SELECT * FROM assessment_runs WHERE id=?"+(lock?" FOR UPDATE":""),(rs,n)->new Run(
                rs.getObject("id",UUID.class),rs.getObject("user_id",UUID.class),rs.getString("guest_hash"),rs.getTimestamp("expires_at").toInstant(),
                rs.getString("bank_version"),decode(rs.getString("questions")),decode(rs.getString("answers")),decode(rs.getString("flags")),
                rs.getInt("position"),rs.getLong("version"),rs.getString("status"),decode(rs.getString("result")),rs.getObject("submission_id",UUID.class),
                rs.getTimestamp("started_at").toInstant(),rs.getTimestamp("finished_at")==null?null:rs.getTimestamp("finished_at").toInstant()),id);
        if (list.isEmpty()) throw error(HttpStatus.NOT_FOUND,"assessment_not_found");
        Run run=list.get(0);
        if (run.user()!=null ? !run.user().equals(user) : token==null || !MessageDigest.isEqual(run.guestHash().getBytes(StandardCharsets.UTF_8),hash(token).getBytes(StandardCharsets.UTF_8))) throw error(HttpStatus.NOT_FOUND,"assessment_not_found");
        if (run.user()==null && !run.expires().isAfter(Instant.now())) throw error(HttpStatus.GONE,"assessment_expired");
        return run;
    }

    private List<AssessmentResult.QuestionInput> bank(Run r) { return json.convertValue(r.questions(),new com.fasterxml.jackson.core.type.TypeReference<List<AssessmentResult.QuestionInput>>(){}); }
    private View view(Run r) {
        return new View(r.id(),r.version(),r.bank(),r.status(),bank(r).stream().map(q->new QuestionCard(q.id(),q.competency(),q.difficulty(),q.question(),q.options())).toList(),
                r.answers(),r.flags(),r.position(),r.started().toEpochMilli(),r.finished()==null?null:r.finished().toString(),duration(r),r.result(),r.submission(),r.expires().toString());
    }
    private int duration(Run r) { return (int)Math.max(1,Math.min(7200,Duration.between(r.started(),r.finished()==null?Instant.now():r.finished()).toSeconds())); }
    private String guestHash(String token) {
        if (token==null || !token.matches("[A-Za-z0-9_-]{32,128}")) throw error(HttpStatus.BAD_REQUEST,"guest_token_required");
        return hash(token);
    }
    private String hash(String text) { try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8))); } catch(Exception e){throw new IllegalStateException(e);} }
    private JsonNode decode(String value) { try { return value==null?null:json.readTree(value); } catch(Exception e){throw new IllegalStateException(e);} }
    private String encode(Object value) { try { return json.writeValueAsString(value); } catch(Exception e){throw new IllegalStateException(e);} }
    private ResponseStatusException error(HttpStatus status,String code) { return new ResponseStatusException(status,code); }
}
