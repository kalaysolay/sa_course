package ru.analystgym.review;

/**
 * Вызов языковой модели: на вход — собранный промпт, на выход — сырой
 * текст ответа + учёт токенов. Про схему ответа знает LlmReviewer,
 * клиент лишь возит JSON туда-обратно.
 */
public interface LlmClient {

    LlmAnswer call(LlmRequest request);

    record LlmRequest(String model, String system, String user, int timeoutSeconds) {
    }

    record LlmAnswer(String text, String model, int inputTokens, int outputTokens) {
    }

    /** Исчерпаны попытки (primary + fallback): воркер кладёт задачу в failed. */
    class LlmFailedException extends RuntimeException {
        public LlmFailedException(String message) {
            super(message);
        }
    }
}
