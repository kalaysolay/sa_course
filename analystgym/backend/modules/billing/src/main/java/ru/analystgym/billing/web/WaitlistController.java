package ru.analystgym.billing.web;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import ru.analystgym.billing.domain.WaitlistEntry;
import ru.analystgym.billing.service.WaitlistService;
import ru.analystgym.identity.domain.User;
import ru.analystgym.identity.repo.UserRepository;
import ru.analystgym.identity.security.Roles;

/**
 * Предзапись на Pro (гостевая): POST открыт всем — спрос меряем
 * и у анонимов, лимит — 60/мин с IP (см. RateLimitInterceptor).
 * Список — только SUPERADMIN: там персональные данные.
 */
@RestController
public class WaitlistController {

    private final WaitlistService waitlist;
    private final UserRepository users;

    public WaitlistController(WaitlistService waitlist, UserRepository users) {
        this.waitlist = waitlist;
        this.users = users;
    }

    public record JoinRequest(String email, String phone, String source) {
    }

    public record JoinView(UUID id, String email, String phone) {
    }

    public record WaitlistRow(UUID id, String email, String phone, String source, String createdAt) {
    }

    @PostMapping("/api/waitlist")
    public ResponseEntity<JoinView> join(@RequestBody JoinRequest body) {
        if (body == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "empty body");
        }
        WaitlistEntry saved = waitlist.join(body.email(), body.phone(), body.source());
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(new JoinView(saved.getId(), saved.getEmail(), saved.getPhone()));
    }

    @GetMapping("/api/admin/waitlist")
    public List<WaitlistRow> list(
            @RequestParam(required = false, defaultValue = "100") int limit,
            Authentication authentication) {
        superadmin(authentication);
        return waitlist.list(limit).stream()
                .map(e -> new WaitlistRow(e.getId(), e.getEmail(), e.getPhone(), e.getSource(),
                        e.getCreatedAt() == null ? "" : e.getCreatedAt().toString()))
                .toList();
    }

    private User superadmin(Authentication authentication) {
        UUID userId = null;
        if (authentication != null && authentication.getPrincipal() instanceof UUID id) {
            userId = id;
        }
        if (userId == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        }
        User user = users.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        Roles.require(user, Roles.SUPERADMIN);
        return user;
    }
}
