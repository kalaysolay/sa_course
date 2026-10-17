package ru.analystgym.review;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

/** Контрольный набор не объявляется экспертной калибровкой; демо не даёт высокую оценку ни одному примеру. */
class ReviewControlSetTest {
    @Test void терминыПротиворечияИИнъекцияНеПолучаютВысокийДемоБалл() throws Exception {
        var json=new ObjectMapper();
        try(var stream=getClass().getResourceAsStream("/review-control-set.json")) {
            var set=json.readTree(stream);var input=json.treeToValue(set.path("task"),ReviewInput.class);
            assertThat(set.path("status").asText()).isEqualTo("requires_methodist_annotation");
            assertThat(set.path("cases").size()).isEqualTo(5);
            for(var item:set.path("cases")) {
                var result=MockReviewProvider.buildReview(input,List.of(new SolutionTab("doc","doc","Решение",item.path("text").asText())),List.of());
                assertThat(result.grade().score()).as(item.path("id").asText()).isLessThanOrEqualTo(45);
                assertThat(result.grade().label()).contains("Демо");
                assertThat(item.path("methodist").isNull()).isTrue();
            }
        }
    }
}
