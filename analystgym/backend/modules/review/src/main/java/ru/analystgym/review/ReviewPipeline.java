package ru.analystgym.review;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import com.fasterxml.jackson.databind.ObjectMapper;
import ru.analystgym.review.domain.AgentConfig;
import ru.analystgym.review.domain.Provider;
import ru.analystgym.review.repo.AgentRepository;
import ru.analystgym.review.repo.ProviderRepository;

/**
 * LLM-контур ревью (UC-SYS01): промпт активной/canary-редакции по трафику,
 * вызов primary → fallback, строгая валидация JSON (ретрай один раз),
 * грейд считает код, cost-cap аварийно стопает. Молчаливых деградаций нет:
 * не посчитали — задача failed с причиной, а не пустое ревью.
 */
@Service
public class ReviewPipeline {

    private final AgentRepository agents;
    private final ProviderRepository providers;
    private final PromptService prompts;
    private final ObjectMapper mapper;
    private final String primaryProvider;
    private final String fallbackProvider;
    private final int maxTokens;

    public ReviewPipeline(
            AgentRepository agents,
            ProviderRepository providers,
            PromptService prompts,
            ObjectMapper mapper,
            @Value("${review.llm.primary:deepseek}") String primaryProvider,
            @Value("${review.llm.fallback:glm}") String fallbackProvider,
            @Value("${review.llm.max-tokens:8000}") int maxTokens) {
        this.agents = agents;
        this.providers = providers;
        this.prompts = prompts;
        this.mapper = mapper;
        this.primaryProvider = primaryProvider;
        this.fallbackProvider = fallbackProvider;
        this.maxTokens = maxTokens;
    }

    public record LlmOutcome(
            ReviewResult result,
            String provider,
            String model,
            Map<String, Integer> promptVersions,
            int inputTokens,
            int outputTokens) {
    }

    /** Полный проход: включённые агенты последовательно, как в mock. */
    public LlmOutcome review(ReviewInput task, List<SolutionTab> tabs,
                             List<RecCandidate> candidates) {
        List<AgentConfig> enabled = new ArrayList<>();
        for (AgentConfig agent : agents.findAll()) {
            if (agent.isEnabled()) {
                enabled.add(agent);
            }
        }
        enabled.sort((a, b) -> a.getId().compareTo(b.getId()));
        if (enabled.isEmpty()) {
            throw new LlmClient.LlmFailedException("no agents enabled");
        }
        MockReviewProvider.Solution solution = MockReviewProvider.collectSolution(tabs);
        String solutionText = clip(solutionTextOf(solution), 12000);
        String rubricText = rubricTextOf(task);
        Map<String, Integer> versions = new HashMap<>();
        Map<String, String> states = new HashMap<>();
        Map<String, String> evidence = new HashMap<>();
        Map<String, LlmReviewer.AgentPart> parts = new HashMap<>();
        String usedProvider = "";
        String usedModel = "";
        int inTokens = 0;
        int outTokens = 0;
        List<String> agentIds = new ArrayList<>();
        for (AgentConfig agent : enabled) {
            agentIds.add(agent.getId());
        }
        for (AgentConfig agent : enabled) {
            if (agent.getPromptKey() == null || agent.getPromptKey().isBlank()) {
                throw new LlmClient.LlmFailedException("no prompt for " + agent.getId());
            }
            PromptService.ResolvedPrompt prompt = prompts.resolve(
                    agent.getPromptKey(),
                    new PromptService.PromptContext(solutionText, rubricText, task.title(),
                            criteriaTextOf(task)));
            versions.put(agent.getPromptKey(), prompt.version().getV());
            CallResult call = callChain(task, tabs, agent, prompt.text());
            LlmClient.LlmAnswer answer = call.answer();
            usedProvider = call.providerId();
            usedModel = answer.model();
            inTokens += answer.inputTokens();
            outTokens += answer.outputTokens();
            if (inTokens + outTokens > maxTokens) {
                throw new LlmClient.LlmFailedException("token cap");
            }
            LlmReviewer.ParsedAnswer parsed;
            try {
                parsed = LlmReviewer.parse(answer.text(), task, agentIds);
            } catch (LlmReviewer.LlmBadResponse bad) {
                // Ретрай один раз с жёстким напоминанием про схему.
                CallResult retryCall = callChain(task, tabs, agent, prompt.text()
                        + "\nОтветь ТОЛЬКО валидным JSON по заданной схеме, без fences и текста вокруг.");
                LlmClient.LlmAnswer retry = retryCall.answer();
                parsed = LlmReviewer.parse(retry.text(), task, agentIds);
                inTokens += retry.inputTokens();
                outTokens += retry.outputTokens();
                usedModel = retry.model();
            }
            states.putAll(parsed.states());
            evidence.putAll(parsed.evidence());
            parts.putAll(parsed.parts());
        }
        Map<String, LlmReviewer.Persona> personas = new HashMap<>();
        for (AgentConfig agent : enabled) {
            List<String> checks = new ArrayList<>();
            if (agent.getChecks() != null && agent.getChecks().isArray()) {
                for (var check : agent.getChecks()) {
                    checks.add(check.asText(""));
                }
            }
            personas.put(agent.getId(), new LlmReviewer.Persona(agent.getId(),
                    agent.getName(), agent.getRole(), agent.getInitials(), List.copyOf(checks)));
        }
        ReviewResult result = LlmReviewer.buildReview(task, tabs, candidates,
                new LlmReviewer.ParsedAnswer(states, evidence, parts), personas,
                "llm:" + usedProvider + "/" + usedModel);
        return new LlmOutcome(result, usedProvider, usedModel, versions, inTokens, outTokens);
    }

