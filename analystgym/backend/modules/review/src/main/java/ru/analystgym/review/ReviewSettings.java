package ru.analystgym.review;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Ограничения фиксируются в плане попытки, поэтому изменение env не меняет уже принятую работу. */
@Component
public class ReviewSettings {
    private final ReviewPlan.Limits limits;

    public ReviewSettings(@Value("${review.limits.max-solution-chars:20000}") int solution,
                          @Value("${review.limits.max-input-bytes:64000}") int input,
                          @Value("${review.limits.max-output-tokens:2000}") int output,
                          @Value("${review.limits.token-budget:160000}") int budget,
                          @Value("${review.limits.max-calls:6}") int calls) {
        if (solution < 1 || input < 1 || output < 1 || budget <= output || calls < 1
                || (long) input + output + 1024 > Integer.MAX_VALUE) {
            throw new IllegalArgumentException("Некорректные ограничения ревью");
        }
        limits = new ReviewPlan.Limits(solution, input, output, budget, calls);
    }

    public ReviewPlan.Limits limits() { return limits; }
}
