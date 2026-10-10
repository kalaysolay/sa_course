package ru.analystgym.assessment.service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Порт tasks-mockup/assets/js/scoring.js 1-в-1: тот же код используют
 * assessment.js и results.js, расхождение экранов исключено той же
 * формулой. Справочники (компетенции/грейды/метки) зашиты как в
 * data-core.js: в админке макета их править нельзя, только уровни.
 */
public final class AssessmentEngine {

    /** Компетенция → метки задач для плана прокачки (COMPETENCY_TAGS). */
    static final Map<String, List<String>> COMPETENCY_TAGS = Map.of(
            "requirements", List.of("requirements", "user-story", "acceptance", "use-case", "edge-cases", "nfr"),
            "integrations", List.of("integrations", "rest-api", "soap", "api-design", "idempotency", "retry", "async",
                    "kafka", "oauth", "versioning"),
            "data", List.of("sql", "db-design", "normalization", "indexes", "transactions", "migration", "dwh"),
            "architecture", List.of("architecture", "system-design", "microservices", "saga", "ddd", "cache",
                    "reliability"),
            "modeling", List.of("uml", "sequence", "bpmn", "er", "state", "component"),
            "process", List.of("stakeholders", "conflict", "agile", "estimation", "discovery"),
            "quality", List.of("nfr", "testing", "data-quality", "observability", "release", "docs", "reliability"));

    private static final Map<String, String> LEVEL_BY_GRADE = Map.of(
            "intern", "easy", "junior", "easy", "middle", "medium", "senior", "hard", "lead", "hard");

    private record CompetencyMeta(String id, String name, String icon, String shortDesc) {
    }

    /** Порядок — как в SA_DATA.competencies (results.js рисует 7 осей по нему). */
    private static final List<CompetencyMeta> COMPETENCIES = List.of(
            new CompetencyMeta("requirements", "Требования и формализация", "✎",
                    "Сбор, user stories, критерии приёмки, полнота"),
            new CompetencyMeta("integrations", "Интеграции и API", "⇄",
                    "REST/SOAP, контракты, идемпотентность, ошибки"),
            new CompetencyMeta("data", "Данные и SQL", "⛁", "Схемы, запросы, индексы, качество данных"),
            new CompetencyMeta("architecture", "Архитектура и системный дизайн", "◧",
                    "Границы сервисов, надёжность, компромиссы"),
            new CompetencyMeta("modeling", "Моделирование и нотации", "⬡", "UML, BPMN, sequence, ER, состояния"),
            new CompetencyMeta("process", "Процессы и коммуникации", "◎",
                    "Стейкхолдеры, оценка, декомпозиция, приёмка"),
            new CompetencyMeta("quality", "Качество, НФТ и эксплуатация", "⚑",
                    "НФТ, тестирование, логирование, выкатка"));

    private record GradeDef(String id, int min, int max, String name, String title, String note) {
    }

    private static final List<GradeDef> GRADES = List.of(
            new GradeDef("intern", 0, 34, "Старт", "Порог входа",
                    "Базовые понятия знакомы, но системной практики пока мало."),
            new GradeDef("junior", 35, 54, "Junior", "Junior-аналитик",
                    "Решаете типовые задачи под присмотром наставника."),
            new GradeDef("middle", 55, 74, "Middle", "Middle-аналитик",
                    "Самостоятельно ведёте фичу от discovery до приёмки."),
            new GradeDef("senior", 75, 89, "Senior", "Senior-аналитик",
                    "Проектируете решения и держите качество на уровне системы."),
            new GradeDef("lead", 90, 100, "Lead", "Lead / Principal",
                    "Формируете подход, обучаете других, отвечаете за домен."));

    private AssessmentEngine() {
    }

    static String tierFor(int pct) {
        if (pct >= 80) {
            return "strong";
        }
        if (pct >= 60) {
            return "ok";
        }
        if (pct >= 40) {
            return "weak";
        }
        return "bad";
    }

    static String tierLabel(String tier) {
        return switch (tier) {
            case "strong" -> "Сильная зона — можно брать задачи уровня выше";
            case "ok" -> "Рабочий уровень, есть что отшлифовать";
            case "weak" -> "Заметный пробел — здесь чаще всего «валят» на собеседовании";
            case "bad" -> "Критичный пробел — начать стоит отсюда";
            default -> "";
        };
    }

