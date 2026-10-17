package ru.analystgym.practice.service;

import java.util.*;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import ru.analystgym.practice.domain.*;
import ru.analystgym.practice.repo.*;
import ru.analystgym.review.*;

/** Текущее представление ревью и неизменяемая история исправлений принадлежат practice. */
@Service
public class ReviewRevisions {
    private final ReviewRepository reviews;
    private final AttemptRepository attempts;
    private final ReviewJobRepository jobs;
    private final ReviewPipeline pipeline;
    private final ObjectMapper json;
    private final JdbcTemplate db;
    public ReviewRevisions(ReviewRepository reviews,AttemptRepository attempts,ReviewJobRepository jobs,ReviewPipeline pipeline,ObjectMapper json,JdbcTemplate db){
        this.reviews=reviews;this.attempts=attempts;this.jobs=jobs;this.pipeline=pipeline;this.json=json;this.db=db;
    }

    /** Снимок записывается и перед первой правкой старой попытки, не только у новых ревью. */
    @Transactional
    public void record(Review r,UUID actor,String reason) {
        var metadata=json.createObjectNode().put("engine",r.getEngine()).put("provider",r.getProvider()).put("model",r.getModel())
                .put("inputTokens",r.getInputTokens()).put("outputTokens",r.getOutputTokens());
        metadata.set("promptVersions",r.getPromptVersions());
        db.update("INSERT INTO review_revisions(attempt_id,revision,result,metadata,actor_id,reason) VALUES(?,?,CAST(? AS jsonb),CAST(? AS jsonb),?,?) ON CONFLICT DO NOTHING",
                r.getAttemptId(),r.getRevision(),r.getResult().toString(),metadata.toString(),actor,reason);
    }

    @Transactional(readOnly=true)
    public List<Map<String,Object>> history(UUID id) {
        return db.query("SELECT r.*,u.name AS actor_name FROM review_revisions r LEFT JOIN users u ON u.id=r.actor_id WHERE attempt_id=? ORDER BY revision",(rs,n)-> {
            Map<String,Object> row=new LinkedHashMap<>();row.put("revision",rs.getInt("revision"));row.put("result",decode(rs.getString("result")));
            row.put("metadata",decode(rs.getString("metadata")));row.put("actorId",rs.getObject("actor_id"));row.put("actorName",rs.getString("actor_name"));row.put("reason",rs.getString("reason"));row.put("createdAt",rs.getTimestamp("created_at").toInstant().toString());return row;
        },id);
    }

    /** Методист меняет состояния критериев, числовой балл пересчитывается теми же правилами. */
    @Transactional
    public Review correct(UUID id,int expected,UUID actor,String reason,Map<String,String> states) {
        var current=current(id,expected);var a=attempts.findById(id).orElseThrow();
        ReviewPlan plan=a.getReviewPlan()==null || a.getReviewPlan().isNull()?null:json.convertValue(a.getReviewPlan(),ReviewPlan.class);
        ReviewInput input=plan==null?ReviewMapper.toInputFromSnapshot(a.getTaskId(),a.getTaskId(),"easy","",List.of(),false,a.getRubricSnapshot(),json.createArrayNode()):plan.input();
        var ids=input.rubric().stream().map(ReviewInput.CriterionInput::id).collect(java.util.stream.Collectors.toSet());
        if(states==null || !states.keySet().equals(ids) || states.values().stream().anyMatch(s->s==null || !List.of("hit","partial","miss").contains(s))) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"correction_criteria_required");
        var parts=new HashMap<String,LlmReviewer.AgentPart>();var personas=new HashMap<String,LlmReviewer.Persona>();
        for(String agent:List.of("sa","arch")) {
            parts.put(agent,new LlmReviewer.AgentPart(agent,List.of(),List.of(),"Исправлено методистом. "+reason,List.of(),List.of()));
            personas.put(agent,new LlmReviewer.Persona(agent,"Методист", "Ручной разбор критериев", "М",List.of()));
        }
        var evidence=new HashMap<String,String>();ids.forEach(c->evidence.put(c,"Решение методиста: "+reason));
        var result=LlmReviewer.buildReview(input,ReviewMapper.toTabs(a.getTabs()),plan==null?List.of():plan.candidates(),
                new LlmReviewer.ParsedAnswer(states,evidence,parts),personas,"human-review/v1");
        record(current,null,null);current.setProvider("");current.setModel("");current.setPromptVersions(json.createObjectNode());current.setInputTokens(0);current.setOutputTokens(0);
        return replace(current,json.valueToTree(result),actor,reason,"human-review/v1");
    }

    @Transactional
    public Review adopt(UUID id,int expected,UUID child,UUID actor,String reason) {
        var current=current(id,expected);var replacement=reviews.findById(child).orElseThrow();
        record(current,null,null);current.setProvider(replacement.getProvider());current.setModel(replacement.getModel());current.setPromptVersions(replacement.getPromptVersions());
        current.setInputTokens(replacement.getInputTokens());current.setOutputTokens(replacement.getOutputTokens());
        return replace(current,replacement.getResult(),actor,reason,replacement.getEngine());
    }

    @Transactional
    public UUID recheck(UUID id,int expected,String engine) {
        current(id,expected);var original=attempts.findById(id).orElseThrow();
        if(original.getReviewPlan()==null || original.getReviewPlan().isNull()) throw new ResponseStatusException(HttpStatus.CONFLICT,"legacy_context_unavailable");
        var old=json.convertValue(original.getReviewPlan(),ReviewPlan.class);
        var plan=pipeline.prepare(engine,old.input(),ReviewMapper.toTabs(original.getTabs()),old.candidates());
        var child=new Attempt();child.setId(UUID.randomUUID());child.setUserId(original.getUserId());child.setTaskId(original.getTaskId());
        child.setTabs(original.getTabs());child.setRubricSnapshot(original.getRubricSnapshot());child.setTaskSnapshot(original.getTaskSnapshot());child.setReviewPlan(json.valueToTree(plan));child.setStatus("in_review");
        attempts.saveAndFlush(child);var job=new ReviewJob();job.setId(UUID.randomUUID());job.setAttemptId(child.getId());jobs.save(job);return child.getId();
    }

    private Review current(UUID id,int expected) {
        var r=reviews.lockById(id).orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND));
        if(r.getRevision()!=expected) throw new ResponseStatusException(HttpStatus.CONFLICT,"review_changed");return r;
    }
    private Review replace(Review r,JsonNode result,UUID actor,String reason,String engine) {
        record(r,null,null);r.setRevision(r.getRevision()+1);
        var copy=(ObjectNode)result.deepCopy();copy.put("revision",r.getRevision());copy.put("correctionReason",reason);
        r.setResult(copy);r.setScore(copy.path("grade").path("score").asInt());r.setGradeCode(copy.path("grade").path("code").asInt());r.setEngine(engine);
        reviews.saveAndFlush(r);record(r,actor,reason);return r;
    }
    private JsonNode decode(String value) { try{return json.readTree(value);}catch(Exception e){throw new IllegalStateException(e);} }
}
