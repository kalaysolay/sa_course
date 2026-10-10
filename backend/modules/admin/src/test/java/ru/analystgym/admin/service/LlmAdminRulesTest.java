package ru.analystgym.admin.service;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import ru.analystgym.admin.web.AdminDto.TrafficRequest;
import ru.analystgym.admin.web.AdminDto.VersionCreateRequest;
import ru.analystgym.review.domain.PromptVersion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Правила версий промптов без БД: нулевой трафик — в архив,
 * promote гонит 100%, без changelog/version нельзя.
 */
class LlmAdminRulesTest {

    private LlmAdminService serviceOf(ru.analystgym.review.repo.PromptVersionRepository versions) {
        return new LlmAdminService(
                mock(ru.analystgym.review.repo.ProviderRepository.class),
                mock(ru.analystgym.review.repo.AgentRepository.class),
                mock(ru.analystgym.review.repo.PromptRepository.class),
                versions,
                new com.fasterxml.jackson.databind.ObjectMapper(),
                mock(AdminAudit.class));
    }

    private static PromptVersion version(UUID id, int v, String status, int traffic) {
        PromptVersion version = new PromptVersion();
        version.setId(id);
        version.setPromptKey("sa-reviewer");
        version.setV(v);
        version.setStatus(status);
        version.setTraffic(traffic);
        version.setModel("");
        version.setChangelog("c");
        version.setText("t");
        return version;
    }

    @Test
    void нулевойТрафикУводитВАрхив() {
        // given: canary-версия;
        var versions = mock(ru.analystgym.review.repo.PromptVersionRepository.class);
        PromptVersion v = version(UUID.randomUUID(), 4, "canary", 20);
        when(versions.findById(v.getId())).thenReturn(Optional.of(v));
        when(versions.save(any())).thenAnswer(call -> call.getArgument(0));

        // when: гасим трафик;
        var saved = serviceOf(versions).setTraffic(UUID.randomUUID(), v.getId(), new TrafficRequest(0));

        // then: статус архив, иначе канарейка без трафика ввела бы в заблуждение.
        assertThat(saved.traffic()).isEqualTo(0);
        assertThat(saved.status()).isEqualTo("archived");
    }

    @Test
    void promoteДаётСтоОстальнымНоль() {
        // given: две версии;
        var versions = mock(ru.analystgym.review.repo.PromptVersionRepository.class);
        PromptVersion v3 = version(UUID.randomUUID(), 3, "active", 80);
        PromptVersion v4 = version(UUID.randomUUID(), 4, "canary", 20);
        when(versions.findById(v4.getId())).thenReturn(Optional.of(v4));
        when(versions.findByPromptKeyOrderByVDesc("sa-reviewer")).thenReturn(List.of(v4, v3));
        when(versions.save(any())).thenAnswer(call -> call.getArgument(0));

        // when: продвигаем канарейку;
        var saved = serviceOf(versions).promote(UUID.randomUUID(), v4.getId());

        // then: у неё 100/active, у старой 0/archived.
        assertThat(saved.traffic()).isEqualTo(100);
        assertThat(saved.status()).isEqualTo("active");
        assertThat(v3.getTraffic()).isEqualTo(0);
        assertThat(v3.getStatus()).isEqualTo("archived");
    }

    @Test
    void новаяВерсияБезChangelogОтклоняется() {
        var versions = mock(ru.analystgym.review.repo.PromptVersionRepository.class);
        when(versions.findByPromptKeyOrderByVDesc("sa-reviewer")).thenReturn(List.of());
        var prompts = mock(ru.analystgym.review.repo.PromptRepository.class);
        when(prompts.findById("sa-reviewer"))
                .thenReturn(Optional.of(new ru.analystgym.review.domain.Prompt()));
        LlmAdminService service = new LlmAdminService(
                mock(ru.analystgym.review.repo.ProviderRepository.class),
                mock(ru.analystgym.review.repo.AgentRepository.class),
                prompts, versions,
                new com.fasterxml.jackson.databind.ObjectMapper(),
                mock(AdminAudit.class));

        assertThatThrownBy(() -> service.createVersion(UUID.randomUUID(), "sa-reviewer",
                new VersionCreateRequest("text", "  ", "", 0)))
                .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
    }
}
