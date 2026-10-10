package ru.analystgym.assessment.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import com.fasterxml.jackson.databind.JsonNode;

/**
 * Вопрос диагностики. difficulty 1–3 — одновременно вес в балле
 * (показывается студенту как «вес ×N»). Ответ и разбор студенту
 * не отдаём: список вопросов идёт без них (см. AssessmentService).
 */
@Entity
@Table(name = "questions")
public class Question {

    @Id
    private String id;

    @Column(nullable = false)
    private String competency;

    @Column(nullable = false)
    private int difficulty = 1;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String question;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    private JsonNode options;

    @Column(nullable = false)
    private int answer;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String explain = "";

    @Column(nullable = false)
    private boolean active = true;

    public Question() {
    }

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getCompetency() {
        return competency;
    }

    public void setCompetency(String competency) {
        this.competency = competency;
    }

    public int getDifficulty() {
        return difficulty;
    }

    public void setDifficulty(int difficulty) {
        this.difficulty = difficulty;
    }

    public String getQuestion() {
        return question;
    }

    public void setQuestion(String question) {
        this.question = question;
    }

    public JsonNode getOptions() {
        return options;
    }

    public void setOptions(JsonNode options) {
        this.options = options;
    }

    public int getAnswer() {
        return answer;
    }

    public void setAnswer(int answer) {
        this.answer = answer;
    }

    public String getExplain() {
        return explain;
    }

    public void setExplain(String explain) {
        this.explain = explain;
    }

    public boolean isActive() {
        return active;
    }

    public void setActive(boolean active) {
        this.active = active;
    }
}
