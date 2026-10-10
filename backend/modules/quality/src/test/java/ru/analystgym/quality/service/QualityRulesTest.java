package ru.analystgym.quality.service;

import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import ru.analystgym.quality.domain.Complaint;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Правила очереди жалоб без БД: переходы статусов, обязательный итог
 * у решённой, сводка решения для excerpt.
 */
class QualityRulesTest {

    private QualityService qualityWith(Complaint complaint) {
        var complaints = mock(ru.analystgym.quality.repo.ComplaintRepository.class);
        when(complaints.findById(complaint.getId())).thenReturn(java.util.Optional.of(complaint));
        when(complaints.save(any(Complaint.class))).thenAnswer(call -> call.getArgument(0));
        return new QualityService(complaints,
                mock(ru.analystgym.practice.repo.AttemptRepository.class),
                mock(ru.analystgym.practice.repo.ReviewRepository.class),
                mock(ru.analystgym.catalog.repo.TaskRepository.class),
                mock(ru.analystgym.identity.repo.UserRepository.class));
    }

    private static Complaint complaintOf(String status) {
        Complaint complaint = new Complaint();
        complaint.setId(UUID.randomUUID());
        complaint.setUserId(UUID.randomUUID());
        complaint.setAttemptId(UUID.randomUUID());
        complaint.setTaskId("int-timeouts");
        complaint.setStatus(status);
        return complaint;
    }

    @Test
    void новаяБерётсяВРаботу() {
        Complaint complaint = complaintOf("new");

        Complaint saved = qualityWith(complaint).resolve(complaint.getId(), "review", null);

        assertThat(saved.getStatus()).isEqualTo("review");
    }

    @Test
    void решённаяТребуетИтогРазбора() {
        Complaint complaint = complaintOf("review");
        QualityService quality = qualityWith(complaint);

        assertThatThrownBy(() -> quality.resolve(complaint.getId(), "resolved", "  "))
                .isInstanceOf(ResponseStatusException.class)
                .matches(e -> ((ResponseStatusException) e).getStatusCode() == HttpStatus.BAD_REQUEST);
    }

    @Test
    void закрытуюЖалобуНеПереоткрыть() {
        Complaint complaint = complaintOf("resolved");
        QualityService quality = qualityWith(complaint);

        assertThatThrownBy(() -> quality.resolve(complaint.getId(), "review", null))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void excerptРежетHtmlИДлину() {
        var tabs = JsonNodeFactory.instance.arrayNode();
        var tab = JsonNodeFactory.instance.objectNode();
        tab.put("type", "doc");
        tab.put("content", "<h1>Заголовок</h1><p>" + "слово ".repeat(100) + "</p>");
        tabs.add(tab);

        String excerpt = QualityService.excerptOf(tabs);

        assertThat(excerpt).doesNotContain("<");
        assertThat(excerpt.length()).isLessThanOrEqualTo(301);
        assertThat(QualityService.excerptOf(new ObjectMapper().createArrayNode())).isEmpty();
    }

    @Test
    void статусыОчередиВалидируются() {
        QualityService quality = qualityWith(complaintOf("new"));

        assertThatThrownBy(() -> quality.complaintQueue("bogus"))
                .isInstanceOf(ResponseStatusException.class);
        assertThat(quality.complaintQueue("all")).isEmpty();
        assertThat(quality.complaintQueue(null)).isEmpty();
    }
}
