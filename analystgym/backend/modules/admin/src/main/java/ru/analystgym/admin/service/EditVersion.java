package ru.analystgym.admin.service;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/** Проверка версии формы до записи; гонку транзакций дополнительно ловит JPA. */
final class EditVersion {
    private EditVersion() { }

    static void require(Long actual, Long expected) {
        if (expected == null || !expected.equals(actual)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "edit_conflict");
        }
    }
}