    /**
     * Подсчёт результата. answers: id вопроса → индекс варианта (нет ключа —
     * пропуск). Пропуски бьют дважды: уменьшают answeredShare, поэтому
     * «угадать уровень» пропусками нельзя.
     */
    public static AssessmentResult compute(
            List<AssessmentResult.QuestionInput> questions, Map<String, Integer> answers) {
        List<AssessmentResult.QuestionInput> list = questions == null ? List.of() : questions;
        Map<String, Integer> given = answers == null ? Map.of() : answers;

        List<AssessmentResult.CompetencyResult> byCompetency = new ArrayList<>();
        for (CompetencyMeta meta : COMPETENCIES) {
            int earned = 0;
            int total = 0;
            int correct = 0;
            int answered = 0;
            int items = 0;
            for (AssessmentResult.QuestionInput question : list) {
                if (!meta.id().equals(question.competency())) {
                    continue;
                }
                items++;
                Integer chosen = given.get(question.id());
                if (chosen == null) {
                    continue;
                }
                answered++;
                total += question.difficulty();
                if (chosen == question.answer()) {
                    earned += question.difficulty();
                    correct++;
                }
            }
            Integer pct = total == 0 ? null : (int) Math.round(earned * 100.0 / total);
            String tier = pct == null ? null : tierFor(pct);
            byCompetency.add(new AssessmentResult.CompetencyResult(
                    meta.id(), meta.name(), meta.icon(), meta.shortDesc(),
                    items, answered, correct, pct, tier,
                    tier == null ? "Нет ответов" : tierLabel(tier)));
        }

        int earned = 0;
        int total = 0;
        int correctCount = 0;
        int answeredCount = 0;
        for (AssessmentResult.QuestionInput question : list) {
            Integer chosen = given.get(question.id());
            if (chosen == null) {
                continue;
            }
            answeredCount++;
            total += question.difficulty();
            if (chosen == question.answer()) {
                earned += question.difficulty();
                correctCount++;
            }
        }
        double answeredShare = list.isEmpty() ? 0 : (double) answeredCount / list.size();
        double rawPct = total == 0 ? 0 : (double) earned / total;
        double score = Math.round(rawPct * answeredShare * 100 * 10) / 10.0;
        int scoreRounded = (int) Math.round(score);
        AssessmentResult.GradeRef grade = gradeFor(scoreRounded);

        List<AssessmentResult.CompetencyResult> measured = new ArrayList<>();
        for (AssessmentResult.CompetencyResult row : byCompetency) {
            if (row.pct() != null) {
                measured.add(row);
            }
        }
        // Сортировка стабильная в обоих движках — порядок равных как в SA_DATA.
        measured.sort(Comparator.comparingInt(AssessmentResult.CompetencyResult::pct).reversed());
        List<AssessmentResult.CompetencyResult> strengths = new ArrayList<>();
        List<AssessmentResult.CompetencyResult> below = new ArrayList<>();
        for (AssessmentResult.CompetencyResult row : measured) {
            if (row.pct() >= 70 && strengths.size() < 3) {
                strengths.add(row);
            }
            if (row.pct() < 70) {
                below.add(row);
            }
        }
        // Три худших, от худшего (reverse стабильного desc = asc).
        List<AssessmentResult.CompetencyResult> gaps = new ArrayList<>();
        for (int i = below.size() - 1; i >= 0 && gaps.size() < 3; i--) {
            gaps.add(below.get(i));
        }

        List<AssessmentResult.DetailRow> detail = new ArrayList<>();
        for (AssessmentResult.QuestionInput question : list) {
            Integer chosen = given.get(question.id());
            boolean answeredFlag = chosen != null;
            detail.add(new AssessmentResult.DetailRow(
                    question.id(), question.competency(), question.difficulty(),
                    question.question(), List.copyOf(question.options()), question.answer(),
                    answeredFlag ? chosen : null, answeredFlag,
                    answeredFlag && chosen == question.answer(), question.explain()));
        }

        return new AssessmentResult(
                score, scoreRounded, grade, answeredCount, list.size(), correctCount,
                List.copyOf(byCompetency), List.copyOf(strengths), List.copyOf(gaps),
                measured.isEmpty() ? null : measured.get(measured.size() - 1),
                measured.isEmpty() ? null : measured.get(0),
                List.copyOf(detail));
    }

