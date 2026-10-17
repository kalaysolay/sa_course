package ru.analystgym.identity.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import ru.analystgym.identity.domain.User;
import ru.analystgym.identity.repo.PasswordResetRepository;
import ru.analystgym.identity.repo.RefreshTokenRepository;
import ru.analystgym.identity.repo.UserRepository;
import ru.analystgym.identity.security.JwtService;
import ru.analystgym.identity.security.Roles;

/**
 * Сценарии входа без БД: репозитории — моки, bcrypt и JWT — настоящие.
 * Важно: email нормализуется (MiXed@Case → mixed@case), повторная
 * регистрация и неверный пароль дают понятные исключения, а не 500.
 */
@ExtendWith(MockitoExtension.class)
class AuthServiceTest {

    @Mock
    UserRepository users;

    @Mock
    RefreshTokenRepository sessions;

    @Mock
    PasswordResetRepository resets;

    PasswordEncoder passwords = new BCryptPasswordEncoder();

    JwtService jwt = new JwtService("test-secret-0123456789abcdef-test", 900, 2592000);

    AuthService auth() {
        return new AuthService(users, sessions, resets, passwords, jwt, 2592000,
                mock(ru.analystgym.notify.service.NotificationService.class));
    }

    @Test
    void регистрацияНормализуетEmail() {
        when(users.findByEmail("user@example.com")).thenReturn(Optional.empty());
        when(users.save(any(User.class))).thenAnswer(call -> call.getArgument(0));

        User saved = auth().register("  User@Example.COM ", "password123", "Тест");

        assertThat(saved.getEmail()).isEqualTo("user@example.com");
        ArgumentCaptor<User> captor = ArgumentCaptor.forClass(User.class);
        verify(users).save(captor.capture());
        // В БД уходит bcrypt-хэш, а не сырой пароль.
        assertThat(passwords.matches("password123", captor.getValue().getPasswordHash())).isTrue();
    }

    @Test
    void повторнаяРегистрацияОтклоняется() {
        when(users.findByEmail("dup@example.com"))
                .thenReturn(Optional.of(User.of("dup@example.com", "hash", "Дубль")));

        assertThatThrownBy(() -> auth().register("dup@example.com", "password123", "Дубль"))
                .isInstanceOf(AuthService.EmailTakenException.class);
    }

    @Test
    void входВыдаётПаруТокенов() {
        User user = User.of("user@example.com", passwords.encode("password123"), "Тест");
        giveId(user);
        when(users.findIdByEmail("user@example.com")).thenReturn(Optional.of(user.getId()));
        when(users.lockById(user.getId())).thenReturn(Optional.of(user));

        AuthService.TokenPair pair = auth().login("user@example.com", "password123");

        assertThat(pair.access()).isNotBlank();
        assertThat(pair.refresh()).isNotBlank();
        assertThat(jwt.parseAccess(pair.access())).isPresent();
    }

    @Test
    void неверныйПарольНеУточняетЧтоИменноНеТак() {
        User user = User.of("user@example.com", passwords.encode("password123"), "Тест");
        giveId(user);
        when(users.findIdByEmail("user@example.com")).thenReturn(Optional.of(user.getId()));
        when(users.lockById(user.getId())).thenReturn(Optional.of(user));

        assertThatThrownBy(() -> auth().login("user@example.com", "wrong-pass"))
                .isInstanceOf(AuthService.InvalidCredentialsException.class);
    }

    @Test
    void несуществующийEmailДаётТоЖеИсключениеЧтоИНеверныйПароль() {
        when(users.findIdByEmail("ghost@example.com")).thenReturn(Optional.empty());

        // Одинаковый ответ на обе ситуации — не раскрываем, какие email зарегистрированы.
        assertThatThrownBy(() -> auth().login("ghost@example.com", "whatever"))
                .isInstanceOf(AuthService.InvalidCredentialsException.class);
    }

    @Test
    void публичнаяРегистрацияНикогдаНеВыдаётСуперадмина() {
        // Знание адреса владельца не должно давать административные права.
        when(users.findByEmail("boss@example.com")).thenReturn(Optional.empty());
        when(users.save(any(User.class))).thenAnswer(call -> call.getArgument(0));

        User saved = auth()
                .register("Boss@Example.com", "password123", "Босс");

        assertThat(saved.getRole()).isEqualTo("STUDENT");
    }

    @Test
    void обычныйПользовательОстаётсяСтудентом() {
        when(users.findByEmail("user@example.com")).thenReturn(Optional.empty());
        when(users.save(any(User.class))).thenAnswer(call -> call.getArgument(0));

        User saved = auth().register("user@example.com", "password123", "Тест");

        assertThat(saved.getRole()).isEqualTo("STUDENT");
    }

    @Test
    void oauthСоздаётНовогоБезПарольногоВхода() {
        when(users.findByEmail("g@example.com")).thenReturn(Optional.empty());
        when(users.save(any(User.class))).thenAnswer(call -> {
            User created = call.getArgument(0);
            giveId(created);
            return created;
        });

        AuthService.OAuthLogin login = auth().oauthLogin("G@Example.com", "Гугл");

        assertThat(login.user().getEmail()).isEqualTo("g@example.com");
        assertThat(login.user().getRole()).isEqualTo("STUDENT");
        assertThat(login.pair().access()).isNotBlank();
        // Случайный мусор вместо хэша: войти паролем нельзя.
        assertThat(passwords.matches("anything", login.user().getPasswordHash())).isFalse();
    }

    @Test
    void oauthПривязываетсяКСуществующему() {
        User existing = User.of("g@example.com", passwords.encode("password123"), "Старожил");
        giveId(existing);
        when(users.findByEmail("g@example.com")).thenReturn(Optional.of(existing));
        when(users.lockById(existing.getId())).thenReturn(Optional.of(existing));

        AuthService.OAuthLogin login = auth().oauthLogin("g@example.com", "Другое имя");

        assertThat(login.user().getId()).isEqualTo(existing.getId());
        // Пароль не затираем: вход обоими способами живёт.
        assertThat(passwords.matches("password123", login.user().getPasswordHash())).isTrue();
    }

    @Test
    void гардРолейПропускаетСвоихИРежетЧужих() {
        User methodist = User.of("m@example.com", "hash", "Метод");
        methodist.setRole("METHODIST");

        // Свой проходит, чужой получает 403, а не 500.
        Roles.require(methodist, "METHODIST", "SUPERADMIN");
        assertThatThrownBy(() -> Roles.require(methodist, "REVIEWER"))
                .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        assertThatThrownBy(() -> Roles.require(null, "STUDENT"))
                .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
    }

    /** ID в проде ставит БД; в тесте без неё подкладываем UUID вручную. */
    private static void giveId(User user) {
        try {
            var field = User.class.getDeclaredField("id");
            field.setAccessible(true);
            field.set(user, java.util.UUID.randomUUID());
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException(e);
        }
    }
}
