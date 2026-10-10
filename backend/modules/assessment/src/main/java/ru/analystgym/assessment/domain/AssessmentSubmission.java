package ru.analystgym.assessment.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import com.fasterxml.jackson.databind.JsonNode;

/**
 * Замер диагностики: ответы + посчитанный результат целиком.
 * История — append-only: повторное прохождение пишет новую строку
 * (UC-D03), прошлые видны списком.
 */
@Entity
@Table(name = "assessment_submissions")
public class AssessmentSubmission {

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    private JsonNode answers;

    @Column(name = "duration_sec", nullable = false)
    private int durationSec;

    @Column(nullable = false, columnDefinition = "NUMERIC")
    private double score;

    @Column(name = "score_rounded", nullable = false)
    private int scoreRounded;

    @Column(name = "grade_id", nullable = false)
    private String gradeId = "";

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    private JsonNode result;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    public AssessmentSubmission() {
    }

    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
        this.id = id;
    }

    public UUID getUserId() {
        return userId;
    }

    public void setUserId(UUID userId) {
        this.userId = userId;
    }

    public JsonNode getAnswers() {
        return answers;
    }

    public void setAnswers(JsonNode answers) {
        this.answers = answers;
    }

    public int getDurationSec() {
        return durationSec;
    }

    public void setDurationSec(int durationSec) {
        this.durationSec = durationSec;
    }

    public double getScore() {
        return score;
    }

    public void setScore(double score) {
        this.score = score;
    }

    public int getScoreRounded() {
        return scoreRounded;
    }

    public void setScoreRounded(int scoreRounded) {
        this.scoreRounded = scoreRounded;
    }

    public String getGradeId() {
        return gradeId;
    }

    public void setGradeId(String gradeId) {
        this.gradeId = gradeId;
    }

    public JsonNode getResult() {
        return result;
    }

    public void setResult(JsonNode result) {
        this.result = result;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
