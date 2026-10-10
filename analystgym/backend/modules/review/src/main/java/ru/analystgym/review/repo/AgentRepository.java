package ru.analystgym.review.repo;

import org.springframework.data.jpa.repository.JpaRepository;
import ru.analystgym.review.domain.AgentConfig;

/** Конфиги агентов-ревьюеров (sa/arch). */
public interface AgentRepository extends JpaRepository<AgentConfig, String> {
}
