import path from 'node:path';
import { readData } from './io.mjs';

export function loadSourceRegistry(root) {
  return readData(path.join(root, 'references', 'source-registry.yaml'));
}

export function resolveSourceIds(root, ids) {
  const byId = new Map((loadSourceRegistry(root).sources || []).map(s => [s.id, s]));
  return ids.map(id => {
    const source = byId.get(id);
    if (!source) throw new Error(`SOURCE_NOT_FOUND: ${id}`);
    return source;
  });
}

export function resolveTopicSources(root, passport) {
  const ids = [
    ...(passport.sources?.primary || []),
    ...(passport.sources?.secondary || []),
    ...(passport.sources?.examples || [])
  ];
  return resolveSourceIds(root, ids);
}
