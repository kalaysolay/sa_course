package ru.analystgym.catalog.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * Уровень сложности задачи (лёгкий/средний/сложный).
 * Справочник правится из админки; удалять уровни нельзя —
 * на них завязаны задачи и план прокачки (см. UC-M07).
 */
@Entity
@Table(name = "levels")
public class Level {

    @Id
    private String id;

    @Column(nullable = false)
    private String name;

    @Column(name = "css_class", nullable = false)
    private String cssClass = "";

    @Column(nullable = false)
    private String profile = "";

    @Column(name = "time_hint", nullable = false)
    private String timeHint = "";

    @Column(nullable = false)
    private String description = "";

    @Column(nullable = false)
    private boolean active = true;

    protected Level() {
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

    public String getCssClass() {
        return cssClass;
    }

    public void setCssClass(String cssClass) {
        this.cssClass = cssClass;
    }

    public String getProfile() {
        return profile;
    }

    public void setProfile(String profile) {
        this.profile = profile;
    }

    public String getTimeHint() {
        return timeHint;
    }

    public void setTimeHint(String timeHint) {
        this.timeHint = timeHint;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public boolean isActive() {
        return active;
    }

    public void setActive(boolean active) {
        this.active = active;
    }
}
