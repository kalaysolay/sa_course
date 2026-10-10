package ru.analystgym.admin.service;

import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Транслит названия в id задачи 1-в-1 с admin-tasks.js slugify:
 * кириллица по таблице, остальное — как есть, всё не [a-z0-9] — в дефис,
 * обрезка до 40 символов. Совпадение с макетом важно: id из админки
 * и из фронта обязаны давать один результат.
 */
public final class Slug {

    private static final Map<String, String> TRANS = new HashMap<>();

    static {
        String[][] pairs = {
            {"а", "a"}, {"б", "b"}, {"в", "v"}, {"г", "g"}, {"д", "d"},
            {"е", "e"}, {"ё", "e"}, {"ж", "zh"}, {"з", "z"}, {"и", "i"},
            {"й", "y"}, {"к", "k"}, {"л", "l"}, {"м", "m"}, {"н", "n"},
            {"о", "o"}, {"п", "p"}, {"р", "r"}, {"с", "s"}, {"т", "t"},
            {"у", "u"}, {"ф", "f"}, {"х", "h"}, {"ц", "c"}, {"ч", "ch"},
            {"ш", "sh"}, {"щ", "sch"}, {"ъ", ""}, {"ы", "y"}, {"ь", ""},
            {"э", "e"}, {"ю", "yu"}, {"я", "ya"}
        };
        for (String[] pair : pairs) {
            TRANS.put(pair[0], pair[1]);
        }
    }

    private Slug() {
    }

    /** Пустое название даёт пустой слаг — вызывающий отвечает 400. */
    public static String slugify(String value) {
        String lower = value == null ? "" : value.toLowerCase(Locale.ROOT);
        StringBuilder mapped = new StringBuilder();
        for (int i = 0; i < lower.length(); i++) {
            String ch = String.valueOf(lower.charAt(i));
            mapped.append(TRANS.getOrDefault(ch, ch));
        }
        String slug = mapped.toString().replaceAll("[^a-z0-9]+", "-")
                .replaceAll("^-+|-+$", "");
        // Обрезка ровно 40 символов как в JS slice(0, 40) — без подравнивания.
        return slug.length() <= 40 ? slug : slug.substring(0, 40);
    }

    /** Формат id для импорта: только то, что мог выдать slugify. */
    public static boolean isValidId(String id) {
        return id != null && id.matches("[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?");
    }
}
