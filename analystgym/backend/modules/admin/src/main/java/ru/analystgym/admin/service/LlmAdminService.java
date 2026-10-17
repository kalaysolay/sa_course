package ru.analystgym.admin.service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import ru.analystgym.admin.web.AdminDto.AgentDto;
import ru.analystgym.admin.web.AdminDto.PromptVersionDto;
import ru.analystgym.admin.web.AdminDto.ProviderDto;
import ru.analystgym.admin.web.AdminDto.TrafficRequest;
import ru.analystgym.admin.web.AdminDto.VersionCreateRequest;
import ru.analystgym.review.domain.AgentConfig;
import ru.analystgym.review.domain.PromptVersion;
import ru.analystgym.review.domain.Provider;
import ru.analystgym.review.repo.AgentRepository;
import ru.analystgym.review.repo.PromptRepository;
import ru.analystgym.review.repo.PromptVersionRepository;
import ru.analystgym.review.repo.ProviderRepository;

/**
 * LLM-инфраструктура (UC-L01–L06): провайдеры с health-check, агенты,
 * версии промптов с трафиком и promote. Новая версия начинается с 0%,
 * рабочая редакция неизменяема; сумма долей и нумерация защищены блокировкой промпта.
 */
@Service
public class LlmAdminService {

    private final ProviderRepository providers;
    private final AgentRepository agents;
    private final PromptRepository prompts;
    private final PromptVersionRepository versions;
    private final ObjectMapper mapper;
    private final AdminAudit audit;

    public LlmAdminService(
            ProviderRepository providers,
            AgentRepository agents,
            PromptRepository prompts,
            PromptVersionRepository versions,
            ObjectMapper mapper,
            AdminAudit audit) {
        this.providers = providers;
        this.agents = agents;
        this.prompts = prompts;
        this.versions = versions;
        this.mapper = mapper;
        this.audit = audit;
    }

    /* ---------- провайдеры ---------- */

    @Transactional(readOnly = true)
    public List<ProviderDto> listProviders() {
        List<ProviderDto> rows = new ArrayList<>();
        for (Provider provider : providers.findAll()) {
            rows.add(dtoOf(provider, provider.getKeyEnv() != null && !provider.getKeyEnv().isBlank()
                    && System.getenv(provider.getKeyEnv()) != null));
        }
        return rows;
    }

