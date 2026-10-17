package ru.analystgym.billing.service;

import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Предзапись без БД: нормализация почты/телефона и дубль по email.
 * Маска фронта (+7) и сервер обязаны сходиться — иначе curl обойдёт проверку.
 */
class WaitlistServiceTest {

    private WaitlistService serviceOf(ru.analystgym.billing.repo.WaitlistRepository repo) {
        return new WaitlistService(repo);
    }

    private ru.analystgym.billing.repo.WaitlistRepository emptyRepo() {
        var repo = mock(ru.analystgym.billing.repo.WaitlistRepository.class);
        when(repo.findByEmail(any())).thenReturn(Optional.empty());
        when(repo.save(any())).thenAnswer(call -> call.getArgument(0));
        return repo;
    }

    @Test
    void почтаСтрочнымиТелефонКПлюс7() {
        // given: пользователь вводит почту с пробелами и телефон с восьмёрки;
        // when: вступает в предзапись;
        // then: в БД лежат нормализованные значения.
        var saved = serviceOf(emptyRepo()).join("  Ivan@Example.COM ", "8 (916) 123-45-67", "quota");

        assertThat(saved.getEmail()).isEqualTo("ivan@example.com");
        assertThat(saved.getPhone()).isEqualTo("+79161234567");
    }

    @Test
    void десятьЦифрБезКодаДобираютСемёрку() {
        // given: телефон без кода страны (как после стирания маски);
        // then: считаем российским мобильным, а не бракуем.
        var saved = serviceOf(emptyRepo()).join("a@b.cc", "9161234567", null);

        assertThat(saved.getPhone()).isEqualTo("+79161234567");
    }

    @Test
    void битаяПочтаИТелефонДают400() {
        // given: мусор вместо контактов; then: честные 400 без записи в БД.
        var service = serviceOf(emptyRepo());

        assertThatThrownBy(() -> service.join("не-почта", "+79161234567", null))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("400");
        assertThatThrownBy(() -> service.join("a@b.cc", "123", null))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("400");
    }

    @Test
    void повторныйEmailДаёт409АНеВторуюСтроку() {
        // given: email уже в предзаписи (спрос не накручиваем дублями);
        // then: 409 already_registered.
        var repo = mock(ru.analystgym.billing.repo.WaitlistRepository.class);
        var existing = new ru.analystgym.billing.domain.WaitlistEntry();
        existing.setEmail("ivan@example.com");
        when(repo.findByEmail("ivan@example.com")).thenReturn(Optional.of(existing));

        assertThatThrownBy(() -> serviceOf(repo).join("IVAN@example.com", "+79161234567", null))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("409");
    }
}
