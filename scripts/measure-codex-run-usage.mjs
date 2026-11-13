import fs from 'node:fs';
import path from 'node:path';
import { readData, writeData, writeText } from '../src/io.mjs';

const runDir = path.resolve(process.argv[2] || '');
const start = readData(path.join(runDir, '00-input', 'token-usage-start.json'));
const cutoff = start.captured_at;
const rootId = start.meta.id;
const keys = ['input_tokens', 'cached_input_tokens', 'cache_write_input_tokens', 'output_tokens', 'reasoning_output_tokens', 'total_tokens'];
const zero = () => Object.fromEntries(keys.map(key => [key, 0]));

// Читаем только первую строку остальных журналов: содержимое чужих чатов не нужно.
function metadata(file) {
  const fd = fs.openSync(file, 'r');
  let data = '';
  const buffer = Buffer.alloc(8192);
  try {
    while (!data.includes('\n') && data.length < 2_000_000) {
      const size = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (!size) break;
      data += buffer.toString('utf8', 0, size);
    }
    const row = JSON.parse(data.split('\n')[0]);
    return row.type === 'session_meta' ? row.payload : null;
  } catch {
    return null;
  } finally {
    fs.closeSync(fd);
  }
}

const sessionRoot = path.dirname(path.dirname(path.dirname(path.dirname(start.session_path))));
const files = [start.session_path];
function discover(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) discover(file);
    else if (entry.name.endsWith('.jsonl')) files.push(file);
  }
}
// Даты берём из метаданных текущего запуска, а не из часового пояса хоста.
const dates = new Set([start.baseline.timestamp.slice(0, 10), cutoff.slice(0, 10), new Date().toISOString().slice(0, 10)]);
for (const date of dates) {
  const dir = path.join(sessionRoot, ...date.split('-'));
  if (fs.existsSync(dir)) discover(dir);
}
const entries = [...new Set(files.map(file => path.resolve(file)))].map(file => ({ file, meta: metadata(file) })).filter(item => item.meta);
const selected = new Set([rootId]);
let changed;
do {
  changed = false;
  for (const { meta } of entries) {
    const parent = meta.source?.subagent?.thread_spawn?.parent_thread_id;
    if (selected.has(parent) && !selected.has(meta.id)) {
      selected.add(meta.id);
      changed = true;
    }
  }
} while (changed);

const sessions = [];
for (const { file, meta } of entries.filter(item => selected.has(item.meta.id))) {
  const events = [];
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line) continue;
    try {
      const row = JSON.parse(line);
      if (row.type === 'event_msg' && row.payload?.type === 'token_count' && row.payload.info?.total_token_usage) events.push(row);
    } catch { /* Незавершённая последняя строка будет доступна при следующем замере. */ }
  }
  const previous = events.filter(row => row.timestamp <= cutoff).at(-1);
  const baseline = meta.id === rootId ? start.baseline.usage : (previous?.payload.info.total_token_usage || zero());
  let last = baseline;
  const usage = zero();
  let count = 0;
  for (const row of events.filter(row => row.timestamp > cutoff)) {
    const next = row.payload.info.total_token_usage;
    // Повторный token_count с теми же суммами не учитывается второй раз.
    for (const key of keys) usage[key] += next[key] >= (last[key] || 0) ? next[key] - (last[key] || 0) : (next[key] || 0);
    last = next;
    count += 1;
  }
  if (count || meta.id === rootId) sessions.push({ session_id: meta.id, role: meta.id === rootId ? 'root' : meta.source?.subagent?.thread_spawn?.agent_path, events: count, baseline, latest: last, usage });
}
const total = zero();
for (const session of sessions) for (const key of keys) total[key] += session.usage[key];
const report = {
  measured_at: new Date().toISOString(),
  start_at: cutoff,
  source: 'Codex session event_msg/token_count cumulative counters',
  scope: 'Current chat and its descendant agents after task start marker. Snapshot precedes final reply.',
  input_includes_cached_tokens: true,
  output_note: 'Raw output_tokens counter; reasoning_output_tokens is reported separately and is not added again.',
  totals: total,
  sessions,
};
writeData(path.join(runDir, '99-package', 'token-usage.json'), report);
writeText(path.join(runDir, '99-package', 'token-usage.md'), `# Фактический замер токенов\n\nСрез: ${report.measured_at}. Начало: ${cutoff}.\n\n| Роль | Input, включая cache | Cached input | Output |\n| --- | ---: | ---: | ---: |\n${sessions.map(s => `| ${s.role} | ${s.usage.input_tokens} | ${s.usage.cached_input_tokens} | ${s.usage.output_tokens} |`).join('\n')}\n| Итого | ${total.input_tokens} | ${total.cached_input_tokens} | ${total.output_tokens} |\n\nInput без cache: ${total.input_tokens - total.cached_input_tokens}. Reasoning (справочно): ${total.reasoning_output_tokens}; повторно к output не прибавляется.\n\nИсточник — фактические token_count текущей сессии и дочерних агентов после маркера начала задачи; символы не пересчитывались в токены. Финальный ответ после среза исключён. Подробности по сессиям — token-usage.json.\n`);
console.log(JSON.stringify({ totals: total, sessions: sessions.map(s => ({ role: s.role, usage: s.usage })), measured_at: report.measured_at }));
