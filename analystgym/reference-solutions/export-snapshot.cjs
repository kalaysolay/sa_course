// Читаем только опубликованные задания из локальной БД, без пользовательских данных.
const { execFileSync } = require('node:child_process');
const { writeFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const { createHash } = require('node:crypto');
const target = join(__dirname, 'snapshot.json');
if (existsSync(target)) throw new Error('Снимок уже существует. Для нового аудита создайте отдельный каталог.');
const sql = `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT jsonb_build_object('database', current_database(), 'capturedAt', now(),
 'tasks', coalesce(jsonb_agg(jsonb_build_object(
 'id',id,'title',title,'level',level_id,'status',status,'version',version,
 'updatedAt',updated_at,'statement',statement,'starterTabs',starter_tabs
 ) ORDER BY id),'[]'::jsonb))
FROM tasks WHERE status='published'; COMMIT;`;
const output = execFileSync('docker', ['exec','analystgym-pg','psql','-X','-U','analystgym','-d','analystgym','-Atq','-v','ON_ERROR_STOP=1','-c',sql], { encoding:'utf8', maxBuffer: 8 * 1024 * 1024 });
const snapshot = JSON.parse(output.trim());
snapshot.source = { kind:'local-postgresql', container:'analystgym-pg', table:'tasks', filter:"status = 'published'", productionVerified:false };
snapshot.sha256 = createHash('sha256').update(JSON.stringify(snapshot.tasks)).digest('hex');
writeFileSync(target, JSON.stringify(snapshot,null,2)+'\n','utf8');
console.log(JSON.stringify({count:snapshot.tasks.length, ids:snapshot.tasks.map(t=>t.id), sha256:snapshot.sha256}));
