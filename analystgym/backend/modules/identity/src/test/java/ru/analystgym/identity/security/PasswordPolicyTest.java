package ru.analystgym.identity.security;

import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Политика едина для регистрации, bootstrap и обоих способов смены пароля. */
class PasswordPolicyTest {
    @Test
    void пустыеИПростыеПоДлинеПаролиОтклоняются() {
        // Пустое значение и пробелы не должны обходить сервисную валидацию.
        for (String password : new String[]{null, "", "short", "        "}) {
            assertThatThrownBy(() -> PasswordPolicy.validate(password)).isInstanceOf(ResponseStatusException.class);
        }
    }

    @Test
    void проверяемБайтыАНеТолькоСимволы() {
        // bcrypt принимает 72 байта: 36 русских букв помещаются, 37 уже будут усечены.
        assertThatCode(() -> PasswordPolicy.validate("я".repeat(36))).doesNotThrowAnyException();
        assertThatThrownBy(() -> PasswordPolicy.validate("я".repeat(37))).isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> PasswordPolicy.validate("a".repeat(73))).isInstanceOf(ResponseStatusException.class);
    }
}
