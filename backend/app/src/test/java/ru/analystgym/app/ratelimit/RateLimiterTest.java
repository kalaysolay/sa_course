package ru.analystgym.app.ratelimit;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Окно лимита без sleep: часы подменяем, границу проверяем точным счётом.
 */
class RateLimiterTest {

    /** Лимит 3/мин, часы двигаем вручную. */
    private RateLimiter limiterAt(AtomicReference<Instant> now) {
        return new RateLimiter(new TickClock(now), 3, 3, 3, 3);
    }

    @Test
    void триПроходятЧетвёртыйРежется() {
        var now = new AtomicReference<>(Instant.parse("2026-10-10T10:00:00Z"));
        RateLimiter limiter = limiterAt(now);

        assertThat(limiter.allow("submit", "u1")).isTrue();
        assertThat(limiter.allow("submit", "u1")).isTrue();
        assertThat(limiter.allow("submit", "u1")).isTrue();
        assertThat(limiter.allow("submit", "u1")).isFalse();
    }

    @Test
    void окноСдвигаетсяИЛимитВозвращается() {
        var now = new AtomicReference<>(Instant.parse("2026-10-10T10:00:00Z"));
        RateLimiter limiter = limiterAt(now);
        limiter.allow("submit", "u1");
        limiter.allow("submit", "u1");
        limiter.allow("submit", "u1");
        assertThat(limiter.allow("submit", "u1")).isFalse();

        // Через 61 секунду старые попадания выпадают из окна.
        now.set(Instant.parse("2026-10-10T10:01:01Z"));

        assertThat(limiter.allow("submit", "u1")).isTrue();
    }

    @Test
    void ключиНезависимы() {
        var now = new AtomicReference<>(Instant.parse("2026-10-10T10:00:00Z"));
        RateLimiter limiter = limiterAt(now);
        limiter.allow("submit", "u1");
        limiter.allow("submit", "u1");
        limiter.allow("submit", "u1");

        assertThat(limiter.allow("submit", "u2")).isTrue();
        assertThat(limiter.allow("login", "u1")).isTrue();
    }

    /** Часы поверх атомарного instante (fixed даёт одно значение навсегда). */
    private static final class TickClock extends Clock {
        private final AtomicReference<Instant> now;

        TickClock(AtomicReference<Instant> now) {
            this.now = now;
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now.get();
        }
    }
}
