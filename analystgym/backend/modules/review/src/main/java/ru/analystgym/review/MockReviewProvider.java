package ru.analystgym.review;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;
import java.util.regex.Pattern;

/**
 * Mock-провайдер ревью — порт tasks-mockup/assets/js/review-engine.js 1-в-1.
 * Веса, пороги грейда, формулы покрытия и все тексты агентов совпадают
 * с макетом; критерий Фазы 2 — совпадение с макетом на контрольных решениях.
 * Грейд считает код (веса рубрики), а не модель (ADR-04).
 *
 * <p>Правила портирования: порядок нормализации, константы и тексты
 * сверены с review-engine.js построчно. Комментарии ниже отмечают
 * соответствие строкам JS, а не объясняют очевидное.</p>
 */
public final class MockReviewProvider {

    /** Идентификатор движка — тот же, что ставит макет (виден в карточке ревью). */
    public static final String ENGINE = "mock-agents/v1";

    private static final Map<String, Integer> WEIGHTS = Map.of("high", 3, "mid", 2, "low", 1);
    private static final Map<String, Double> STATE_POINTS = Map.of("hit", 1.0, "partial", 0.55, "miss", 0.0);

    /** Шкала качества: последний грейд, чей min <= score. Пороги 0/26/46/66/85. */
    private record GradeDef(int code, int min, String label, String tone, String headline) {
    }

    private static final List<GradeDef> GRADES = List.of(
            new GradeDef(1, 0, "Задача не решена", "bad", "Решение не отвечает задаче"),
            new GradeDef(2, 26, "Слабое решение", "bad", "Ключевые аспекты задачи не раскрыты"),
            new GradeDef(3, 46, "Решение с пробелами", "warn", "Направление верное, но решение неполное"),
            new GradeDef(4, 66, "Хорошее решение", "ok", "Решение рабочее, есть что усилить"),
            new GradeDef(5, 85, "Сильное решение", "accent", "Решение уровня уверенного сеньора"));

    private record Persona(String id, String name, String role, String initials, List<String> checks) {
    }

    private static final Map<String, Persona> AGENTS = Map.of(
            "sa", new Persona("sa", "Анна Ковалёва",
                    "Системный аналитик · 11 лет в финтехе и e-commerce", "АК", List.of(
                            "Полнота: сценарии, роли, данные, ограничения",
                            "Альтернативные и граничные случаи",
                            "Измеримость: метрики и критерии приёмки",
                            "Понятно ли это заказчику и разработке",
                            "Стейкхолдеры, согласования, процесс")),
            "arch", new Persona("arch", "Дмитрий Лазарев",
                    "Архитектор интеграционных решений · 14 лет в высоконагруженных системах", "ДЛ", List.of(
                            "Реализуемость и стоимость предложенного",
                            "Модель данных и согласованность",
                            "Надёжность: таймауты, ретраи, отказы",
                            "Производительность под заявленную нагрузку",
                            "Эксплуатация: логи, метрики, откат")));

    private static final Pattern TAG_PATTERN = Pattern.compile("<[^>]*>");
    private static final Pattern WS_PATTERN = Pattern.compile("\\s+");
    private static final Pattern BR_PATTERN = Pattern.compile("(?i)<br\\s*/?>");
    private static final Pattern BLOCK_CLOSE_PATTERN = Pattern.compile("(?i)</(p|div|li|h[1-6]|tr)>");
    private static final Pattern MULTI_NL_PATTERN = Pattern.compile("\n{3,}");
    private static final Pattern H_OPEN_PATTERN = Pattern.compile("(?i)<h[1-6]");
    private static final Pattern LI_PATTERN = Pattern.compile("(?i)<li");
    private static final Pattern DIGIT_PATTERN = Pattern.compile("\\d");
    private static final Pattern TRAIL_PATTERN = Pattern.compile("[,;:\\s][^,;:\\s]*$");
    private static final Pattern TITLE_TAIL_PATTERN = Pattern.compile("\\s*[:—-]\\s*.*$");

    private MockReviewProvider() {
    }

    /* ---------- утилиты текста (normalize/plainFromHtml/sentencesOf/...) ---------- */

    static String normalize(String text) {
        String value = text == null ? "" : text;
        value = value.toLowerCase(Locale.ROOT);
        value = value.replace("ё", "е");
        value = TAG_PATTERN.matcher(value).replaceAll(" ");
        value = value.replace("&nbsp;", " ")
                .replace("&amp;", "&")
                .replace("&lt;", "<")
                .replace("&gt;", ">")
                .replace("&quot;", "\"");
        value = WS_PATTERN.matcher(value).replaceAll(" ").trim();
        return value;
    }

