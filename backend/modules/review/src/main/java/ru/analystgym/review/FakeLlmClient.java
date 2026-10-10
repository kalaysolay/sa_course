package ru.analystgym.review;

import java.util.List;
import java.util.Map;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

/**
 * Детерминированный стенд вместо модели (dev/E2E без ключей): осмысленные
 * ответы собирает cannedAnswer под конкретную рубрику. Через него гоняем
 * весь LLM-контур (резолв промптов, fallback, валидацию, подсчёт кодом),
 * не дожидаясь настоящих ключей.
 */
public class FakeLlmClient implements LlmClient {

    private final ObjectMapper mapper = new ObjectMapper();

    @Override
    public LlmAnswer call(LlmRequest request) {
        // Заглушка на прямой вызов: осмысленные ответы — только cannedAnswer.
        ObjectNode root = mapper.createObjectNode();
        root.set("criteria", mapper.createArrayNode());
        root.set("agents", mapper.createArrayNode());
        return new LlmAnswer(root.toString(), "fake-llm", 10, 10);
    }

    /**
     * Канонический ответ под рубрику: состояния задаёт вызывающий
     * (обычно — как посчитал бы mock), тексты — шаблонные.
     */
    public String cannedAnswer(List<ReviewInput.CriterionInput> rubric,
                               Map<String, String> states) {
        ObjectNode root = mapper.createObjectNode();
        ArrayNode criteria = mapper.createArrayNode();
        for (ReviewInput.CriterionInput criterion : rubric) {
            ObjectNode item = mapper.createObjectNode();
            item.put("id", criterion.id());
            item.put("state", states.getOrDefault(criterion.id(), "miss"));
            item.put("evidence", "");
            criteria.add(item);
        }
        root.set("criteria", criteria);
        ArrayNode agents = mapper.createArrayNode();
        for (String agentId : List.of("sa", "arch")) {
            ObjectNode agent = mapper.createObjectNode();
            agent.put("id", agentId);
            agent.put("narrative", "Шаблонный разбор от стенда (" + agentId + ").");
            agent.set("covered", mapper.createArrayNode());
            agent.set("missed", mapper.createArrayNode());
            agent.set("improve", mapper.createArrayNode());
            ArrayNode questions = mapper.createArrayNode();
            questions.add("Шаблонный вопрос интервьюера?");
            agent.set("questions", questions);
            agents.add(agent);
        }
        root.set("agents", agents);
        return root.toString();
    }
}
