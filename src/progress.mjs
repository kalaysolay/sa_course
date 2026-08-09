import path from 'node:path';
import { readData, writeData, writeText } from './io.mjs';
import { flattenTopics } from './curriculum.mjs';

export function loadProgress(root) {
  return readData(path.join(root, 'course', 'progress.yaml'));
}

export function saveProgress(root, progress) {
  progress.updated_at = new Date().toISOString();
  writeData(path.join(root, 'course', 'progress.yaml'), progress);
  writeProgressMarkdown(root, progress);
}

export function recomputeProgress(root, curriculum, progress) {
  const rows = flattenTopics(curriculum);
  const counts = { completed: 0, in_progress: 0, blocked: 0, needs_revision: 0, planned: 0 };
  for (const row of rows) {
    const entry = progress.topics[row.topic.id] || { status: 'planned' };
    progress.topics[row.topic.id] = {
      ...entry,
      course_order: row.topic.course_order,
      module_id: row.module.id,
      title: row.topic.title
    };
    if (counts[progress.topics[row.topic.id].status] !== undefined) counts[progress.topics[row.topic.id].status] += 1;
  }
  progress.summary = { total_topics: rows.length, ...counts };
  const completed = rows.filter(r => progress.topics[r.topic.id]?.status === 'completed').at(-1);
  if (completed) {
    progress.last_completed = {
      topic_id: completed.topic.id,
      course_order: completed.topic.course_order,
      run_id: progress.topics[completed.topic.id].run_id || progress.last_completed?.run_id || null
    };
  }
  const next = rows.find(r => (progress.topics[r.topic.id]?.status || 'planned') === 'planned');
  progress.next_candidate = next ? { topic_id: next.topic.id, course_order: next.topic.course_order } : null;
  saveProgress(root, progress);
  return progress;
}

export function setTopicStatus(progress, topicId, status, extra = {}) {
  progress.topics[topicId] = { ...(progress.topics[topicId] || {}), status, ...extra };
}

export function writeProgressMarkdown(root, progress) {
  const last = progress.last_completed ? `${progress.last_completed.course_order}. ${progress.last_completed.topic_id}` : 'нет';
  const next = progress.next_candidate ? `${progress.next_candidate.course_order}. ${progress.next_candidate.topic_id}` : 'нет';
  writeText(path.join(root, 'course', 'PROGRESS.md'), [
    '# Course Progress',
    '',
    `Готово: ${progress.summary.completed} / ${progress.summary.total_topics} тем.`,
    '',
    'Последняя готовая тема:',
    last,
    '',
    'Следующая:',
    next,
    '',
    'Открытые GAP:',
    '- см. course/gap-registry.yaml',
    ''
  ].join('\n'));
}
