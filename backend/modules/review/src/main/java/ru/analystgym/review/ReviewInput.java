package ru.analystgym.review;

import java.util.List;

/**
 * Входные данные для ревью. Рубрику и кандидатов для рекомендаций
 * передаёт вызывающий модуль (practice): review не ходит в каталог сам
 * (запрет ArchUnit — reviewDoesNotDependOnCatalog).
 */
public record ReviewInput(
        String id,
        String title,
        String level,
        String levelName,
        List<String> tags,
        /** Была ли в стартовых вкладках задачи хоть одна диаграмма. */
        boolean expectsDiagram,
        List<CriterionInput> rubric,
        List<String> interviewQuestions) {

    /** Критерий рубрики как его видит движок (1-в-1 с review-engine.js). */
    public record CriterionInput(
            String id,
            String title,
            /** Легаси-вес: high|mid|low (во встроенных данных только он). */
            String weight,
            /** Числовой вес 1–10 из админки; приоритетнее legacy при наличии. */
            Integer weightValue,
            /** Зона ответственности: sa|arch. */
            String focus,
            List<String> keywords,
            String why) {
    }
}