    static String plainFromHtml(String html) {
        String value = html == null ? "" : html;
        value = BR_PATTERN.matcher(value).replaceAll("\n");
        value = BLOCK_CLOSE_PATTERN.matcher(value).replaceAll("\n");
        value = TAG_PATTERN.matcher(value).replaceAll("");
        value = value.replace("&nbsp;", " ")
                .replace("&amp;", "&")
                .replace("&lt;", "<")
                .replace("&gt;", ">")
                .replace("&quot;", "\"");
        value = MULTI_NL_PATTERN.matcher(value).replaceAll("\n\n").trim();
        return value;
    }

    static List<String> sentencesOf(String text) {
        String value = text == null ? "" : text;
        value = WS_PATTERN.matcher(value).replaceAll(" ");
        List<String> result = new ArrayList<>();
        for (String part : value.split("[.!?;\\n]+")) {
            String sentence = part.trim();
            if (sentence.length() > 12) {
                result.add(sentence);
            }
        }
        return result;
    }

    static int countWords(String text) {
        String value = text == null ? "" : text.trim();
        if (value.isEmpty()) {
            return 0;
        }
        return value.split("\\s+").length;
    }

    static String truncate(String text, int max) {
        String value = text == null ? "" : text.trim();
        if (value.length() <= max) {
            return value;
        }
        // Отрезаем по границе слова как в JS: висячий хвост "[,;:\s]..." убираем.
        String cut = value.substring(0, max - 1);
        cut = TRAIL_PATTERN.matcher(cut).replaceAll("");
        return cut + "…";
    }

    static <T> List<T> pick(List<T> list, int count, int offset) {
        List<T> source = list == null ? List.of() : new ArrayList<>(list);
        int start = offset % Math.max(source.size(), 1);
        List<T> result = new ArrayList<>();
        for (int i = 0; i < source.size() && result.size() < count; i++) {
            result.add(source.get((start + i) % source.size()));
        }
        return result;
    }

    /* ---------- извлечение содержимого решения (collectSolution) ---------- */

    static final class Solution {
        final List<SolutionTab> tabs;
        final String docText;
        final String diagramText;
        final String fullText;
        final String normalized;
        final String docNormalized;
        final int words;
        final int totalChars;
        final int docTabs;
        final int diagramTabs;
        final int headings;
        final int htmlHeadings;
        final int listItems;

        Solution(List<SolutionTab> tabs, String docText, String diagramText, String fullText,
                 String normalized, String docNormalized, int words, int totalChars,
                 int docTabs, int diagramTabs, int headings, int htmlHeadings, int listItems) {
            this.tabs = tabs;
            this.docText = docText;
            this.diagramText = diagramText;
            this.fullText = fullText;
            this.normalized = normalized;
            this.docNormalized = docNormalized;
            this.words = words;
            this.totalChars = totalChars;
            this.docTabs = docTabs;
            this.diagramTabs = diagramTabs;
            this.headings = headings;
            this.htmlHeadings = htmlHeadings;
            this.listItems = listItems;
        }
    }

    static Solution collectSolution(List<SolutionTab> tabs) {
        List<SolutionTab> list = tabs == null ? List.of() : tabs;
        List<String> docParts = new ArrayList<>();
        List<String> diagramParts = new ArrayList<>();
        StringBuilder docHtml = new StringBuilder();
        for (SolutionTab tab : list) {
            String content = tab == null || tab.content() == null ? "" : tab.content();
            if (content.trim().isEmpty()) {
                continue;
            }
            if ("doc".equals(tab.type())) {
                docParts.add(plainFromHtml(content));
                docHtml.append(content);
            } else {
                diagramParts.add(content);
            }
        }
        String docText = String.join("\n", docParts);
        String diagramText = String.join("\n", diagramParts);
        String fullText = docText + "\n" + diagramText;
        int docTabs = 0;
        int diagramTabs = 0;
        for (SolutionTab tab : list) {
            String content = tab == null || tab.content() == null ? "" : tab.content();
            if (content.trim().isEmpty()) {
                continue;
            }
            if ("doc".equals(tab.type())) {
                docTabs++;
            } else {
                diagramTabs++;
            }
        }
        // Строки длиной <=80 (как /^.{0,80}$/gm в JS); дальше не используется,
        // но собираем для паритета структуры.
        int headings = 0;
        for (String line : docText.split("\n", -1)) {
            if (line.length() <= 80) {
                headings++;
            }
        }
        String html = docHtml.toString();
        int htmlHeadings = countMatches(H_OPEN_PATTERN, html);
        int listItems = countMatches(LI_PATTERN, html);
        return new Solution(list, docText, diagramText, fullText,
                normalize(fullText), normalize(docText), countWords(docText), fullText.length(),
                docTabs, diagramTabs, headings, htmlHeadings, listItems);
    }

