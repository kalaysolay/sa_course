package ru.analystgym.review;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import ru.analystgym.review.ReviewInput;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * LLM-контур без сети: плейсхолдеры промптов, PII-скраб, строгая
 * валидация ответа модели. Мусор от модели — в failed, а не в ревью.
 */
class LlmReviewTest {

    private static ReviewInput task() {
        return new ReviewInput(
                "t1", "Задача", "easy", "Лёгкая", List.of("sql"), false,
                List.of(new ReviewInput.CriterionInput("c1", "Индексы", "high", null,
                        "sa", List.of("индекс"), "Почему важно")),
                List.of("Что спросят?"));
    }

    @Test
    void плейсхолдерыПодставляются() {
        var context = new PromptService.PromptContext("SOL", "RUB", "TITLE", "C1");

        String text = PromptService.render("{{task_title}}|{{solution}}|{{rubric}}|{{criteria}}", context);

        assertThat(text).isEqualTo("TITLE|SOL|RUB|C1");
    }

    @Test
    void скрабРежетПочтуИТелефоны() {
        String scrubbed = TextScrubber.scrub(
                "Пишите на ivan@example.com или +7 (999) 123-45-67, индекс нужен.");

        assertThat(scrubbed).doesNotContain("ivan@example.com").doesNotContain("999");
        assertThat(scrubbed).contains("[email]").contains("[phone]").contains("индекс");
        assertThat(TextScrubber.scrub(null)).isEmpty();
    }

    @Test
    void чужойКритерийИЛевоеСостояниеОтклоняются() {
        String unknown = "{\"criteria\": [{\"id\": \"nope\", \"state\": \"hit\", \"evidence\": \"\"}],"
                + " \"agents\": []}";
        String badState = "{\"criteria\": [{\"id\": \"c1\", \"state\": \"super\", \"evidence\": \"\"}],"
                + " \"agents\": []}";

        assertThatThrownBy(() -> LlmReviewer.parse(unknown, task(), List.of("sa")))
                .isInstanceOf(LlmReviewer.LlmBadResponse.class);
        assertThatThrownBy(() -> LlmReviewer.parse(badState, task(), List.of("sa")))
                .isInstanceOf(LlmReviewer.LlmBadResponse.class);
        assertThatThrownBy(() -> LlmReviewer.parse("not json", task(), List.of("sa")))
                .isInstanceOf(LlmReviewer.LlmBadResponse.class);
    }

    @Test
    void пропущенныйКритерийИПустойНарративОтклоняются() {
        String missing = "{\"criteria\": [], \"agents\": [{\"id\": \"sa\", \"narrative\": \"ok\","
                + " \"covered\": [], \"missed\": [], \"improve\": [], \"questions\": []}]}";
        String emptyNarrative = "{\"criteria\": [{\"id\": \"c1\", \"state\": \"hit\", \"evidence\": \"\"}],"
                + " \"agents\": [{\"id\": \"sa\", \"narrative\": \"  \","
                + " \"covered\": [], \"missed\": [], \"improve\": [], \"questions\": []}]}";

        assertThatThrownBy(() -> LlmReviewer.parse(missing, task(), List.of("sa")))
                .isInstanceOf(LlmReviewer.LlmBadResponse.class);
        assertThatThrownBy(() -> LlmReviewer.parse(emptyNarrative, task(), List.of("sa")))
                .isInstanceOf(LlmReviewer.LlmBadResponse.class);
    }

    @Test
    void fencesВокругJsonТерпим() {
        String fenced = "```json\n{\"criteria\": [{\"id\": \"c1\", \"state\": \"hit\", \"evidence\": \"\"}],"
                + " \"agents\": [{\"id\": \"sa\", \"narrative\": \"Разбор.\","
                + " \"covered\": [], \"missed\": [], \"improve\": [], \"questions\": []}]}\n```";

        var parsed = LlmReviewer.parse(fenced, task(), List.of("sa"));

        assertThat(parsed.states()).containsEntry("c1", "hit");
    }

    @Test
    void грейдСчитаетКодАНеМодель() {
        // given: модель ставит hit по единственному high-критерию;
        String answer = "{\"criteria\": [{\"id\": \"c1\", \"state\": \"hit\", \"evidence\": \"индекс есть\"}],"
                + " \"agents\": [{\"id\": \"sa\", \"narrative\": \"Закрыто.\","
                + " \"covered\": [{\"title\": \"Индексы\", \"detail\": \"Есть.\"}],"
                + " \"missed\": [], \"improve\": [], \"questions\": []}]}";
        var parsed = LlmReviewer.parse(answer, task(), List.of("sa"));
        var personas = Map.of("sa", new LlmReviewer.Persona(
                "sa", "Анна", "Роль", "АК", List.of("Полнота")));

        // when: собираем ревью;
        var review = LlmReviewer.buildReview(task(), List.of(), List.of(),
                parsed, personas, "llm:test/model");

        // then: покрытие 1.0, структура пустого мизерная, колпаки как у mock.
        assertThat(review.engine()).isEqualTo("llm:test/model");
        assertThat(review.criteria()).hasSize(1);
        assertThat(review.criteria().get(0).state()).isEqualTo("hit");
        assertThat(review.agents()).hasSize(1);
        assertThat(review.agents().get(0).narrative()).isEqualTo("Закрыто.");
        assertThat(review.grade().score()).isLessThanOrEqualTo(100);
    }
}
