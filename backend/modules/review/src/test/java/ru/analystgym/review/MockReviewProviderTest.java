package ru.analystgym.review;

import java.util.List;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

/**
 * Паритет с tasks-mockup/assets/js/review-engine.js.
 * Проверяем веса, пороги грейда и краевые случаи 1-в-1 с JS:
 * пустое решение, покрытие рубрики, числовой вес из админки.
 */
class MockReviewProviderTest {

    /** Синтетическая задача: два критерия с непересекающимися маркерами. */
    private static ReviewInput task() {
        return new ReviewInput(
                "test-task", "Тестовая задача", "easy", "Лёгкая",
                List.of("sql"), true,
                List.of(
                        new ReviewInput.CriterionInput("c1", "Индексы для отчёта", "high", null,
                                "sa", List.of("индекс", "покрывающий индекс"), "Почему важно 1"),
                        new ReviewInput.CriterionInput("c2", "План отката", "low", null,
                                "arch", List.of("откат", "rollback"), "Почему важно 2")),
                List.of("Что спросят на собеседовании?"));
    }

    private static SolutionTab doc(String html) {
        return new SolutionTab("tab1", "doc", "Документ", html);
    }

    @Test
    void emptySolutionGetsMinimalScore() {
        // Пустое решение: JS ставит колпак score<=6 и грейд 1.
        ReviewResult review = MockReviewProvider.buildReview(task(), List.of(), List.of());

        assertThat(review.engine()).isEqualTo("mock-agents/v1");
        assertThat(review.grade().score()).isLessThanOrEqualTo(6);
        assertThat(review.grade().code()).isEqualTo(1);
        assertThat(review.signals().empty()).isTrue();
        assertThat(review.stats().criteriaTotal()).isEqualTo(2);
    }

    @Test
    void matchingKeywordsProduceHitStates() {
        // Два маркера критерия в тексте => hit; один маркер => partial.
        String html = "<p>Для отчёта строим покрывающий индекс по дате, индекс ускоряет выборку.</p>"
                + "<p>Предусмотрен откат миграции.</p>";
        ReviewResult review = MockReviewProvider.buildReview(task(), List.of(doc(html)), List.of());

        assertThat(review.criteria()).hasSize(2);
        assertThat(review.criteria().get(0).state()).isEqualTo("hit");
        assertThat(review.criteria().get(0).matched()).contains("индекс", "покрывающий индекс");
        assertThat(review.criteria().get(0).evidence()).isNotEmpty();
        assertThat(review.criteria().get(1).state()).isEqualTo("partial");
    }

    @Test
    void coverageWeightsHighMoreThanLow() {
        // given: hit по low-критерию и miss по high — покрытие обязано быть низким,
        // иначе веса перепутаны (high=3, low=1).
        ReviewResult.CriterionReview highMiss = new ReviewResult.CriterionReview(
                "h", "t", "high", null, "sa", "", "miss", List.of(), "");
        ReviewResult.CriterionReview lowHit = new ReviewResult.CriterionReview(
                "l", "t", "low", null, "sa", "", "hit", List.of("x"), "");

        // when/then: набрано 1 из 4 => 0.25.
        assertThat(MockReviewProvider.coverageOf(List.of(highMiss, lowHit))).isCloseTo(0.25, within(1e-9));
    }

    @Test
    void numericWeightOverridesLegacy() {
        // given: числовой вес 10 из админки вместо legacy low=1.
        ReviewResult.CriterionReview weighted = new ReviewResult.CriterionReview(
                "w", "t", "low", 10, "sa", "", "hit", List.of("x"), "");
        ReviewResult.CriterionReview plain = new ReviewResult.CriterionReview(
                "p", "t", "low", null, "sa", "", "miss", List.of(), "");

        // when/then: набрано 10 из 11.
        assertThat(MockReviewProvider.coverageOf(List.of(weighted, plain))).isCloseTo(10.0 / 11.0, within(1e-9));
    }

    @Test
    void partialGives55PercentOfWeight() {
        // given: один partial при весе high=3 => 3*0.55/3 = 0.55.
        ReviewResult.CriterionReview partial = new ReviewResult.CriterionReview(
                "p", "t", "high", null, "sa", "", "partial", List.of("x"), "");

        assertThat(MockReviewProvider.coverageOf(List.of(partial))).isCloseTo(0.55, within(1e-9));
    }

    @Test
    void gradeThresholdsMatchMockup() {
        // Пороги из GRADES: 0/26/46/66/85 — граничные значения сверены с JS.
        assertThat(MockReviewProvider.gradeFor(0).code()).isEqualTo(1);
        assertThat(MockReviewProvider.gradeFor(25).code()).isEqualTo(1);
        assertThat(MockReviewProvider.gradeFor(26).code()).isEqualTo(2);
        assertThat(MockReviewProvider.gradeFor(45).code()).isEqualTo(2);
        assertThat(MockReviewProvider.gradeFor(46).code()).isEqualTo(3);
        assertThat(MockReviewProvider.gradeFor(65).code()).isEqualTo(3);
        assertThat(MockReviewProvider.gradeFor(66).code()).isEqualTo(4);
        assertThat(MockReviewProvider.gradeFor(84).code()).isEqualTo(4);
        assertThat(MockReviewProvider.gradeFor(85).code()).isEqualTo(5);
        assertThat(MockReviewProvider.gradeFor(100).code()).isEqualTo(5);
    }

    @Test
    void normalizeHandlesCyrillicAndEntities() {
        // ё→е, теги и сущности режутся как в JS normalize.
        assertThat(MockReviewProvider.normalize("<p>Ёжик &amp; таймаут&nbsp;соединения</p>"))
                .isEqualTo("ежик & таймаут соединения");
    }

    @Test
    void truncateCutsAtWordBoundary() {
        // Обрезка как в JS: хвост после [,;:\s] убирается, добавляется ….
        String text = "слово1, слово2 слово3 слово4";
        String cut = MockReviewProvider.truncate(text, 15);

        assertThat(cut).endsWith("…");
        assertThat(cut.length()).isLessThanOrEqualTo(15);
        assertThat(MockReviewProvider.truncate("коротко", 170)).isEqualTo("коротко");
    }

    @Test
    void recommendationsTieBreakById() {
        // given: два кандидата с равным счётом (по одной общей метке);
        ReviewInput task = new ReviewInput("t0", "Задача", "easy", "Лёгкая",
                List.of("sql"), false, List.of(), List.of());
        List<RecCandidate> candidates = List.of(
                new RecCandidate("b-task", "В", "easy", List.of("sql")),
                new RecCandidate("a-task", "А", "easy", List.of("sql")));

        // when: строим рекомендации;
        List<ReviewResult.Recommendation> recs =
                MockReviewProvider.buildRecommendations(task, candidates);

        // then: при равных баллах побеждает меньший id (как в review-engine.js).
        assertThat(recs).extracting(ReviewResult.Recommendation::id)
                .containsExactly("a-task", "b-task");
    }
}
