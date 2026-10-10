package ru.analystgym.identity.web;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Заявка на регистрацию. Пароль сырой только здесь — дальше только bcrypt. */
public record RegisterRequest(
        @Email @NotBlank String email,
        @Size(min = 8, max = 100) String password,
        @Size(min = 1, max = 100) String name) {
}