    private static int countMatches(Pattern pattern, String text) {
        int count = 0;
        var matcher = pattern.matcher(text);
        while (matcher.find()) {
            count++;
        }
        return count;
    }

    /* ---------- проверка критерия и покрытие ---------- */

    static ReviewResult.CriterionReview evaluateCriterion(ReviewInput.CriterionInput criterion, Solution solution) {
        List<String> keywords = new ArrayList<>();
        if (criterion.keywords() != null) {
            for (String keyword : criterion.keywords()) {
                String norm = normalize(keyword);
                if (!norm.isEmpty()) {
                    keywords.add(norm);
                }
            }
        }
        List<String> matched = new ArrayList<>();
        for (String keyword : keywords) {
            if (matched.contains(keyword)) {
                continue;
            }
            for (String haystack : new String[]{solution.normalized, solution.docNormalized}) {
                if (haystack != null && haystack.contains(keyword)) {
                    matched.add(keyword);
                    break;
                }
            }
        }
        String state = "miss";
        if (matched.size() >= 2) {
            state = "hit";
        } else if (matched.size() == 1) {
            state = "partial";
        }
        String evidence = "";
        if (!matched.isEmpty()) {
            String base = solution.docText.isEmpty() ? solution.fullText : solution.docText;
            for (String sentence : sentencesOf(base)) {
                String normSentence = normalize(sentence);
                boolean hit = false;
                for (String keyword : matched) {
                    if (normSentence.contains(keyword)) {
                        hit = true;
                        break;
                    }
                }
                if (hit) {
                    evidence = truncate(sentence, 170);
                    break;
                }
            }
        }
        return new ReviewResult.CriterionReview(
                criterion.id(), criterion.title(),
                criterion.weight() == null ? "mid" : criterion.weight(),
                criterion.weightValue(),
                criterion.focus() == null ? "sa" : criterion.focus(),
                criterion.why() == null ? "" : criterion.why(),
                state, List.copyOf(matched), evidence);
    }

    static int weightOf(String weight, Integer weightValue) {
        if (weightValue != null && weightValue >= 1 && weightValue <= 10) {
            return weightValue;
        }
        return WEIGHTS.getOrDefault(weight, 2);
    }

    static double coverageOf(List<ReviewResult.CriterionReview> results) {
        double earned = 0;
        double total = 0;
        for (ReviewResult.CriterionReview item : results) {
            int weight = weightOf(item.weight(), item.weightValue());
            total += weight;
            earned += weight * STATE_POINTS.getOrDefault(item.state(), 0.0);
        }
        if (total == 0) {
            return 0;
        }
        return earned / total;
    }

    /* ---------- структурные сигналы ---------- */

    static ReviewResult.Signals collectSignals(Solution solution) {
        String text = solution.normalized;
        return new ReviewResult.Signals(
                DIGIT_PATTERN.matcher(text).find()
                        && hasAny(text, List.of("сек", "мин", "час", "%", "млн", "тыс", "rps", "мс", "дн", "строк", "руб")),
                hasAny(text, List.of("альтернативн", "если не", "в случае", "отказ", "ошибк", "граничн",
                        "не прошел", "не прошёл", "fallback", "деград")),
                solution.htmlHeadings >= 2 || solution.listItems >= 4,
                solution.diagramTabs > 0 && solution.diagramText.trim().length() > 60,
                hasAny(text, List.of("сверк", "провер", "валидац", "тест", "критер", "приемк", "приёмк", "reconcil")),
                hasAny(text, List.of("риск", "откат", "rollback", "деградац", "точка невозврата", "план б")),
                hasAny(text, List.of("стейкхолдер", "заказчик", "согласов", "владел", "бизнес", "поддержк", "пользовател")),
                hasAny(text, List.of("метрик", "kpi", "p95", "p99", "мониторинг", "алерт", "dash", "дашборд")),
                solution.words < 80,
                solution.totalChars < 40);
    }

    private static boolean hasAny(String text, List<String> keywords) {
        for (String keyword : keywords) {
            if (text.contains(normalize(keyword))) {
                return true;
            }
        }
        return false;
    }

    /* ---------- шкала и структура ---------- */

    static ReviewResult.Grade gradeFor(int score) {
        GradeDef current = GRADES.get(0);
        for (GradeDef grade : GRADES) {
            if (score >= grade.min()) {
                current = grade;
            }
        }
        // Счёт в грейд подставляет вызывающий код (buildReview знает score).
        return new ReviewResult.Grade(current.code(), current.label(), current.headline(), current.tone(), score);
    }

