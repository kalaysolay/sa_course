package ru.analystgym.review.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * Промпт агента: тексты живут в версиях, здесь только привязка.
 * Плейсхолдеры текста: solution, rubric, task_title, criteria.
 */
@Entity
@Table(name = "prompts")
public class Prompt {

    @Id
    private String key = "";

    @Column(nullable = false)
    private String name = "";

    @Column(nullable = false)
    private String agent = "";

    public Prompt() {
    }

    public String getKey() {
        return key;
    }

    public void setKey(String key) {
        this.key = key;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getAgent() {
        return agent;
    }

    public void setAgent(String agent) {
        this.agent = agent;
    }
}