    @Transactional
    public SaveResult saveProvider(UUID authorId, ProviderDto body) {
        if (body == null || body.id() == null || !body.id().matches("[a-z0-9-]{2,32}")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "bad id");
        }
        if (body.name() == null || body.name().isBlank()
                || body.baseUrl() == null || body.baseUrl().isBlank()
                || body.model() == null || body.model().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "bad provider");
        }
        if (body.timeoutSec() == null || body.timeoutSec() < 10 || body.timeoutSec() > 300) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "bad timeout");
        }
        Provider provider = providers.findById(body.id()).orElseGet(Provider::new);
        boolean created = provider.getVersion() == null;
        if (!created) EditVersion.require(provider.getVersion(), body.version());
        else if (body.version() != null) throw new ResponseStatusException(HttpStatus.CONFLICT, "edit_conflict");
        provider.setId(body.id());
        provider.setName(body.name().trim());
        provider.setBaseUrl(body.baseUrl().trim().replaceAll("/+$", ""));
        provider.setModel(body.model().trim());
        provider.setKeyEnv(body.keyEnv() == null ? "" : body.keyEnv().trim());
        provider.setTimeoutSec(body.timeoutSec());
        provider.setEnabled(body.enabled() == null || body.enabled());
        provider = providers.saveAndFlush(provider);
        audit.log(authorId, created ? "provider.create" : "provider.update",
                "provider:" + provider.getId());
        return new SaveResult(dtoOf(provider, false), created);
    }

    public record SaveResult(ProviderDto provider, boolean created) {
    }

    /** Живая проверка: GET {base}/models с ключом (без ключа — сразу miss). */
    public ProviderDto healthCheck(String id) {
        Provider provider = providers.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        String key = provider.getKeyEnv() == null || provider.getKeyEnv().isBlank()
                ? "" : System.getenv(provider.getKeyEnv());
        if (key == null || key.isBlank()) {
            return dtoOf(provider, false);
        }
        try {
            HttpRequest request = HttpRequest.newBuilder(
                            URI.create(provider.getBaseUrl() + "/models"))
                    .timeout(Duration.ofSeconds(15))
                    .header("Authorization", "Bearer " + key)
                    .GET().build();
            HttpResponse<String> response = HttpClient.newBuilder()
                    .connectTimeout(Duration.ofSeconds(10)).build()
                    .send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            return dtoOf(provider, response.statusCode() >= 200 && response.statusCode() < 300);
        } catch (Exception e) {
            return dtoOf(provider, false);
        }
    }

    /* ---------- агенты ---------- */

    @Transactional(readOnly = true)
    public List<AgentDto> listAgents() {
        List<AgentDto> rows = new ArrayList<>();
        for (AgentConfig agent : agents.findAll()) {
            rows.add(dtoOf(agent));
        }
        rows.sort((a, b) -> a.id().compareTo(b.id()));
        return rows;
    }

    @Transactional
    public AgentDto saveAgent(UUID authorId, String id, AgentDto body) {
        AgentConfig agent = agents.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (body == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "empty body");
        }
        EditVersion.require(agent.getVersion(), body.version());
        if (body.name() != null) {
            if (body.name().trim().length() < 2 || body.name().trim().length() > 120) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "bad name");
            }
            agent.setName(body.name().trim());
        }
        if (body.role() != null) {
            agent.setRole(body.role().length() > 500 ? body.role().substring(0, 500) : body.role());
        }
        if (body.checks() != null) {
            if (body.checks().size() > 10 || body.checks().stream()
                    .anyMatch(c -> c == null || c.isBlank() || c.length() > 200)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "bad checks");
            }
            agent.setChecks(mapper.valueToTree(body.checks()));
        }
        if (body.model() != null) {
            agent.setModel(body.model().trim());
        }
        if (body.enabled() != null) {
            agent.setEnabled(body.enabled());
        }
        agents.saveAndFlush(agent);
        audit.log(authorId, "agent.update", "agent:" + id);
        return dtoOf(agent);
    }

    /* ---------- промпты ---------- */

    @Transactional(readOnly = true)
    public List<ru.analystgym.review.domain.Prompt> listPrompts() {
        return prompts.findAll();
    }

    @Transactional(readOnly = true)
    public List<PromptVersionDto> listVersions(String promptKey) {
        prompts.findById(promptKey)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        List<PromptVersionDto> rows = new ArrayList<>();
        for (PromptVersion version : versions.findByPromptKeyOrderByVDesc(promptKey)) {
            rows.add(dtoOf(version));
        }
        return rows;
    }

    /** Новая версия: номер max+1 под блокировкой, 0% трафика, changelog обязателен. */
    @Transactional
    public PromptVersionDto createVersion(UUID authorId, String promptKey, VersionCreateRequest body) {
        prompts.lockByKey(promptKey)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (body == null || body.text() == null || body.text().isBlank()
                || body.changelog() == null || body.changelog().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "text and changelog required");
        }
        if (body.traffic() == null || body.traffic() != 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "bad traffic");
        }
        int next = 1;
        for (PromptVersion version : versions.findByPromptKeyOrderByVDesc(promptKey)) {
            next = Math.max(next, version.getV() + 1);
        }
        PromptVersion created = new PromptVersion();
        created.setId(UUID.randomUUID());
        created.setPromptKey(promptKey);
        created.setV(next);
        created.setStatus(body.traffic() > 0 ? "canary" : "archived");
        created.setTraffic(body.traffic());
        created.setModel(body.model() == null ? "" : body.model().trim());
        created.setChangelog(body.changelog().trim());
        created.setText(body.text());
        created = versions.saveAndFlush(created);
        audit.log(authorId, "prompt.version", "prompt:" + promptKey + "@v" + next);
        return dtoOf(created);
    }

    /** Правка текста/changelog/model существующей версии (трафик — отдельно). */
    @Transactional
    public PromptVersionDto updateVersion(UUID authorId, UUID id, VersionCreateRequest body) {
        PromptVersion version = lockedVersion(id);
        if (body == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "empty body");
        }
        EditVersion.require(version.getVersion(), body.version());
        if (version.getTraffic() > 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "create_new_version_for_live_prompt");
        }
        if (body.text() != null) {
            if (body.text().isBlank()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "bad text");
            }
            version.setText(body.text());
        }
        if (body.changelog() != null) {
            version.setChangelog(body.changelog());
        }
        if (body.model() != null) {
            version.setModel(body.model().trim());
        }
        versions.saveAndFlush(version);
        audit.log(authorId, "prompt.edit", "prompt:" + version.getPromptKey() + "@v" + version.getV());
        return dtoOf(version);
    }

    /** Трафик версии 0–100: остаток получает активная редакция, сумма — 100%. */
    @Transactional
    public PromptVersionDto setTraffic(UUID authorId, UUID id, TrafficRequest body) {
        PromptVersion version = lockedVersion(id);
        if (body == null || body.traffic() == null || body.traffic() < 0 || body.traffic() > 100) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "bad traffic");
        }
        EditVersion.require(version.getVersion(), body.version());
        // Остаток получает текущая активная версия: сумма всегда остаётся 100%.
        var group = versions.findByPromptKeyOrderByVDesc(version.getPromptKey());
        var active = group.stream().filter(v -> "active".equals(v.getStatus()) && !v.getId().equals(id))
                .findFirst().orElse(null);
        int others = group.stream().filter(v -> !v.getId().equals(id) && v != active)
                .mapToInt(PromptVersion::getTraffic).sum();
        int remaining = 100 - body.traffic() - others;
        if (remaining < 0 || (active == null && remaining != 0)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "traffic_must_total_100");
        }
        if (active != null) active.setTraffic(remaining);
        version.setTraffic(body.traffic());
        version.setStatus(body.traffic() == 0 ? "archived" : active == null ? "active" : "canary");
        versions.flush();
        audit.log(authorId, "prompt.traffic",
                "prompt:" + version.getPromptKey() + "@v" + version.getV() + "=" + body.traffic());
        return dtoOf(version);
    }

    /** Promote: 100% трафика на версию, остальные — в архив. */
    @Transactional
    public PromptVersionDto promote(UUID authorId, UUID id, Long expectedVersion) {
        PromptVersion version = lockedVersion(id);
        EditVersion.require(version.getVersion(), expectedVersion);
        for (PromptVersion other : versions.findByPromptKeyOrderByVDesc(version.getPromptKey())) {
            if (other.getId().equals(version.getId())) {
                other.setStatus("active");
                other.setTraffic(100);
            } else {
                other.setStatus("archived");
                other.setTraffic(0);
            }
            versions.save(other);
        }
        versions.flush();
        audit.log(authorId, "prompt.promote",
                "prompt:" + version.getPromptKey() + "@v" + version.getV());
        return dtoOf(version);
    }

    private static ProviderDto dtoOf(Provider provider, boolean keyPresent) {
        return new ProviderDto(provider.getId(), provider.getName(), provider.getBaseUrl(),
                provider.getModel(), provider.getKeyEnv(), keyPresent, provider.getTimeoutSec(),
                provider.isEnabled(), provider.getVersion());
    }

    private static AgentDto dtoOf(AgentConfig agent) {
        List<String> checks = new ArrayList<>();
        JsonNode node = agent.getChecks();
        if (node != null && node.isArray()) {
            for (JsonNode check : node) {
                checks.add(check.asText(""));
            }
        }
        return new AgentDto(agent.getId(), agent.getName(), agent.getRole(),
                agent.getInitials(), checks, agent.getModel(), agent.isEnabled(),
                agent.getPromptKey(), agent.getVersion());
    }

    private static PromptVersionDto dtoOf(PromptVersion version) {
        return new PromptVersionDto(version.getId(), version.getPromptKey(), version.getV(),
                version.getStatus(), version.getTraffic(), version.getModel(),
                version.getChangelog(), version.getText(),
                version.getUpdatedAt() == null ? "" : version.getUpdatedAt().toString(), version.getVersion());
    }

    private PromptVersion lockedVersion(UUID id) {
        prompts.lockForVersion(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        return versions.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }
}
