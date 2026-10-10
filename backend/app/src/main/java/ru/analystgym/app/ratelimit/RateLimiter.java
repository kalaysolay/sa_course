package ru.analystgym.app.ratelimit;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Лимиты частоты (MVP, один инстанс): скользящее окно в памяти.
 * Защита от перебора логина и спама submit/диагностикой/жалобами.
 * На несколько инстансов не рассчитан — тогда Redis (см. ADR).
 */
@Component
public class RateLimiter {

    private final Clock clock;
    private final int loginPerMin;
    private final int submitPerMin;
    private final int assessmentPerMin;
    private final int complaintsPerMin;
    private final Map<String, ArrayDeque<Instant>> hits = new ConcurrentHashMap<>();

    @org.springframework.beans.factory.annotation.Autowired
    public RateLimiter(
            @Value("${ratelimit.login-per-min:20}") int loginPerMin,
            @Value("${ratelimit.submit-per-min:10}") int submitPerMin,
            @Value("${ratelimit.assessment-per-min:5}") int assessmentPerMin,
            @Value("${ratelimit.complaints-per-min:10}") int complaintsPerMin) {
        this(Clock.systemUTC(), loginPerMin, submitPerMin, assessmentPerMin, complaintsPerMin);
    }

    /** Часы инжектим ради тестов (фиксированное время вместо sleep). */
    RateLimiter(Clock clock, int loginPerMin, int submitPerMin,
                int assessmentPerMin, int complaintsPerMin) {
        this.clock = clock;
        this.loginPerMin = loginPerMin;
        this.submitPerMin = submitPerMin;
        this.assessmentPerMin = assessmentPerMin;
        this.complaintsPerMin = complaintsPerMin;
    }

    /** Разрешить ли вызов: не больше max в последнюю минуту. Потокобезопасно. */
    public boolean allow(String bucket, String key) {
        int max = switch (bucket) {
            case "login" -> loginPerMin;
            case "submit" -> submitPerMin;
            case "assessment" -> assessmentPerMin;
            case "complaints" -> complaintsPerMin;
            default -> 60;
        };
        Instant now = clock.instant();
        Instant floor = now.minus(Duration.ofMinutes(1));
        ArrayDeque<Instant> deque =
                hits.computeIfAbsent(bucket + "|" + key, k -> new ArrayDeque<>());
        synchronized (deque) {
            while (!deque.isEmpty() && deque.peekFirst().isBefore(floor)) {
                deque.pollFirst();
            }
            if (deque.size() >= max) {
                return false;
            }
            deque.addLast(now);
            return true;
        }
    }

    /** Чистим протухшие окна, чтобы карта не росла бесконечно. */
    @Scheduled(fixedDelay = 3600000)
    public void purge() {
        Instant floor = clock.instant().minus(Duration.ofMinutes(1));
        hits.entrySet().removeIf(entry -> {
            ArrayDeque<Instant> deque = entry.getValue();
            synchronized (deque) {
                while (!deque.isEmpty() && deque.peekFirst().isBefore(floor)) {
                    deque.pollFirst();
                }
                return deque.isEmpty();
            }
        });
    }
}
