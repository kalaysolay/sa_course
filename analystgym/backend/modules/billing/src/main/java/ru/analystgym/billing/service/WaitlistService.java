package ru.analystgym.billing.service;

import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import ru.analystgym.billing.domain.WaitlistEntry;
import ru.analystgym.billing.repo.WaitlistRepository;

/**
 * Предзапись на Pro вместо paywall: email + телефон в БД, изучаем спрос.
 * Email храним строчными, телефон нормализуем к +7XXXXXXXXXX
 * (8 → 7, 10 цифр без кода → добавляем 7). Дубль email — 409, а не вторая строка.
 */
@Service
public class WaitlistService {

    private static final Pattern EMAIL =
            Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$");

    private final WaitlistRepository waitlist;

    public WaitlistService(WaitlistRepository waitlist) {
        this.waitlist = waitlist;
    }

    /** Почта строчными: регистр при сравнении не должен плодить дубли. */
    public static String normalizeEmail(String raw) {
        String email = raw == null ? "" : raw.trim().toLowerCase(Locale.ROOT);
        if (email.length() < 3 || email.length() > 254 || !EMAIL.matcher(email).matches()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "bad email");
        }
        return email;
    }

    /**
     * Телефон к +7XXXXXXXXXX: маска фронта даёт то же самое,
     * но API обязано проверять само (фронт обходится curl).
     */
    public static String normalizePhone(String raw) {
        String digits = raw == null ? "" : raw.replaceAll("\\D", "");
        if (digits.startsWith("8") && digits.length() == 11) {
            digits = "7" + digits.substring(1);
        } else if (digits.length() == 10) {
            digits = "7" + digits;
        }
        if (!digits.matches("7\\d{10}")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "bad phone");
        }
        return "+" + digits;
    }

    /** Заявка идемпотентна по email: повтор — 409 already_registered. */
    @Transactional
    public WaitlistEntry join(String rawEmail, String rawPhone, String rawSource) {
        String email = normalizeEmail(rawEmail);
        String phone = normalizePhone(rawPhone);
        if (waitlist.findByEmail(email).isPresent()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "already_registered");
        }
        WaitlistEntry entry = new WaitlistEntry();
        entry.setId(UUID.randomUUID());
        entry.setEmail(email);
        entry.setPhone(phone);
        String source = rawSource == null ? "" : rawSource.trim();
        entry.setSource(source.length() > 32 ? source.substring(0, 32) : source);
        return waitlist.save(entry);
    }

    @Transactional(readOnly = true)
    public List<WaitlistEntry> list(int limit) {
        List<WaitlistEntry> all = waitlist.findAllByOrderByCreatedAtDesc();
        int max = Math.max(1, Math.min(limit <= 0 ? 100 : limit, 500));
        return all.size() > max ? all.subList(0, max) : all;
    }
}