    /** Цепочка primary → fallback; обе легли — наружу LlmClient.LlmFailedException. */
    record CallResult(LlmClient.LlmAnswer answer, String providerId) {
    }

    private CallResult callChain(ReviewInput task, List<SolutionTab> tabs,
                                   AgentConfig agent, String userText) {
        List<String> chain = new ArrayList<>();
        chain.add(primaryProvider);
        if (!fallbackProvider.isBlank() && !fallbackProvider.equals(primaryProvider)) {
            chain.add(fallbackProvider);
        }
        LlmClient.LlmFailedException last = new LlmClient.LlmFailedException("no provider");
        for (String providerId : chain) {
            Provider provider = providers.findById(providerId).orElse(null);
            if (provider == null || !provider.isEnabled()) {
                continue;
            }
            String model = agent.getModel() != null && !agent.getModel().isBlank()
                    ? agent.getModel() : provider.getModel();
            try {
                LlmClient.LlmAnswer answer;
                if (isMockBacked(provider)) {
                    answer = mockBackedAnswer(task, tabs);
                } else {
                    answer = clientFor(provider).call(
                            new LlmClient.LlmRequest(model, "", userText,
                                    Math.max(10, provider.getTimeoutSec())));
                }
                return new CallResult(answer, provider.getId());
            } catch (LlmClient.LlmFailedException failed) {
                last = failed;
            } catch (RuntimeException failed) {
                last = new LlmClient.LlmFailedException(String.valueOf(failed.getMessage()));
            }
        }
        throw last;
    }

    /** Фабрика клиентов под провайдера (тесты подменяют целиком пайплайн). */
    protected LlmClient clientFor(Provider provider) {
        return new HttpLlmClient(provider.getBaseUrl(), provider.getModel(),
                provider.getKeyEnv(), mapper);
    }

    /**
     * Псевдо-LLM для dev/E2E без ключей (провайдер mock://): состояния
     * критериев считает тот же матчер, что mock, тексты — шаблонные.
     * Валидацию, фолбэк и подсчёт кодом проходит по-настоящему.
     */
    private LlmClient.LlmAnswer mockBackedAnswer(ReviewInput task, List<SolutionTab> tabs) {
        MockReviewProvider.Solution solution = MockReviewProvider.collectSolution(tabs);
        Map<String, String> states = new HashMap<>();
        if (task.rubric() != null) {
            for (ReviewInput.CriterionInput criterion : task.rubric()) {
                states.put(criterion.id(), MockReviewProvider
                        .evaluateCriterion(criterion, solution).state());
            }
        }
        String text = new FakeLlmClient().cannedAnswer(
                task.rubric() == null ? List.of() : task.rubric(), states);
        return new LlmClient.LlmAnswer(text, "mock-llm", 1, 1);
    }

    private static boolean isMockBacked(Provider provider) {
        return provider.getBaseUrl() != null && provider.getBaseUrl().startsWith("mock://");
    }

    private static String solutionTextOf(MockReviewProvider.Solution solution) {
        StringBuilder text = new StringBuilder(solution.docText);
        if (!solution.diagramText.isBlank()) {
            text.append("\n[Диаграммы: ").append(solution.diagramTabs).append(" вкладок]\n")
                    .append(solution.diagramText.length() > 4000
                            ? solution.diagramText.substring(0, 4000) : solution.diagramText);
        }
        return TextScrubber.scrub(text.toString());
    }

    private static String rubricTextOf(ReviewInput task) {
        StringBuilder text = new StringBuilder();
        if (task.rubric() != null) {
            for (ReviewInput.CriterionInput criterion : task.rubric()) {
                text.append("- ").append(criterion.id()).append(": ").append(criterion.title());
                if (criterion.keywords() != null && !criterion.keywords().isEmpty()) {
                    text.append(" [маркеры: ").append(String.join(", ", criterion.keywords())).append("]");
                }
                if (criterion.why() != null && !criterion.why().isBlank()) {
                    text.append(" (").append(criterion.why()).append(")");
                }
                text.append("\n");
            }
        }
        return text.toString();
    }

    private static String criteriaTextOf(ReviewInput task) {
        List<String> ids = new ArrayList<>();
        if (task.rubric() != null) {
            for (ReviewInput.CriterionInput criterion : task.rubric()) {
                ids.add(criterion.id());
            }
        }
        return String.join(",", ids);
    }

    private static String clip(String value, int max) {
        String text = value == null ? "" : value;
        return text.length() <= max ? text : text.substring(0, max);
    }
}
