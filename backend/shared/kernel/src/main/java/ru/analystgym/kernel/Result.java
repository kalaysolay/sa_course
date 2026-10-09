package ru.analystgym.kernel;

/**
 * Простой результат операции: либо успех со значением, либо ошибка с кодом.
 * Исключения — только для действительно исключительных ситуаций (баг, инфра);
 * ожидаемые исходы (не найдено, нет прав, невалидно) возвращаем через Result.
 *
 * @param <T> тип значения при успехе
 */
public final class Result<T> {

    private final T value;
    private final String errorCode;
    private final String message;

    private Result(T value, String errorCode, String message) {
        this.value = value;
        this.errorCode = errorCode;
        this.message = message;
    }

    /** Успешный результат со значением (значение может быть null для операций без ответа). */
    public static <T> Result<T> ok(T value) {
        return new Result<>(value, null, null);
    }

    /** Успех без значения — для команд вроде «отметить пройденным». */
    public static Result<Void> ok() {
        return new Result<>(null, null, null);
    }

    /** Ошибка с машинным кодом (для ветвления и i18n) и человеческим текстом (в логи). */
    public static <T> Result<T> fail(String errorCode, String message) {
        return new Result<>(null, errorCode, message);
    }

    /** true — операция удалась, можно безопасно брать {@link #value()}. */
    public boolean isOk() {
        return errorCode == null;
    }

    /** Значение при успехе; при ошибке всегда null. */
    public T value() {
        return value;
    }

    /** Машинный код ошибки (например, "task.not_found"); при успехе null. */
    public String errorCode() {
        return errorCode;
    }

    /** Человеческое описание ошибки для логов; клиенту отдаём отдельно. */
    public String message() {
        return message;
    }
}
