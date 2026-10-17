package ru.analystgym.notify.service;

import java.util.*;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

/** В кабинете видны только свои уведомления, независимо от доступности SMTP. */
@RestController
public class NotificationController {
    private final NotificationOutbox outbox;
    public NotificationController(NotificationOutbox outbox){this.outbox=outbox;}
    @GetMapping("/api/notifications")
    public List<Map<String,Object>> mine(Authentication auth) {
        if(auth==null || !(auth.getPrincipal() instanceof UUID id)) throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.UNAUTHORIZED);
        return outbox.mine(id);
    }
}
