package ru.analystgym.review.repo;

import org.springframework.data.jpa.repository.JpaRepository;
import ru.analystgym.review.domain.Prompt;

/** Промпты по ключу (sa-reviewer, arch-reviewer, ...). */
public interface PromptRepository extends JpaRepository<Prompt, String> {
    /** Блокировка всего промпта защищает номера версий и распределение трафика. */
    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("select p from Prompt p where p.key = :key")
    java.util.Optional<Prompt> lockByKey(@org.springframework.data.repository.query.Param("key") String key);

    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("select p from Prompt p where p.key = (select v.promptKey from PromptVersion v where v.id = :id)")
    java.util.Optional<Prompt> lockForVersion(@org.springframework.data.repository.query.Param("id") java.util.UUID id);
}