    static double structureScore(Solution solution, boolean expectsDiagram, ReviewResult.Signals signals) {
        int words = solution.words;
        double volume = 0.1;
        if (words >= 400) {
            volume = 1;
        } else if (words >= 250) {
            volume = 0.9;
        } else if (words >= 150) {
            volume = 0.75;
        } else if (words >= 80) {
            volume = 0.5;
        } else if (words >= 40) {
            volume = 0.3;
        }
        double diagram = expectsDiagram ? 0.35 : 0.8;
        if (signals.diagram()) {
            diagram = 1;
        }
        double score = 0.55 * volume + 0.45 * diagram;
        if (signals.numbers()) {
            score += 0.06;
        }
        if (signals.alternatives()) {
            score += 0.06;
        }
        if (signals.structure()) {
            score += 0.04;
        }
        return Math.max(0, Math.min(1, score));
    }

    static List<ReviewResult.CriterionReview> agentCriteria(
            List<ReviewResult.CriterionReview> all, String agentId) {
        List<ReviewResult.CriterionReview> own = new ArrayList<>();
        List<ReviewResult.CriterionReview> others = new ArrayList<>();
        for (ReviewResult.CriterionReview item : all) {
            if (agentId.equals(item.focus())) {
                own.add(item);
            } else {
                others.add(item);
            }
        }
        if (own.size() >= 3) {
            return List.copyOf(own);
        }
        List<ReviewResult.CriterionReview> result = new ArrayList<>(own);
        result.addAll(pick(others, 3 - own.size(), "sa".equals(agentId) ? 1 : 0));
        return List.copyOf(result);
    }

    static String shortTitle(String title, int max) {
        String value = title == null ? "" : title;
        value = TITLE_TAIL_PATTERN.matcher(value).replaceAll("");
        return truncate(value, max);
    }

    /* ---------- тексты агентов ---------- */

    static List<ReviewResult.Covered> buildCovered(
            List<ReviewResult.CriterionReview> criteria, Solution solution,
            ReviewResult.Signals signals, String agentId) {
        List<ReviewResult.Covered> items = new ArrayList<>();
        for (ReviewResult.CriterionReview criterion : criteria) {
            if ("hit".equals(criterion.state())) {
                String detail = criterion.evidence().isEmpty() ? "Тема раскрыта в решении." : criterion.evidence();
                items.add(new ReviewResult.Covered(criterion.title(), detail, criterion.weight()));
            }
        }
        if ("arch".equals(agentId) && signals.diagram()) {
            items.add(new ReviewResult.Covered("Есть схема, а только текст",
                    "Диаграмм в решении: " + solution.diagramTabs
                            + ". Визуализация снимает половину вопросов на собеседовании.",
                    "low"));
        }
        if ("sa".equals(agentId) && signals.numbers()) {
            items.add(new ReviewResult.Covered("Присутствуют конкретные величины",
                    "Числа вместо «быстро» и «много» — то, чего ждут от аналитика на техническом экране.",
                    "low"));
        }
        if ("sa".equals(agentId) && signals.alternatives()) {
            items.add(new ReviewResult.Covered("Разобраны не только успешные сценарии",
                    "Видно внимание к ошибкам и альтернативным веткам — частая причина провала на собеседованиях.",
                    "low"));
        }
        return List.copyOf(items);
    }

    static List<ReviewResult.Missed> buildMissed(
            List<ReviewResult.CriterionReview> criteria, ReviewResult.Signals signals,
            String agentId, Solution solution) {
        List<ReviewResult.Missed> items = new ArrayList<>();
        for (ReviewResult.CriterionReview criterion : criteria) {
            if (!"hit".equals(criterion.state())) {
                items.add(new ReviewResult.Missed(criterion.title(), criterion.state(),
                        "high".equals(criterion.weight()), criterion.why()));
            }
        }
        if ("sa".equals(agentId) && signals.tooShort() && solution.words > 0) {
            items.add(new ReviewResult.Missed("Объём решения не соответствует уровню задачи", "partial", false,
                    "В документе около " + solution.words
                            + " слов. На собеседовании такой ответ сочтут поверхностью: не видно ни сценариев, ни обоснований."));
        }
        if ("sa".equals(agentId) && !signals.people()) {
            items.add(new ReviewResult.Missed("Не названы люди и роли: кто согласует, кто владеет решением",
                    "miss", false,
                    "Половина аналитической работы — договориться. Без ролей и владельцев решение остаётся на бумаге."));
        }
        if ("arch".equals(agentId) && !signals.diagram()) {
            items.add(new ReviewResult.Missed("Нет ни одной схемы", "miss", false,
                    "Текст без диаграммы заставляет интервьюера переспрашивать и сомневаться, что поток действительно продуман."));
        }
        if ("arch".equals(agentId) && !signals.risks()) {
            items.add(new ReviewResult.Missed("Не описаны отказ и план отката", "miss", false,
                    "Архитектора всегда спрашивают: «а что сломается и как вернём назад». Это дешевле ответить сразу."));
        }
        if ("arch".equals(agentId) && !signals.numbers()) {
            items.add(new ReviewResult.Missed("Нет численных оценок: сроки, нагрузка, таймаут, объём",
                    "miss", false,
                    "Без цифр невозможно проверить реализуемость. «Быстро» и «надёжно» на техническом экране не засчитываются."));
        }
        if ("arch".equals(agentId) && !signals.validation()) {
            items.add(new ReviewResult.Missed("Не описано, как проверяем корректность", "miss", false,
                    "Сверки, тесты и критерии приёмки — то, что отличает проектную работу от рассуждения."));
        }
        return List.copyOf(items);
    }

