package ru.analystgym.review.repo;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import ru.analystgym.review.domain.Provider;

/** Провайдеры LLM; ключи — только имена env-переменных, не значения. */
public interface ProviderRepository extends JpaRepository<Provider, String> {

    List<Provider> findByEnabledTrue();
}
