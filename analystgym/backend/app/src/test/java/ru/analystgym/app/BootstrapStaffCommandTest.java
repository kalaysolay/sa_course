package ru.analystgym.app;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Вход команды не должен пропускать неподдерживаемые роли или раскрывать секретный JSON в ошибке. */
class BootstrapStaffCommandTest {
    @Test
    void ошибкаРазбораНеСодержитСекретныйДокумент() {
        assertThatThrownBy(() -> run("[{\"password\":\"private-password\", broken]"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("Некорректный JSON начальных пользователей")
                .hasNoCause();
    }

    @Test
    void неподдерживаемаяРольОтвергаетсяДоПодключенияКБазе() {
        assertThatThrownBy(() -> run("[{\"email\":\"x@example.com\",\"name\":\"X\",\"role\":\"STUDENT\",\"password\":\"safe-password\"}]"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("Некорректная запись служебного пользователя");
    }

    @Test
    void чрезмерныйВводНеПередаётсяВJsonПарсер() {
        assertThatThrownBy(() -> run("x".repeat(65537)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("Слишком большой документ начальных пользователей");
    }

    /** Пустое окружение доказывает, что некорректный ввод отвергается до обращения к БД. */
    private static void run(String document) throws Exception {
        BootstrapStaffCommand.run(Map.of(), new ByteArrayInputStream(document.getBytes(StandardCharsets.UTF_8)));
    }
}