    static String buildNarrative(
            List<ReviewResult.CriterionReview> criteria, ReviewResult.Signals signals,
            String agentId, double coverage, ReviewInput task) {
        List<ReviewResult.CriterionReview> hits = new ArrayList<>();
        List<ReviewResult.CriterionReview> misses = new ArrayList<>();
        List<ReviewResult.CriterionReview> partials = new ArrayList<>();
        for (ReviewResult.CriterionReview criterion : criteria) {
            switch (criterion.state()) {
                case "hit" -> hits.add(criterion);
                case "miss" -> misses.add(criterion);
                default -> partials.add(criterion);
            }
        }
        ReviewResult.CriterionReview criticalMiss = null;
        for (ReviewResult.CriterionReview miss : misses) {
            if ("high".equals(miss.weight())) {
                criticalMiss = miss;
                break;
            }
        }
        if (criticalMiss == null && !misses.isEmpty()) {
            criticalMiss = misses.get(0);
        }
        if (criticalMiss == null) {
            for (ReviewResult.CriterionReview partial : partials) {
                if ("high".equals(partial.weight())) {
                    criticalMiss = partial;
                    break;
                }
            }
        }
        ReviewResult.CriterionReview bestHit = null;
        for (ReviewResult.CriterionReview hit : hits) {
            if ("high".equals(hit.weight())) {
                bestHit = hit;
                break;
            }
        }
        if (bestHit == null && !hits.isEmpty()) {
            bestHit = hits.get(0);
        }
        List<String> parts = new ArrayList<>();
        if (coverage >= 0.8) {
            parts.add("Решение закрывает задачу: из " + criteria.size()
                    + " критериев моей зоны ответственности полностью закрыты " + hits.size() + ".");
        } else if (coverage >= 0.55) {
            parts.add("Решение рабочее, но не полное: закрыты " + hits.size() + " из " + criteria.size()
                    + " критериев, ещё " + partials.size() + " упомянуты без проработки.");
        } else if (coverage >= 0.3) {
            parts.add("Вижу верное направление мысли, но проработка недостаточная: " + hits.size()
                    + " из " + criteria.size() + " критериев закрыты, " + misses.size()
                    + " не затронуты вовсе.");
        } else {
            parts.add("Как ответ на задачу это пока не читается: закрыты " + hits.size() + " из "
                    + criteria.size() + " критериев, основные требования условия не раскрыты.");
        }
        if (bestHit != null) {
            String proof = bestHit.evidence().isEmpty()
                    ? "Этот аспект виден по структуре ответа."
                    : "Подтверждение в тексте: «" + truncate(bestHit.evidence(), 130) + "».";
            parts.add("Сильнее всего — «" + shortTitle(bestHit.title(), 70) + "». " + proof);
        }
        if (criticalMiss != null) {
            parts.add("Главный пробел — «" + shortTitle(criticalMiss.title(), 70) + "». " + criticalMiss.why());
        }
        if ("sa".equals(agentId)) {
            if (coverage >= 0.7) {
                parts.add("На собеседовании с таким ответом я бы перешёл к уточняющим вопросам, а не к объяснению базы.");
            } else if (!signals.alternatives()) {
                parts.add("Отдельно отмечу: не разобраны альтернативные сценарии. Именно на них интервьюер проверяет, работали ли вы с реальными системами, а не с учебным примером.");
            } else {
                parts.add("Не хватает связки «требование → критерий приёмки → как проверяем». Без неё разработка додумает детали сама.");
            }
        } else {
            if (coverage >= 0.7) {
                parts.add("Технически решение реализуемо. Дальше я бы спрашивал про эксплуатацию: что мониторим и как откатываемся.");
            } else if (!signals.risks()) {
                parts.add("Слабое место — поведение при отказе. Любая интеграция рано или поздно деградирует, и ответ «такого не будет» на собеседовании не принимается.");
            } else {
                parts.add("Не хватает связи с данными и нагрузкой: без них предложенная схема может не выдержать продакшена.");
            }
        }
        if (coverage >= 0.8) {
            parts.add("Итог по моей роли: решение задачу "
                    + ("hard".equals(task.level()) ? "закрывает на уровне сильного сеньора" : "закрывает") + ".");
        } else if (coverage >= 0.55) {
            parts.add("Итог по моей роли: решение частично решает задачу, но в продакшене потребует доработки по перечисленным пунктам.");
        } else {
            parts.add("Итог по моей роли: в текущем виде задачу это не решает — слишком много непрояснённого остаётся на разработку и на заказчика.");
        }
        return String.join(" ", parts);
    }

