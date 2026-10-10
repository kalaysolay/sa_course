package ru.analystgym.assessment.repo;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import ru.analystgym.assessment.domain.Question;

/** Банк вопросов: студенту — только активные в детерминированном порядке. */
public interface QuestionRepository extends JpaRepository<Question, String> {

    List<Question> findByActiveTrueOrderByIdAsc();
}
