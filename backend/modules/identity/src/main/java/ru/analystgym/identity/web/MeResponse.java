package ru.analystgym.identity.web;

import java.util.UUID;

/** Профиль текущего пользователя для шапки фронта и /api/auth/me. */
public record MeResponse(UUID id, String email, String name, String role) {
}
