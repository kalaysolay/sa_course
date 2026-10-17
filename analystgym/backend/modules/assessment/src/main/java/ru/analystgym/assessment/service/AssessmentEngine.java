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
            new GradeDef("intern",0,34,"Начальная база","Знания по банку вопросов","Начните с тем с ошибками и пропусками."),
            new GradeDef("junior",35,54,"Частичная база","Знания по банку вопросов","Часть понятий усвоена; проверьте пробелы на практике."),
            new GradeDef("middle",55,74,"Устойчивая база","Знания по банку вопросов","Большая часть вопросов решена; разберите оставшиеся ошибки."),
            new GradeDef("senior",75,89,"Широкая база","Знания по банку вопросов","Много правильных ответов; примените знания в практической задаче."),
            new GradeDef("lead",90,100,"Высокий результат теста","Знания по банку вопросов","Почти все вопросы решены верно. Это не подтверждение профессионального грейда."));

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
            case "strong" -> "Много правильных ответов в этой теме";
            case "ok" -> "Большая часть ответов верна";
            case "weak" -> "Стоит повторить тему и разобрать ошибки";
            case "bad" -> "Начните практику с этой темы";
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
                    + "%). По отвеченным вопросам эта тема усвоена лучше других.");
        } else {
            parts.add("Пока нет темы с результатом выше 70% по отвеченным вопросам. Начните с разбора ошибок.");
        }
        if (result.weakest() != null && result.weakest().pct() != null && result.weakest().pct() < 60) {
            parts.add("Главный пробел — «" + result.weakest().name() + "» (" + result.weakest().pct()
                    + "%). Повторите понятия из ошибочных ответов и проверьте их на практической задаче.");
        }
        if (result.grade() != null) {
            parts.add("Результат описывает знания по этому набору вопросов. Самостоятельность, опыт проектов и профессиональный грейд тест не измеряет.");
        }
        return List.copyOf(parts);
    }

    /** Взгляд работодателя по округлённому баллу. */
    public static Map<String, String> marketView(AssessmentResult result) {
        return Map.of("label","Учебный профиль знаний","note","Баллы относятся к этому банку вопросов и не прогнозируют найм, зарплату или результат собеседования.");
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
