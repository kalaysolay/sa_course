package ru.analystgym.billing.web;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import ru.analystgym.billing.service.BillingService;
import ru.analystgym.billing.web.BillingDto.AttemptOrderRow;
import ru.analystgym.billing.web.BillingDto.ConfirmRequest;
import ru.analystgym.billing.web.BillingDto.GrantRequest;
import ru.analystgym.billing.web.BillingDto.OrderRequest;
import ru.analystgym.billing.web.BillingDto.OrderView;
import ru.analystgym.billing.web.BillingDto.PlanView;
import ru.analystgym.billing.web.BillingDto.PromoCreateRequest;
import ru.analystgym.billing.web.BillingDto.PromoView;
import ru.analystgym.billing.web.BillingDto.RedeemRequest;
import ru.analystgym.billing.web.BillingDto.StatusView;
import ru.analystgym.billing.web.BillingDto.SubscriptionView;
import ru.analystgym.billing.web.BillingDto.WebhookRequest;
import ru.analystgym.billing.web.BillingDto.WebhookResponse;
import ru.analystgym.identity.domain.User;
import ru.analystgym.identity.repo.UserRepository;
import ru.analystgym.identity.security.Roles;

/**
 * Деньги (UC-B01–B04). Тарифы публичны, остальное — своим; вебхук —
 * без кук и CSRF (зовёт провайдер), с проверкой подписи, когда задан секрет.
 */
@RestController
public class BillingController {

    private final BillingService billing;
    private final UserRepository users;

    public BillingController(BillingService billing, UserRepository users) {
        this.billing = billing;
        this.users = users;
    }

    @GetMapping("/api/billing/plans")
    public List<PlanView> plans() {
        return billing.plans();
    }

    @PostMapping("/api/billing/orders")
    public ResponseEntity<OrderView> order(
            @RequestBody OrderRequest body, Authentication authentication) {
        UUID userId = currentUser(authentication);
        if (body == null || body.plan() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "plan required");
        }
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(billing.createOrder(userId, body.plan()));
    }

    @GetMapping("/api/billing/orders")
    public List<AttemptOrderRow> orders(Authentication authentication) {
        return billing.myOrders(currentUser(authentication));
    }

    @GetMapping("/api/billing/status")
    public StatusView status(Authentication authentication) {
        return billing.statusOf(currentUser(authentication));
    }

    @PostMapping("/api/billing/promocodes/redeem")
    public SubscriptionView redeem(
            @RequestBody RedeemRequest body, Authentication authentication) {
        if (body == null || body.code() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "code required");
        }
        return billing.redeem(currentUser(authentication), body.code());
    }

    @PostMapping("/api/billing/subscriptions/{id}/cancel")
    public SubscriptionView cancel(@PathVariable UUID id, Authentication authentication) {
        return billing.cancel(currentUser(authentication), id);
    }

    /** Входящий вебхук провайдера: без сессии, идемпотентный, с подписью. */
    @PostMapping("/api/billing/webhooks/yookassa")
    public WebhookResponse webhook(
            @RequestBody WebhookRequest body,
            @RequestHeader(value = "X-Webhook-Signature", required = false) String signature) {
        if (body == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "empty body");
        }
        return billing.webhook(body.providerPaymentId(), body.status(), signature);
    }

    /** Тестовое подтверждение fake-платежа (dev/E2E, в проде закрыто флагом). */
    @PostMapping("/api/billing/test/confirm")
    public WebhookResponse testConfirm(
            @RequestBody ConfirmRequest body, Authentication authentication) {
        currentUser(authentication);
        if (body == null || body.paymentId() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "paymentId required");
        }
        return billing.testConfirm(body.paymentId());
    }

    /* ---------- персонал (SUPERADMIN) ---------- */

    @PostMapping("/api/admin/promocodes")
    public ResponseEntity<PromoView> createPromo(
            @RequestBody PromoCreateRequest body, Authentication authentication) {
        User caller = superadmin(authentication);
        if (body == null || body.code() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "code required");
        }
        return ResponseEntity.status(HttpStatus.CREATED).body(billing.createPromo(
                caller.getId(), body.code(), body.proDays(), body.maxUses()));
    }

    @GetMapping("/api/admin/promocodes")
    public List<PromoView> promos(Authentication authentication) {
        superadmin(authentication);
        return billing.listPromos();
    }

    @PatchMapping("/api/admin/promocodes/{code}")
    public PromoView promoActive(
            @PathVariable String code, @RequestBody Map<String, Boolean> body,
            Authentication authentication) {
        superadmin(authentication);
        if (body == null || !body.containsKey("active")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "active required");
        }
        return billing.setPromoActive(code, body.get("active"));
    }

    @PostMapping("/api/admin/subscriptions/grant")
    public SubscriptionView grant(
            @RequestBody GrantRequest body, Authentication authentication) {
        superadmin(authentication);
        if (body == null || body.email() == null || body.proDays() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "email and proDays required");
        }
        User target = users.findByEmail(body.email().trim().toLowerCase(java.util.Locale.ROOT))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        return billing.grantPro(target.getId(), body.proDays());
    }

    @GetMapping("/api/admin/orders")
    public List<AttemptOrderRow> allOrders(
            @RequestParam(required = false) String status,
            @RequestParam(required = false, defaultValue = "100") int limit,
            Authentication authentication) {
        superadmin(authentication);
        return billing.allOrders(status, limit);
    }

    private static UUID currentUser(Authentication authentication) {
        if (authentication == null || !(authentication.getPrincipal() instanceof UUID userId)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        }
        return userId;
    }

    private User superadmin(Authentication authentication) {
        User user = users.findById(currentUser(authentication))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        Roles.require(user, Roles.SUPERADMIN);
        return user;
    }
}
