package ru.analystgym.identity.web;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

/** Вход по email+пароль. Ответ — пустое тело + куки (токены не светим в JSON). */
public record LoginRequest(
        @Email @NotBlank String email,
        @NotBlank String password) {
}
