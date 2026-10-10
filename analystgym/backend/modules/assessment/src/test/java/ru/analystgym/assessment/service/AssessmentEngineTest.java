package ru.analystgym.assessment.service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

/**
 * Паритет с tasks-mockup/assets/js/scoring.js: формула балла со штрафом
 * за пропуски, пороги грейдов и тиров, сильные/пробелы, план прокачки.
 */
class AssessmentEngineTest {

    /** Банк из двух компетенций: веса 1 и 2, ответы известны. */
    private static List<AssessmentResult.QuestionInput> bank() {
        return List.of(
                new AssessmentResult.QuestionInput("q1", "requirements", 1,
                        "Вопрос 1", List.of("а", "б"), 0, "Разбор 1"),
                new AssessmentResult.QuestionInput("q2", "requirements", 2,
                        "Вопрос 2", List.of("а", "б"), 1, "Разбор 2"),
                new AssessmentResult.QuestionInput("q3", "data", 3,
                        "Вопрос 3", List.of("а", "б"), 0, "Разбор 3"));
    }

    @Test
    void всеВерноДаютСтоИЛида() {
        // given: все ответы верные;
        Map<String, Integer> answers = Map.of("q1", 0, "q2", 1, "q3", 0);

        // when: считаем;
        AssessmentResult result = AssessmentEngine.compute(bank(), answers);

        // then: балл 100, грейд lead, разбор по всем вопросам.
        assertThat(result.score()).isCloseTo(100.0, within(1e-9));
        assertThat(result.scoreRounded()).isEqualTo(100);
        assertThat(result.grade().id()).isEqualTo("lead");
        assertThat(result.correctCount()).isEqualTo(3);
        assertThat(result.detail()).hasSize(3);
        assertThat(result.detail().get(0).correct()).isTrue();
    }

    @Test
    void пропускиШтрафуютсяДвойнойДолей() {
        // given: отвечен верно только q1 (вес 1 из 6), остальное пропуски;
        // rawPct=1/1=100%, но answeredShare=1/3 → score=33.3.
        AssessmentResult result =
                AssessmentEngine.compute(bank(), Map.of("q1", 0));

        assertThat(result.score()).isCloseTo(33.3, within(1e-9));
        assertThat(result.scoreRounded()).isEqualTo(33);
        assertThat(result.grade().id()).isEqualTo("intern");
        // Компетенция без ответов — pct null и пометка «Нет ответов».
        AssessmentResult.CompetencyResult data = result.byCompetency().stream()
                .filter(c -> c.id().equals("data")).findFirst().orElseThrow();
        assertThat(data.pct()).isNull();
        assertThat(data.tier()).isNull();
        assertThat(data.tierLabel()).isEqualTo("Нет ответов");
    }

    @Test
    void тирыИСильныеСПробелами() {
        // given: requirements 1/3 веса верно (33% → bad), data 3/3 (100% → strong);
        Map<String, Integer> answers = Map.of("q1", 0, "q2", 0, "q3", 0);

        AssessmentResult result = AssessmentEngine.compute(bank(), answers);

        AssessmentResult.CompetencyResult req = result.byCompetency().stream()
                .filter(c -> c.id().equals("requirements")).findFirst().orElseThrow();
        assertThat(req.pct()).isEqualTo(33);
        assertThat(req.tier()).isEqualTo("bad");
        assertThat(result.strongest().id()).isEqualTo("data");
        assertThat(result.weakest().id()).isEqualTo("requirements");
        assertThat(result.strengths()).extracting(AssessmentResult.CompetencyResult::id)
                .containsExactly("data");
        assertThat(result.gaps()).extracting(AssessmentResult.CompetencyResult::id)
                .containsExactly("requirements");
    }

    @Test
    void границыГрейдов() {
        assertThat(AssessmentEngine.gradeFor(34).id()).isEqualTo("intern");
        assertThat(AssessmentEngine.gradeFor(35).id()).isEqualTo("junior");
        assertThat(AssessmentEngine.gradeFor(54).id()).isEqualTo("junior");
        assertThat(AssessmentEngine.gradeFor(55).id()).isEqualTo("middle");
        assertThat(AssessmentEngine.gradeFor(74).id()).isEqualTo("middle");
        assertThat(AssessmentEngine.gradeFor(75).id()).isEqualTo("senior");
        assertThat(AssessmentEngine.gradeFor(89).id()).isEqualTo("senior");
        assertThat(AssessmentEngine.gradeFor(90).id()).isEqualTo("lead");
    }

    @Test
    void планБерётЗадачиПодПробелы() {
        // given: пробел — requirements (всё неверно), data закрыта;
        Map<String, Integer> answers = new HashMap<>();
        answers.put("q1", 1);
        answers.put("q2", 0);
        answers.put("q3", 0);
        AssessmentResult result = AssessmentEngine.compute(bank(), answers);
        assertThat(result.gaps()).extracting(AssessmentResult.CompetencyResult::id)
                .contains("requirements");
        var candidates = List.of(
                new AssessmentEngine.PlanCandidate("b-task", "Про данные", "easy", List.of("sql")),
                new AssessmentEngine.PlanCandidate("a-task", "Про требования", "easy", List.of("requirements")));

        // when: строим план;
        var plan = AssessmentEngine.buildPlan(result, candidates, java.util.Set.of(), 4);

        // then: только задача под пробел, решённые уходят вниз.
        assertThat(plan).extracting(AssessmentResult.PlanItem::id).containsExactly("a-task");
        assertThat(plan.get(0).reason()).contains("Требования");
        var planDone = AssessmentEngine.buildPlan(
                result, candidates, java.util.Set.of("a-task"), 4);
        assertThat(planDone.get(0).done()).isTrue();
    }

    @Test
    void планПриРавныхБаллахДетерминирован() {
        // given: две задачи с одинаковым счётом под пробел;
        Map<String, Integer> answers = Map.of("q1", 1, "q2", 0, "q3", 0);
        AssessmentResult result = AssessmentEngine.compute(bank(), answers);
        var candidates = List.of(
                new AssessmentEngine.PlanCandidate("b-task", "В", "easy", List.of("requirements")),
                new AssessmentEngine.PlanCandidate("a-task", "А", "easy", List.of("requirements")));

        List<String> first = new ArrayList<>(AssessmentEngine.buildPlan(result, candidates, java.util.Set.of(), 4)
                .stream().map(AssessmentResult.PlanItem::id).toList());
        List<String> second = new ArrayList<>(AssessmentEngine.buildPlan(result, candidates, java.util.Set.of(), 4)
                .stream().map(AssessmentResult.PlanItem::id).toList());

        assertThat(first).containsExactly("a-task", "b-task");
        assertThat(first).isEqualTo(second);
    }

    @Test
    void ссылкаВКаталогБерётМеткиПробелов() {
        Map<String, Integer> answers = Map.of("q1", 1, "q2", 0, "q3", 0);
        AssessmentResult result = AssessmentEngine.compute(bank(), answers);

        String url = AssessmentEngine.levelCatalogUrl(result);

        assertThat(url).startsWith("catalog.html?tag=");
        assertThat(url).contains("requirements");
    }
}
