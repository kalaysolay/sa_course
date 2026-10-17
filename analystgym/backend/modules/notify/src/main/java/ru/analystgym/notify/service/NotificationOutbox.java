package ru.analystgym.notify.service;

import java.time.Instant;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Долговечное уведомление: в кабинет попадает в той же транзакции, что и изменение результата. */
@Service
public class NotificationOutbox {
    private final JdbcTemplate db;
    private final int maxTries, retrySeconds, leaseSeconds;
    private final String base;
    public NotificationOutbox(JdbcTemplate db,@Value("${notifications.max-tries:5}") int maxTries,
            @Value("${notifications.retry-seconds:30}") int retrySeconds,@Value("${notifications.lease-seconds:120}") int leaseSeconds,
            @Value("${app.site.base-url:http://localhost:8080}") String base) {
        if(maxTries<1 || retrySeconds<1 || leaseSeconds<30) throw new IllegalArgumentException("Некорректные настройки доставки");
        this.db=db;this.maxTries=maxTries;this.retrySeconds=retrySeconds;this.leaseSeconds=leaseSeconds;
        this.base=base.replaceAll("/+$","");
    }
    public record Message(UUID id,UUID token,String email,String subject,String body) { }

    @Transactional
    public void enqueue(UUID user,String email,String key,String subject,String body,String link) {
        db.update("INSERT INTO user_notifications(id,user_id,email,dedupe_key,subject,body,link) VALUES(?,?,?,?,?,?,?) ON CONFLICT(dedupe_key) DO NOTHING",
                UUID.randomUUID(),user,email,key,subject,body+"\n"+base+link,link);
    }

    @Transactional(readOnly=true)
    public List<Map<String,Object>> mine(UUID user) {
        return db.queryForList("SELECT id,subject,body,link,status AS \"emailStatus\",created_at AS \"createdAt\" FROM user_notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 50",user);
    }

    @Transactional
    public Optional<Message> claim() {
        var rows=db.queryForList("SELECT * FROM user_notifications WHERE (status='pending' AND next_run_at<=now()) OR (status='sending' AND lease_until<=now()) ORDER BY next_run_at LIMIT 1 FOR UPDATE SKIP LOCKED");
        if(rows.isEmpty()) return Optional.empty();
        var r=rows.get(0);var id=(UUID)r.get("id");int tries=((Number)r.get("tries")).intValue();
        if(tries>=maxTries){db.update("UPDATE user_notifications SET status='failed',error='delivery_retries_exhausted',lease_token=NULL,lease_until=NULL WHERE id=?",id);return Optional.empty();}
        UUID token=UUID.randomUUID();
        db.update("UPDATE user_notifications SET status='sending',tries=tries+1,lease_token=?,lease_until=? WHERE id=?",token,java.sql.Timestamp.from(Instant.now().plusSeconds(leaseSeconds)),id);
        return Optional.of(new Message(id,token,(String)r.get("email"),(String)r.get("subject"),(String)r.get("body")));
    }

    @Transactional
    public void delivered(Message m) {
        db.update("UPDATE user_notifications SET status='sent',error=NULL,lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=? AND lease_until>now()",m.id(),m.token());
    }

    @Transactional
    public void failed(Message m) {
        db.update("UPDATE user_notifications SET status=CASE WHEN tries>=? THEN 'failed' ELSE 'pending' END,error='smtp_unavailable',next_run_at=now()+(? * power(2,least(tries-1,10))) * interval '1 second',lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=? AND lease_until>now()",
                maxTries,retrySeconds,m.id(),m.token());
    }
}
