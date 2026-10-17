package ru.analystgym.review;

/**
 * Вызов языковой модели: на вход — собранный промпт, на выход — сырой
 * текст ответа + учёт токенов. Про схему ответа знает LlmReviewer,
 * клиент лишь возит JSON туда-обратно.
 */
public interface LlmClient {

    LlmAnswer call(LlmRequest request);

    record LlmRequest(String model, String system, String user, int timeoutSeconds, int maxOutputTokens) {
    }

    record LlmAnswer(String text, String model, int inputTokens, int outputTokens) {
    }

    /** Исчерпаны попытки (primary + fallback): воркер кладёт задачу в failed. */
    class LlmFailedException extends RuntimeException {
        private final boolean retryable;

        public LlmFailedException(String message) {
            this(message, true);
        }

        public LlmFailedException(String message, boolean retryable) {
            super(message);
            this.retryable = retryable;
        }

        public boolean retryable() { return retryable; }
    }
}
