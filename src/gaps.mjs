import path from 'node:path';
import { readData, writeData } from './io.mjs';

export function loadGaps(root) {
  return readData(path.join(root, 'course', 'gap-registry.yaml')) || { gaps: [] };
}

export function saveGaps(root, registry) {
  writeData(path.join(root, 'course', 'gap-registry.yaml'), registry);
}

export function registerGap(root, gap) {
  const registry = loadGaps(root);
  const next = String(registry.gaps.length + 1).padStart(4, '0');
  const record = {
    id: gap.id || `GAP-${next}`,
    status: 'open',
    severity: gap.severity || 'major',
    type: gap.type,
    detected_during: gap.detected_during || null,
    description: gap.description,
    affected_topics: gap.affected_topics || [],
    suggested_action: gap.suggested_action || null,
    created_at: new Date().toISOString(),
    resolved_at: null
  };
  registry.gaps.push(record);
  saveGaps(root, registry);
  return record;
}

export function blockingGapsForTopic(root, topicId) {
  return loadGaps(root).gaps.filter(g =>
    g.status === 'open'
    && ['critical', 'major'].includes(g.severity)
    && (!g.affected_topics?.length || g.affected_topics.includes(topicId))
  );
}
