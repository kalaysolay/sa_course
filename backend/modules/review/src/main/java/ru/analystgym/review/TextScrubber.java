package ru.analystgym.review;

import java.util.regex.Pattern;

/**
 * PII-скраб решения перед отправкой в LLM: email и телефоны заменяем
 * плейсхолдерами. Минимум по архитектуре; большего mock-данным не нужно.
 */
public final class TextScrubber {

    private static final Pattern EMAIL =
            Pattern.compile("[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}");
    private static final Pattern PHONE =
            Pattern.compile("\\+?\\d[\\d\\s\\-()]{7,}\\d");

    private TextScrubber() {
    }

    public static String scrub(String text) {
        String value = text == null ? "" : text;
        value = EMAIL.matcher(value).replaceAll("[email]");
        value = PHONE.matcher(value).replaceAll("[phone]");
        return value;
    }
}
