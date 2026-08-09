import path from 'node:path';
import { readData } from './io.mjs';

export function loadCurriculum(root) {
  return readData(path.join(root, 'course', 'curriculum.yaml'));
}

export function flattenTopics(curriculum) {
  const rows = [];
  for (const module of curriculum.modules || []) {
    for (const section of module.sections || []) {
      for (const topic of section.topics || []) rows.push({ module, section, topic });
    }
  }
  return rows.sort((a, b) => a.topic.course_order - b.topic.course_order);
}

export function resolveTopic(curriculum, ref) {
  const rows = flattenTopics(curriculum);
  const normalized = String(ref).trim();
  if (/^\d+$/.test(normalized)) {
    const byOrder = rows.find(r => r.topic.course_order === Number(normalized));
    if (byOrder) return byOrder;
  }
  const byId = rows.find(r => r.topic.id.toUpperCase() === normalized.toUpperCase());
  if (byId) return byId;
  const byTitle = rows.find(r => r.topic.title.toLowerCase() === normalized.toLowerCase());
  if (byTitle) return byTitle;
  throw new Error(`TOPIC_NOT_FOUND: ${ref}`);
}

export function passportPath(root, topic) {
  return path.join(root, topic.passport || '');
}
