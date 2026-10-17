package ru.analystgym.review;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

/** Канонический ответ одного агента: свой критерий, полная рубрика, подтверждение цитатой. */
class LlmReviewTest {
    private static ReviewInput task() {
        return new ReviewInput("t1", "Задача", "easy", "Лёгкая", List.of("sql"), false,
                List.of(new ReviewInput.CriterionInput("c1", "Индексы", "high", null,
                        "sa", List.of("индекс"), "Почему важно")), List.of());
    }

    private static String answer(String criteria, String narrative) {
        return "{\"criteria\":" + criteria + ",\"narrative\":\"" + narrative
                + "\",\"covered\":[],\"missed\":[],\"improve\":[],\"questions\":[]}";
    }

    @Test void плейсхолдерыИПочтаОбрабатываются() {
        var context = new PromptService.PromptContext("SOL", "RUB", "TITLE", "C1");
        assertThat(PromptService.render("{{task_title}}|{{solution}}|{{rubric}}|{{criteria}}", context))
                .isEqualTo("TITLE|SOL|RUB|C1");
        assertThat(TextScrubber.scrub("ivan@example.com +7 (999) 123-45-67 индекс"))
                .contains("[email]", "[phone]", "индекс").doesNotContain("ivan@example.com", "999");
    }

    @Test void чужойКритерийДубликатПропускИНеверноеСостояниеОтклоняются() {
        // Каждое отклонение важно само по себе: нельзя молча зачесть неполный или чужой ответ.
        for (String criteria : List.of("[]", "[{\"id\":\"nope\",\"state\":\"miss\",\"evidence\":\"\"}]",
                "[{\"id\":\"c1\",\"state\":\"super\",\"evidence\":\"\"}]",
                "[{\"id\":\"c1\",\"state\":\"miss\",\"evidence\":\"\"},{\"id\":\"c1\",\"state\":\"miss\",\"evidence\":\"\"}]")) {
            assertThatThrownBy(() -> LlmReviewer.parseAgent(answer(criteria, "Разбор"), task(), "sa", "индекс есть"))
                    .isInstanceOf(LlmReviewer.LlmBadResponse.class);
        }
    }

    @Test void выдуманнаяЦитатаПустойНарративИЛишниеПоляОтклоняются() {
        String valid = answer("[{\"id\":\"c1\",\"state\":\"hit\",\"evidence\":\"индекс есть\"}]", "Разбор");
        for (String invalid : List.of(valid.replace("индекс есть", "неверная цитата"),
                valid.replace("Разбор", "  "), valid.replace("\"covered\":[]", "\"agents\":[],\"covered\":[]"),
                valid + " {}", "not json")) {
            assertThatThrownBy(() -> LlmReviewer.parseAgent(invalid, task(), "sa", "индекс есть"))
                    .isInstanceOf(LlmReviewer.LlmBadResponse.class);
        }
    }

    @Test void плоскийОтветАгентаСобираетсяВРевьюАГрейдСчитаетКод() {
        var parsed = LlmReviewer.parseAgent(answer("[{\"id\":\"c1\",\"state\":\"hit\",\"evidence\":\"индекс есть\"}]", "Закрыто."),
                task(), "sa", "Индекс   есть в таблице");
        var personas = Map.of("sa", new LlmReviewer.Persona("sa", "Анна", "Роль", "АК", List.of("Полнота")));
        var review = LlmReviewer.buildReview(task(), List.of(), List.of(), parsed, personas, "llm:test/model");
        assertThat(parsed.states()).containsExactlyEntriesOf(Map.of("c1", "hit"));
        assertThat(review.agents()).hasSize(1);
        assertThat(review.agents().get(0).narrative()).isEqualTo("Закрыто.");
        assertThat(review.grade().score()).isBetween(0, 100);
    }
}
