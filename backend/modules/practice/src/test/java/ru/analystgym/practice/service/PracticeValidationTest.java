package ru.analystgym.practice.service;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import ru.analystgym.practice.web.PracticeDto.TabDto;
import ru.analystgym.review.ReviewInput;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Чистые проверки practice без Spring-контекста и БД:
 * валидация вкладок и маппинг рубрики в движок.
 */
class PracticeValidationTest {

    @Test
    void emptyTabsAllowed() {
        // E1 из UC-S03: пустое решение отправить можно (оценят минимально).
        PracticeService.validateTabs(null);
        PracticeService.validateTabs(List.of());
    }

    @Test
    void badTabTypeRejected() {
        TabDto bad = new TabDto("t1", "excel", "Лист", "данные");

        assertThatThrownBy(() -> PracticeService.validateTabs(List.of(bad)))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void tooManyTabsRejected() {
        var tabs = new java.util.ArrayList<TabDto>();
        for (int i = 0; i < 21; i++) {
            tabs.add(new TabDto("t" + i, "doc", "Док", "<p>x</p>"));
        }

        assertThatThrownBy(() -> PracticeService.validateTabs(tabs))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void rubricMappingKeepsWeightsAndFocus() {
        // given: рубрика в форме V4-сида (legacy-вес + числовой вес + critical);
        var mapper = new ObjectMapper();
        var rubric = mapper.createArrayNode();
        var criterion = mapper.createObjectNode();
        criterion.put("id", "c1");
        criterion.put("title", "Таймауты");
        criterion.put("weight", "high");
        criterion.put("weightValue", 9);
        criterion.put("focus", "arch");
        criterion.putArray("keywords").add("таймаут").add("connection");
        criterion.put("why", "Без таймаутов поток висит.");
        criterion.put("critical", true);
        rubric.add(criterion);

        // when: маппим в движок (critical движком игнорируется, как в JS);
        List<ReviewInput.CriterionInput> mapped = ReviewMapper.mapRubric(rubric);

        // then: веса, фокус и маркеры на месте.
        assertThat(mapped).hasSize(1);
        assertThat(mapped.get(0).weight()).isEqualTo("high");
        assertThat(mapped.get(0).weightValue()).isEqualTo(9);
        assertThat(mapped.get(0).focus()).isEqualTo("arch");
        assertThat(mapped.get(0).keywords()).containsExactly("таймаут", "connection");
    }

    @Test
    void brokenRubricMapsToEmpty() {
        // Битый JSONB не должен ронять ревью: пустая рубрика даёт score колпаком.
        assertThat(ReviewMapper.mapRubric(null)).isEmpty();
        assertThat(ReviewMapper.mapRubric(JsonNodeFactory.instance.objectNode())).isEmpty();
        assertThat(ReviewMapper.expectsDiagram(null)).isFalse();
    }
}
