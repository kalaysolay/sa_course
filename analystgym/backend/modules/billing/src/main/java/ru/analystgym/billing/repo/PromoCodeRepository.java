package ru.analystgym.billing.repo;

import org.springframework.data.jpa.repository.JpaRepository;
import ru.analystgym.billing.domain.PromoCode;

/** Промокоды по коду (верхний регистр, без пробелов — приводит сервис). */
public interface PromoCodeRepository extends JpaRepository<PromoCode, String> {
}
