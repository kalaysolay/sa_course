package ru.analystgym.catalog.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * Метка задачи (SQL, REST API, ...). Синонимы нужны поиску и будущей
 * автоподстановке; выключенная метка прячется из фильтров, но остаётся
 * на задачах (см. UC-M07).
 */
@Entity
@Table(name = "tags")
public class Tag {

    @Id
    private String id;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    private String category = "";

    /** Postgres-массив: меток мало, join-таблица здесь — лишний join ради join. */
    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(nullable = false)
    private String[] synonyms = new String[0];

    @Column(nullable = false)
    private boolean active = true;

    /** Публичный для методистской админки; в проде сущность собираем сеттерами. */
    public Tag() {
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

    public String getCategory() {
        return category;
    }

    public void setCategory(String category) {
        this.category = category;
    }

    public String[] getSynonyms() {
        return synonyms;
    }

    public void setSynonyms(String[] synonyms) {
        this.synonyms = synonyms;
    }

    public boolean isActive() {
        return active;
    }

    public void setActive(boolean active) {
        this.active = active;
    }
}
