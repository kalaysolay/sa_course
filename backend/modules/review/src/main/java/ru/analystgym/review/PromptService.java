package ru.analystgym.review;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ThreadLocalRandom;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import ru.analystgym.review.domain.PromptVersion;
import ru.analystgym.review.repo.PromptVersionRepository;

/**
 * Раздача версий промптов по трафику (канарейки из админки): среди версий
 * с traffic>0 выбираем взвешенным жребием; если таких нет — активную;
 * если и её нет — 409 (методист сломал промпт, чинить в админке).
 */
@Service
public class PromptService {

    private final PromptVersionRepository versions;

    public PromptService(PromptVersionRepository versions) {
        this.versions = versions;
    }

    /** Выбранная версия + её текст с подставленными плейсхолдерами. */
    public record ResolvedPrompt(PromptVersion version, String text) {
    }

    @Transactional(readOnly = true)
    public ResolvedPrompt resolve(String promptKey, PromptContext context) {
        List<PromptVersion> all = versions.findByPromptKeyOrderByVDesc(promptKey);
        List<PromptVersion> weighted = new ArrayList<>();
        for (PromptVersion version : all) {
            if (version.getTraffic() > 0) {
                weighted.add(version);
            }
        }
        PromptVersion chosen = null;
        if (!weighted.isEmpty()) {
            int total = 0;
            for (PromptVersion version : weighted) {
                total += version.getTraffic();
            }
            int roll = ThreadLocalRandom.current().nextInt(total);
            for (PromptVersion version : weighted) {
                roll -= version.getTraffic();
                if (roll < 0) {
                    chosen = version;
                    break;
                }
            }
            if (chosen == null) {
                chosen = weighted.get(weighted.size() - 1);
            }
        } else {
            chosen = versions.findFirstByPromptKeyAndStatus(promptKey, "active").orElse(null);
        }
        if (chosen == null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "no prompt version");
        }
        return new ResolvedPrompt(chosen, render(chosen.getText(), context));
    }

    /** Плейсхолдеры {{solution}} {{rubric}} {{task_title}} {{criteria}}. */
    static String render(String template, PromptContext context) {
        String text = template == null ? "" : template;
        text = text.replace("{{solution}}", context.solution());
        text = text.replace("{{rubric}}", context.rubric());
        text = text.replace("{{task_title}}", context.taskTitle());
        text = text.replace("{{criteria}}", context.criteria());
        return text;
    }

    public record PromptContext(String solution, String rubric, String taskTitle, String criteria) {
    }
}
