package ru.analystgym.review;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;
import org.junit.jupiter.api.Test;
import ru.analystgym.review.domain.*;
import ru.analystgym.review.repo.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

/** До очереди проверяем полный контекст и бюджет, а выбранные настройки сохраняем значениями. */
class ReviewPlanTest {
    private final ObjectMapper json = new ObjectMapper();
    private final AgentRepository agents = mock(AgentRepository.class);
    private final ProviderRepository providers = mock(ProviderRepository.class);
    private final PromptService prompts = mock(PromptService.class);
    private final AgentConfig agent = new AgentConfig();

    private ReviewPipeline pipeline(ReviewSettings settings) {
        agent.setId("sa"); agent.setName("Аналитик"); agent.setPromptKey("sa-reviewer");
        agent.setChecks(json.createArrayNode()); agent.setModel("agent-model");
        when(agents.findAll()).thenReturn(List.of(agent));
        var provider = mock(Provider.class);
        when(provider.isEnabled()).thenReturn(true); when(provider.getId()).thenReturn("primary");
        when(provider.getBaseUrl()).thenReturn("mock://local"); when(provider.getModel()).thenReturn("provider-model");
        when(provider.getKeyEnv()).thenReturn("ENV_NAME_ONLY"); when(provider.getTimeoutSec()).thenReturn(10);
        when(providers.findById("primary")).thenReturn(Optional.of(provider));
        var version = new PromptVersion(); version.setId(UUID.randomUUID()); version.setV(7); version.setModel("prompt-model");
        when(prompts.resolve(anyString(), any())).thenReturn(new PromptService.ResolvedPrompt(version, "Сохранённый промпт"));
        return new ReviewPipeline(agents, providers, prompts, json, settings, "primary", "fallback");
    }

    private ReviewInput input() {
        return new ReviewInput("t", "Задача", "easy", "Лёгкая", List.of(), false,
                List.of(new ReviewInput.CriterionInput("c", "Контракт", "high", 7, "sa", List.of("контракт"), "Договор")),
                List.of(), json.createObjectNode().put("constraints", "Полное ограничение"), 42L);
    }

    @Test void полныйДлинныйТекстИНастройкиЗамороженыБезПодменыИОбрезки() throws Exception {
        var pipeline = pipeline(new ReviewSettings(20000, 64000, 2000, 160000, 6));
        var tabs = List.of(new SolutionTab("d", "doc", "Решение", "x".repeat(13000) + " END"));
        var plan = pipeline.prepare("llm", input(), tabs, List.of());
        agent.setModel("changed"); agent.setName("Другая персона");
        var frozen = json.readValue(json.writeValueAsBytes(plan), ReviewPlan.class);
        assertThat(frozen.agents().get(0).model()).isEqualTo("prompt-model");
        assertThat(frozen.agents().get(0).name()).isEqualTo("Аналитик");
        assertThat(frozen.agents().get(0).promptVersion()).isEqualTo(7);
        var user = json.readTree(frozen.agents().get(0).user());
        assertThat(user.path("solution").asText().trim()).hasSize(13004).endsWith("END");
        assertThat(user.path("task").path("statement").path("constraints").asText()).isEqualTo("Полное ограничение");
        assertThat(frozen.routes().get(0).keyEnv()).isEqualTo("ENV_NAME_ONLY");
    }

    @Test void контекстИОбщийБюджетОтклоняютсяДоПостановкиВСеть() {
        var tabs = List.of(new SolutionTab("d", "doc", "Решение", "Контракт"));
        assertThatThrownBy(() -> pipeline(new ReviewSettings(20000, 100, 2000, 160000, 6))
                .prepare("llm", input(), tabs, List.of())).hasMessageContaining("review_context_too_large");
        assertThatThrownBy(() -> pipeline(new ReviewSettings(20000, 64000, 2000, 2001, 6))
                .prepare("llm", input(), tabs, List.of())).hasMessageContaining("review_context_over_budget");
    }
}
