package ru.analystgym.admin.service;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import ru.analystgym.admin.web.AdminDto.CriterionDto;
import ru.analystgym.admin.web.AdminDto.QuestionDto;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Чистые правила админки: транслит id, переходы статусов, валидация
 * рубрики и вопросов. Совпадение slugify с макетом — на примерах из гайда.
 */
class AdminValidationTest {

    @Test
    void транслитСовпадаетСМакетом() {
        // Пример из admin-guide: «Идемпотентное списание» → idempotentnoe-spisanie.
        assertThat(Slug.slugify("Идемпотентное списание")).isEqualTo("idempotentnoe-spisanie");
        assertThat(Slug.slugify("  Задача №1: Kafka & retry! ")).isEqualTo("zadacha-1-kafka-retry");
        assertThat(Slug.slugify("")).isEmpty();
        assertThat(Slug.slugify("Ёжик в тумане")).isEqualTo("ezhik-v-tumane");
        assertThat(Slug.isValidId("int-timeouts")).isTrue();
        assertThat(Slug.isValidId("Bad id!")).isFalse();
    }

    @Test
    void статусыИдутПоЦепочке() {
        // UC-M04: draft → review → published → archived, плюс возврат на доработку.
        assertThat(TaskAdminService.TRANSITIONS.get("draft"))
                .containsExactly("draft", "review");
        assertThat(TaskAdminService.TRANSITIONS.get("review"))
                .containsExactly("review", "draft", "published");
        assertThat(TaskAdminService.TRANSITIONS.get("published"))
                .containsExactly("published", "archived");
        // Публикация мимо ревью запрещена, удаления из цепочки нет.
        assertThat(TaskAdminService.TRANSITIONS.get("draft")).doesNotContain("published");
    }

    @Test
    void рубрикаТребуетВесФокусИМаркеры() {
        CriterionDto good = new CriterionDto("c1", "Таймауты", 5, "arch", false,
                List.of("таймаут", "connection"), "Почему важно");

        var node = TaskAdminService.rubricNode(List.of(good));

        assertThat(node.size()).isEqualTo(1);
        assertThat(node.get(0).get("weightValue").asInt()).isEqualTo(5);
        assertThatThrownBy(() -> TaskAdminService.rubricNode(List.of(
                new CriterionDto("c2", "Без маркеров", 5, "sa", false, List.of(), ""))))
                .isInstanceOf(ResponseStatusException.class)
                .matches(e -> ((ResponseStatusException) e).getStatusCode() == HttpStatus.BAD_REQUEST);
        assertThatThrownBy(() -> TaskAdminService.rubricNode(List.of(
                new CriterionDto("c3", "Плохой вес", 11, "sa", false, List.of("x"), ""))))
                .isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> TaskAdminService.rubricNode(List.of(
                new CriterionDto("c4", "Чужой фокус", 5, "pm", false, List.of("x"), ""))))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void вопросыВалидируютсяСтрого() {
        QuestionDto good = new QuestionDto("q-req-99", "requirements", 2,
                "Что такое user story и чем она отличается от задачи?", List.of("а", "б", "в"),
                1, "Разбор", true);

        // Хороший проходит, плохой id/компетенция/ответ — 400.
        QuestionAdminService.validate(good, true);
        assertThatThrownBy(() -> QuestionAdminService.validate(
                new QuestionDto("bad id!", "requirements", 2, "Вопросы вопросы вопросы?",
                        List.of("а", "б"), 0, "", true), true))
                .isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> QuestionAdminService.validate(
                new QuestionDto("q-req-99", "unknown", 2, "Вопросы вопросы вопросы?",
                        List.of("а", "б"), 0, "", true), true))
                .isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> QuestionAdminService.validate(
                new QuestionDto("q-req-99", "requirements", 2, "Вопросы вопросы вопросы?",
                        List.of("а", "б"), 5, "", true), true))
                .isInstanceOf(ResponseStatusException.class);
    }
}