    static List<ReviewResult.Improve> buildImprove(
            List<ReviewResult.CriterionReview> criteria, ReviewResult.Signals signals,
            String agentId, ReviewInput task) {
        List<ReviewResult.CriterionReview> open = new ArrayList<>();
        for (ReviewResult.CriterionReview criterion : criteria) {
            if (!"hit".equals(criterion.state())) {
                open.add(criterion);
            }
        }
        open.sort((a, b) -> Integer.compare(
                weightOf(b.weight(), b.weightValue()), weightOf(a.weight(), a.weightValue())));
        List<ReviewResult.Improve> items = new ArrayList<>();
        for (ReviewResult.CriterionReview criterion : open.subList(0, Math.min(4, open.size()))) {
            String detail = criterion.why().isEmpty()
                    ? "Критерий из рубрики задачи, который сейчас не покрыт."
                    : criterion.why();
            items.add(new ReviewResult.Improve("Раскрыть: " + shortTitle(criterion.title(), 80), detail));
        }
        if ("sa".equals(agentId)) {
            if (!signals.structure()) {
                items.add(new ReviewResult.Improve("Добавить структуру ответа",
                        "Заголовки и списки вместо сплошного текста: интервьюер читает ответ за 40 секунд."));
            }
            if (!signals.metrics()) {
                items.add(new ReviewResult.Improve("Добавить метрики успеха",
                        "Как поймём, что решение сработало: целевое значение, срок, источник данных."));
            }
        } else {
            if (!signals.diagram()) {
                items.add(new ReviewResult.Improve("Добавить схему",
                        "Sequence или flowchart снимает большую часть уточняющих вопросов. Вкладка PlantUML/Mermaid уже есть."));
            }
            if (!signals.numbers()) {
                items.add(new ReviewResult.Improve("Добавить числа",
                        "Таймауты, объёмы, доля трафика, срок внедрения — всё, что можно проверить."));
            }
        }
        return List.copyOf(items.subList(0, Math.min(5, items.size())));
    }

    static List<String> buildQuestions(
            List<ReviewResult.CriterionReview> criteria, ReviewInput task, String agentId) {
        List<ReviewResult.CriterionReview> missed = new ArrayList<>();
        for (ReviewResult.CriterionReview criterion : criteria) {
            if (!"hit".equals(criterion.state())) {
                missed.add(criterion);
            }
        }
        List<String> pool = task.interviewQuestions() == null ? List.of() : task.interviewQuestions();
        List<String> generated = new ArrayList<>();
        for (ReviewResult.CriterionReview criterion : missed.subList(0, Math.min(3, missed.size()))) {
            String stem = shortTitle(criterion.title(), 70);
            generated.add("sa".equals(agentId)
                    ? stem + " — как это будет работать у пользователя и кто это согласует?"
                    : stem + " — как это реализовать и что произойдёт при отказе?");
        }
        List<String> result = new ArrayList<>(pick(pool, 2, "sa".equals(agentId) ? 0 : 1));
        result.addAll(generated);
        return List.copyOf(result.subList(0, Math.min(4, result.size())));
    }

    /* ---------- рекомендации ---------- */

    static List<ReviewResult.Recommendation> buildRecommendations(
            ReviewInput task, List<RecCandidate> candidates) {
        List<RecCandidate> all = candidates == null ? List.of() : candidates;
        Map<String, Boolean> taskTags = new HashMap<>();
        if (task.tags() != null) {
            for (String tag : task.tags()) {
                taskTags.put(tag, true);
            }
        }
        record Scored(RecCandidate candidate, int score) {
        }
        List<Scored> scored = new ArrayList<>();
        for (RecCandidate candidate : all) {
            if (candidate.id().equals(task.id())) {
                continue;
            }
            int overlap = 0;
            if (candidate.tags() != null) {
                for (String tag : candidate.tags()) {
                    if (taskTags.containsKey(tag)) {
                        overlap++;
                    }
                }
            }
            int levelBoost = candidate.level() != null && candidate.level().equals(task.level()) ? 1 : 0;
            int score = overlap * 2 + levelBoost;
            if (score > 0) {
                scored.add(new Scored(candidate, score));
            }
        }
        scored.sort(Comparator.comparingInt(Scored::score).reversed()
                // Тай-брейк по id 1-в-1 с review-engine.js: иначе порядок
                // при равных баллах висел бы на порядке строк в БД.
                .thenComparing(scoredItem -> scoredItem.candidate().id()));
        List<ReviewResult.Recommendation> result = new ArrayList<>();
        for (Scored item : scored.subList(0, Math.min(3, scored.size()))) {
            result.add(new ReviewResult.Recommendation(
                    item.candidate().id(), item.candidate().title(), item.candidate().level()));
        }
        return List.copyOf(result);
    }

