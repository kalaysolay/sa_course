package ru.analystgym.quality.service;

import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.jdbc.core.JdbcTemplate;

/** Закрывает жалобу после готового повторного ревью; падение процесса не теряет связку. */
@Component
@org.springframework.boot.autoconfigure.condition.ConditionalOnProperty(name="quality.recheck.enabled",havingValue="true",matchIfMissing=true)
public class RecheckReconciler {
    private final JdbcTemplate db;private final QualityService quality;
    public RecheckReconciler(JdbcTemplate db,QualityService quality){this.db=db;this.quality=quality;}
    @Scheduled(fixedDelayString="${quality.recheck-poll-ms:2000}")
    public void reconcile() {
        for(UUID id:db.queryForList("SELECT c.id FROM complaints c JOIN attempts a ON a.id=c.recheck_attempt_id WHERE c.outcome='recheck_pending' AND a.status IN ('reviewed','failed') ORDER BY c.created_at LIMIT 20",UUID.class)) {
            try {quality.reconcileRecheck(id);}catch(RuntimeException retry){ /* Следующий проход повторит после отката транзакции. */ }
        }
    }
}