    static AssessmentResult.GradeRef gradeFor(int scoreRounded) {
        List<GradeDef> sorted = new ArrayList<>(GRADES);
        sorted.sort(Comparator.comparingInt(GradeDef::min));
        for (GradeDef grade : sorted) {
            if (scoreRounded >= grade.min() && scoreRounded <= grade.max()) {
                return new AssessmentResult.GradeRef(
                        grade.id(), grade.min(), grade.max(), grade.name(), grade.title(), grade.note());
            }
        }
        GradeDef last = sorted.get(sorted.size() - 1);
        return new AssessmentResult.GradeRef(
                last.id(), last.min(), last.max(), last.name(), last.title(), last.note());
    }

    /** Кандидат в план: задача каталога + флаг «уже решена». */
    public record PlanCandidate(String id, String title, String level, List<String> tags) {
    }

    /**
     * Задачи под пробелы: пересечение меток ×10, близость уровня к грейду,
     * решённые уходят вниз (−25), но не исключаются. Тай-брейк по id —
     * как в рекомендациях ревью (иначе порядок висит на порядке строк в БД).
     */
    public static List<AssessmentResult.PlanItem> buildPlan(
            AssessmentResult result, List<PlanCandidate> candidates,
            java.util.Set<String> doneIds, int limit) {
        int max = limit <= 0 ? 4 : limit;
        List<String> gapIds = new ArrayList<>();
        if (result.gaps() != null) {
            for (AssessmentResult.CompetencyResult gap : result.gaps()) {
                gapIds.add(gap.id());
            }
        }
        if (gapIds.isEmpty() && result.weakest() != null) {
            gapIds.add(result.weakest().id());
        }
        List<String> targetTags = new ArrayList<>();
        for (String gapId : gapIds) {
            for (String tag : COMPETENCY_TAGS.getOrDefault(gapId, List.of())) {
                if (!targetTags.contains(tag)) {
                    targetTags.add(tag);
                }
            }
        }
        String targetLevel = LEVEL_BY_GRADE.getOrDefault(
                result.grade() == null ? "" : result.grade().id(), "medium");
        Map<String, Integer> rank = Map.of("easy", 1, "medium", 2, "hard", 3);
        int targetRank = rank.getOrDefault(targetLevel, 2);

        record Scored(PlanCandidate candidate, int overlap, boolean done, int distance, int score) {
        }
        Map<String, String> competencyNames = new LinkedHashMap<>();
        for (CompetencyMeta meta : COMPETENCIES) {
            competencyNames.put(meta.id(), meta.name());
        }
        List<Scored> scored = new ArrayList<>();
        for (PlanCandidate candidate : candidates == null ? List.<PlanCandidate>of() : candidates) {
            int overlap = 0;
            if (candidate.tags() != null) {
                for (String tag : candidate.tags()) {
                    if (targetTags.contains(tag)) {
                        overlap++;
                    }
                }
            }
            if (overlap == 0) {
                continue;
            }
            boolean done = doneIds != null && doneIds.contains(candidate.id());
            int distance = Math.abs(rank.getOrDefault(candidate.level(), 2) - targetRank);
            scored.add(new Scored(candidate, overlap, done, distance,
                    overlap * 10 - distance * 2 - (done ? 25 : 0)));
        }
        scored.sort(Comparator.comparingInt(Scored::score).reversed()
                .thenComparing(scoredItem -> scoredItem.candidate().id()));
        List<String> reasonParts = new ArrayList<>();
        for (String gapId : gapIds.subList(0, Math.min(2, gapIds.size()))) {
            String name = competencyNames.get(gapId);
            if (name != null) {
                reasonParts.add(name);
            }
        }
        String reason = String.join(", ", reasonParts);
        List<AssessmentResult.PlanItem> plan = new ArrayList<>();
        int n = 0;
        for (Scored item : scored.subList(0, Math.min(max, scored.size()))) {
            n++;
            List<String> tags = new ArrayList<>();
            if (item.candidate().tags() != null) {
                for (String tag : item.candidate().tags()) {
                    if (targetTags.contains(tag) && tags.size() < 4) {
                        tags.add(tag);
                    }
                }
            }
            plan.add(new AssessmentResult.PlanItem(n, item.candidate().id(), item.candidate().title(),
                    item.candidate().level(), List.copyOf(tags), reason, item.done()));
        }
        return List.copyOf(plan);
    }