    /* ---------- итоговая оценка ---------- */

    /** Разбивка рубрики по состояниям + ключевые пробелы (общая для mock и LLM). */
    record Split(
            List<ReviewResult.CriterionReview> hits,
            List<ReviewResult.CriterionReview> partials,
            List<ReviewResult.CriterionReview> misses,
            List<ReviewResult.CriterionReview> criticalMisses) {
    }

    static Split splitByState(List<ReviewResult.CriterionReview> rubric) {
        List<ReviewResult.CriterionReview> hits = new ArrayList<>();
        List<ReviewResult.CriterionReview> partials = new ArrayList<>();
        List<ReviewResult.CriterionReview> misses = new ArrayList<>();
        for (ReviewResult.CriterionReview criterion : rubric) {
            switch (criterion.state()) {
                case "hit" -> hits.add(criterion);
                case "miss" -> misses.add(criterion);
                default -> partials.add(criterion);
            }
        }
        List<ReviewResult.CriterionReview> criticalMisses = new ArrayList<>();
        for (ReviewResult.CriterionReview miss : misses) {
            if ("high".equals(miss.weight())) {
                criticalMisses.add(miss);
            }
        }
        return new Split(
                List.copyOf(hits), List.copyOf(partials),
                List.copyOf(misses), List.copyOf(criticalMisses));
    }

    /** Формула итога с колпаками: score = round(100*(0.82*coverage+0.18*structure)). */
    static int scoreOf(double coverage, double structure, boolean empty) {
        int score = (int) Math.round(100 * (0.82 * coverage + 0.18 * structure));
        if (coverage < 0.12) {
            score = Math.min(score, 22);
        }
        if (empty) {
            score = Math.min(score, 6);
        }
        return Math.max(0, Math.min(100, score));
    }

    /** Оценка агента 0–10 из покрытия своей зоны и структуры. */
    static int agentScoreOf(double ownCoverage, double structure) {
        return (int) Math.round(10 * (0.85 * ownCoverage + 0.15 * structure));
    }

    /** Блок «почему такая оценка» — одинаковый для mock и LLM. */
    static List<String> buildWhy(ReviewInput task, Solution solution,
                                 ReviewResult.Signals signals,
                                 List<ReviewResult.CriterionReview> rubric, Split split) {
        List<String> why = new ArrayList<>();
        if (signals.empty()) {
            why.add("Решение пустое или содержит несколько слов — оценивать нечего, поэтому оценка минимальная.");
            return List.copyOf(why);
        }
        StringBuilder first = new StringBuilder("Покрыто " + split.hits().size() + " из " + rubric.size()
                + " критериев рубрики");
        if (!split.partials().isEmpty()) {
            first.append(", ещё ").append(split.partials().size()).append(" затронуты частично");
        }
        if (!split.criticalMisses().isEmpty()) {
            first.append(", из них ").append(split.criticalMisses().size()).append(" ключевых не раскрыто");
        }
        first.append(".");
        why.add(first.toString());
        if (!split.criticalMisses().isEmpty()) {
            List<String> titles = new ArrayList<>();
            for (ReviewResult.CriterionReview miss
                    : split.criticalMisses().subList(0, Math.min(3, split.criticalMisses().size()))) {
                titles.add("«" + shortTitle(miss.title(), 55) + "»");
            }
            why.add("Критичные пробелы: " + String.join(", ", titles)
                    + ". Пока они не закрыты, решение не выдержит реального собеседования.");
        }
        if (!split.hits().isEmpty()) {
            List<String> titles = new ArrayList<>();
            for (ReviewResult.CriterionReview hit
                    : split.hits().subList(0, Math.min(3, split.hits().size()))) {
                titles.add("«" + shortTitle(hit.title(), 55) + "»");
            }
            why.add("Учтено: " + String.join(", ", titles) + ".");
        }
        why.add(signals.diagram()
                ? "Есть визуализация — поток читается, а не угадывается."
                : "Схемы нет: текст приходится достраивать в голове, на собеседовании за это снижают оценку.");
        String levelName = task.levelName() != null && !task.levelName().isEmpty()
                ? task.levelName() : task.level();
        String volumeWord = solution.words >= 250 ? "достаточно" : solution.words >= 120 ? "впритык" : "мало";
        why.add("Объём документа — около " + solution.words + " слов; для уровня «" + levelName
                + "» этого " + volumeWord + ".");
        return List.copyOf(why);
    }

