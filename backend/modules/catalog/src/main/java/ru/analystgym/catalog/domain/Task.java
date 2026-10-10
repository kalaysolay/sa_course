package ru.analystgym.catalog.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.type.SqlTypes;
import com.fasterxml.jackson.databind.JsonNode;

/**
 * Задача каталога: сводка для списка + полные тела (Фаза 2).
 * Полные тела (условие, стартовые вкладки, рубрика, подсказки, вопросы,
 * эталон) приехали миграцией V4 из данных макета; эталон отдаём только
 * через гейт practice-модуля (есть reviewed-попытка), не из каталога.
 */
@Entity
@Table(name = "tasks")
public class Task {

    @Id
    private String id;

    @Column(nullable = false)
    private String title;

    /** Ссылка строкой, не объектом: уровень подтягивает словарь отдельным запросом. */
    @Column(name = "level_id", nullable = false)
    private String levelId;

    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(nullable = false)
    private String[] tags = new String[0];

    @Column(nullable = false)
    private String status = "published";

    @Column(name = "time_min", nullable = false)
    private int timeMin = 30;

    @Column(name = "solved_rate", nullable = false)
    private int solvedRate = 0;

    /** Условие задачи объектом (brief/context/goal/inputs/deliverables/...). */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private JsonNode statement;

    /** Стартовые вкладки редактора (тип doc/plantuml/mermaid + контент). */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "starter_tabs", columnDefinition = "jsonb")
    private JsonNode starterTabs;

    /** Рубрика — контракт оценки (критерии с весами, фокусом и маркерами). */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private JsonNode rubric;

    /** Подсказки (открываются по одной, эталон скрыт до ревью). */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private JsonNode hints;

    /** Вопросы интервьюера по задаче. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "interview_questions", columnDefinition = "jsonb")
    private JsonNode interviewQuestions;

    /** Эталонное решение автора: отдаём только после ревью (гейт в practice). */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "author_solution", columnDefinition = "jsonb")
    private JsonNode authorSolution;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    /** Публичный для тестов и инструментов; в проде сущность собираем сеттерами. */
    public Task() {
    }

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getLevelId() {
        return levelId;
    }

    public void setLevelId(String levelId) {
        this.levelId = levelId;
    }

    public String[] getTags() {
        return tags;
    }

    public void setTags(String[] tags) {
        this.tags = tags;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public int getTimeMin() {
        return timeMin;
    }

    public void setTimeMin(int timeMin) {
        this.timeMin = timeMin;
    }

    public int getSolvedRate() {
        return solvedRate;
    }

    public void setSolvedRate(int solvedRate) {
        this.solvedRate = solvedRate;
    }

    public JsonNode getStatement() {
        return statement;
    }

    public void setStatement(JsonNode statement) {
        this.statement = statement;
    }

    public JsonNode getStarterTabs() {
        return starterTabs;
    }

    public void setStarterTabs(JsonNode starterTabs) {
        this.starterTabs = starterTabs;
    }

    public JsonNode getRubric() {
        return rubric;
    }

    public void setRubric(JsonNode rubric) {
        this.rubric = rubric;
    }

    public JsonNode getHints() {
        return hints;
    }

    public void setHints(JsonNode hints) {
        this.hints = hints;
    }

    public JsonNode getInterviewQuestions() {
        return interviewQuestions;
    }

    public void setInterviewQuestions(JsonNode interviewQuestions) {
        this.interviewQuestions = interviewQuestions;
    }

    public JsonNode getAuthorSolution() {
        return authorSolution;
    }

    public void setAuthorSolution(JsonNode authorSolution) {
        this.authorSolution = authorSolution;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