    /** Короткая текстовая интерпретация для карточки результата. */
    public static List<String> narrative(AssessmentResult result) {
        List<String> parts = new ArrayList<>();
        if (result.answeredCount() < result.questionsCount()) {
            parts.add("Отвечено " + result.answeredCount() + " из " + result.questionsCount()
                    + " — итог посчитан с учётом пропусков, поэтому лучше пройти тест целиком.");
        }
        if (result.strongest() != null && result.strongest().pct() != null
                && result.strongest().pct() >= 70) {
            parts.add("Опора — «" + result.strongest().name() + "» (" + result.strongest().pct()
                    + "%). Здесь вы отвечаете уверенно, на собеседовании это ваша зона контроля.");
        } else {
            parts.add("Ярко выраженной сильной зоны пока нет: стоит начать с базовых блоков, "
                    + "иначе ответы будут звучать неуверенно во всех темах.");
        }
        if (result.weakest() != null && result.weakest().pct() != null && result.weakest().pct() < 60) {
            parts.add("Главный пробел — «" + result.weakest().name() + "» (" + result.weakest().pct()
                    + "%). Именно на таких вопросах кандидаты теряют оффер: тема звучит в 80% технических экранов.");
        }
        if (result.grade() != null) {
            parts.add("Итоговый профиль — " + result.grade().title() + ": " + result.grade().note());
        }
        return List.copyOf(parts);
    }

    /** Взгляд работодателя по округлённому баллу. */
    public static Map<String, String> marketView(AssessmentResult result) {
        int score = result.scoreRounded();
        if (score >= 85) {
            return Map.of("label", "Профиль уровня Senior/Lead",
                    "note", "Таких кандидатов мало: обычно оффер делают после одного технического экрана. "
                            + "Ваша задача на собеседовании — не потерять баллы на коммуникации.");
        }
        if (score >= 70) {
            return Map.of("label", "Уверенный Middle+",
                    "note", "Вы проходите фильтры большинства вакансий. Решает не база, а глубина: "
                            + "расхождения начинаются на вопросах «а что если откажет».");
        }
        if (score >= 55) {
            return Map.of("label", "Middle с пробелами",
                    "note", "Типичная картина: сильные требования и процессы, слабые интеграции или архитектура. "
                            + "Оффер реален, но технический экран будет пограничным.");
        }
        if (score >= 35) {
            return Map.of("label", "Junior+",
                    "note", "Базу видно, но на самостоятельную роль пока не хватает. Хорошая новость: "
                            + "пробелы точечные и закрываются за 4–8 недель практики.");
        }
        return Map.of("label", "Старт",
                "note", "Знаний пока недостаточно для самостоятельных задач. Начните с подборок «лёгкого» "
                        + "уровня и диагностики раз в две недели — прогресс будет заметен быстро.");
    }

    /**
     * Ссылка «К задачам по моему уровню»: до 4 тегов из двух главных
     * пробелов (по 3 первых метки компетенции).
     */
    public static String levelCatalogUrl(AssessmentResult result) {
        List<String> tags = new ArrayList<>();
        if (result.gaps() != null) {
            for (AssessmentResult.CompetencyResult gap : result.gaps().subList(0, Math.min(2, result.gaps().size()))) {
                for (String tag : COMPETENCY_TAGS.getOrDefault(gap.id(), List.of()).subList(0,
                        Math.min(3, COMPETENCY_TAGS.getOrDefault(gap.id(), List.of()).size()))) {
                    if (!tags.contains(tag)) {
                        tags.add(tag);
                    }
                }
            }
        }
        if (tags.isEmpty()) {
            return "catalog.html";
        }
        return "catalog.html?tag=" + String.join(",", tags.subList(0, Math.min(4, tags.size())));
    }
}