    /**
     * Строит ревью 1-в-1 с JS buildReview: score = round(100 * (0.82*coverage +
     * 0.18*structure)), колпаки при coverage&lt;0.12 и пустом решении.
     */
    public static ReviewResult buildReview(
            ReviewInput task, List<SolutionTab> tabs, List<RecCandidate> candidates) {
        Solution solution = collectSolution(tabs);
        ReviewResult.Signals signals = collectSignals(solution);
        List<ReviewResult.CriterionReview> rubric = new ArrayList<>();
        if (task.rubric() != null) {
            for (ReviewInput.CriterionInput criterion : task.rubric()) {
                rubric.add(evaluateCriterion(criterion, solution));
            }
        }
        double coverage = coverageOf(rubric);
        double structure = structureScore(solution, task.expectsDiagram(), signals);
        int score = scoreOf(coverage, structure, signals.empty());

        ReviewResult.Grade grade = gradeFor(score);
        Split split = splitByState(rubric);

        List<ReviewResult.AgentReview> agents = new ArrayList<>();
        for (String agentId : List.of("sa", "arch")) {
            List<ReviewResult.CriterionReview> own = agentCriteria(rubric, agentId);
            double ownCoverage = coverageOf(own);
            Persona persona = AGENTS.get(agentId);
            agents.add(new ReviewResult.AgentReview(
                    agentId, persona.name(), persona.role(), persona.initials(),
                    List.copyOf(persona.checks()),
                    agentScoreOf(ownCoverage, structure),
                    (int) Math.round(ownCoverage * 100),
                    buildCovered(own, solution, signals, agentId),
                    buildMissed(own, signals, agentId, solution),
                    buildNarrative(own, signals, agentId, ownCoverage, task),
                    buildImprove(own, signals, agentId, task),
                    buildQuestions(own, task, agentId)));
        }

        List<ReviewResult.CriterionReview> criteria = List.copyOf(rubric);
        return new ReviewResult(
                "rev_" + Long.toString(System.currentTimeMillis(), 36) + randomSuffix(),
                task.id(), Instant.now().toString(), ENGINE,
                grade,
                buildSummary(grade, coverage, split.hits(), split.misses(),
                        split.criticalMisses(), rubric.size()),
                buildWhy(task, solution, signals, rubric, split),
                criteria, List.copyOf(agents), signals,
                new ReviewResult.Stats(solution.words, solution.tabs.size(), solution.diagramTabs,
                        rubric.size(), split.hits().size(), split.partials().size(),
                        split.misses().size()),
                buildRecommendations(task, candidates));
    }

    private static String randomSuffix() {
        String alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
        ThreadLocalRandom random = ThreadLocalRandom.current();
        StringBuilder suffix = new StringBuilder(4);
        for (int i = 0; i < 4; i++) {
            suffix.append(alphabet.charAt(random.nextInt(alphabet.length())));
        }
        return suffix.toString();
    }

    static String buildSummary(
            ReviewResult.Grade grade, double coverage,
            List<ReviewResult.CriterionReview> hits,
            List<ReviewResult.CriterionReview> misses,
            List<ReviewResult.CriterionReview> criticalMisses, int criteriaTotal) {
        if (coverage < 0.12) {
            return "Решение почти не отвечает на поставленную задачу: условия задачи не разобраны, ключевые критерии не затронуты. Это не «неправильно» — это «не про то». Стоит вернуться к условию и пройти по списку того, что должно быть в ответе.";
        }
        if (grade.code() >= 4) {
            return "Задача решена на хорошем уровне: закрыто " + hits.size() + " из " + criteriaTotal
                    + " критериев, ответ читается как рабочая позиция, а не как рассуждение. "
                    + (criticalMisses.isEmpty()
                            ? "Ключевых пробелов нет: с таким ответом можно идти на технический экран."
                            : "Остаются пробелы по ключевым пунктам — они перечислены ниже.");
        }
        if (grade.code() == 3) {
            return "Направление мысли верное, но решение половинчатое: часть критериев названа без проработки, часть не затронута. На собеседовании такой ответ вытянут уточняющими вопросами — и именно на них обычно всё и ломается.";
        }
        return "Решение не закрывает задачу: затронуты отдельные аспекты, но системного ответа нет. Разберитесь с критериями ниже — это ровно то, что спрашивают на реальном интервью по этой теме.";
    }
}
