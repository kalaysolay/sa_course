package ru.analystgym.review.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import com.fasterxml.jackson.databind.JsonNode;

/**
 * Конфиг агента-ревьюера: фокус построчно (видит студент), модель,
 * участие в пайплайне. Выключенный агент в LLM-контуре скипается
 * (в mock-контуре оба всегда считаются — там детерминизм важнее).
 */
@Entity
@Table(name = "agents")
public class AgentConfig {

    @Id
    private String id;

    @Column(nullable = false)
    private String name = "";

    @Column(nullable = false)
    private String role = "";

    @Column(nullable = false)
    private String initials = "";

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    private JsonNode checks;

    @Column(nullable = false)
    private String model = "";

    @Column(name = "prompt_key", nullable = false)
    private String promptKey = "";

    @Column(nullable = false)
    private boolean enabled = true;

    public AgentConfig() {
    }

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getRole() {
        return role;
    }

    public void setRole(String role) {
        this.role = role;
    }

    public String getInitials() {
        return initials;
    }

    public void setInitials(String initials) {
        this.initials = initials;
    }

    public JsonNode getChecks() {
        return checks;
    }

    public void setChecks(JsonNode checks) {
        this.checks = checks;
    }

    public String getModel() {
        return model;
    }

    public void setModel(String model) {
        this.model = model;
    }

    public String getPromptKey() {
        return promptKey;
    }

    public void setPromptKey(String promptKey) {
        this.promptKey = promptKey;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }
}
