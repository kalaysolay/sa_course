/* Сравнение сохранённых ревью с подписанными разметками методиста; сеть и платная модель здесь не вызываются. */
const fs = require('node:fs');

function compare(set, responses, annotations) {
  const missing = [], differences = [];
  for (const sample of set.cases) {
    const expert = annotations[sample.id] || sample.methodist;
    const actual = responses[sample.id];
    if (!expert?.reviewer || !expert.reviewedAt || !expert.reason || !expert.states) { missing.push(sample.id + ': нет разметки методиста'); continue; }
    if (!actual?.criteria || !Number.isInteger(actual.grade?.score) || actual.grade.score < 0 || actual.grade.score > 100 || !Number.isInteger(actual.context?.taskVersion) || actual.context.taskVersion < 0 || !actual.context?.promptVersions || !actual.context?.model) { missing.push(sample.id + ': нет ревью или контекста модели'); continue; }
    const ids = set.task.rubric.map(c => c.id);
    if (Object.keys(expert.states).length !== ids.length || actual.criteria.length !== ids.length || new Set(actual.criteria.map(c => c.id)).size !== ids.length) { missing.push(sample.id + ': неполная рубрика'); continue; }
    for (const id of ids) {
      const found = actual.criteria.find(c => c.id === id);
      if (!['hit', 'partial', 'miss'].includes(expert.states[id]) || !found) { missing.push(sample.id + ': неверная разметка ' + id); continue; }
      if (found.state !== expert.states[id]) differences.push({ caseId: sample.id, criterion: id, expected: expert.states[id], actual: found.state });
    }
    if (!Number.isInteger(expert.minScore) || !Number.isInteger(expert.maxScore) || expert.minScore < 0 || expert.maxScore > 100 || expert.minScore > expert.maxScore) missing.push(sample.id + ': нет диапазона балла');
    else if (actual.grade.score < expert.minScore || actual.grade.score > expert.maxScore) differences.push({ caseId: sample.id, score: actual.grade.score, range: [expert.minScore, expert.maxScore] });
  }
  return { status: missing.length ? 'incomplete' : differences.length ? 'differences' : 'matches', missing, differences,
    note: 'Совпадение на контрольных примерах не доказывает качество на всех решениях и не определяет профессиональный грейд.' };
}

if (require.main === module) {
  const [dataset, responses, annotations] = process.argv.slice(2);
  if (!dataset || !responses || !annotations) { console.error('node scripts/compare-review-eval.cjs <набор.json> <ответы.json> <разметки.json>'); process.exitCode = 2; }
  else {
    const report = compare(JSON.parse(fs.readFileSync(dataset)), JSON.parse(fs.readFileSync(responses)), JSON.parse(fs.readFileSync(annotations)));
    console.log(JSON.stringify(report, null, 2)); process.exitCode = report.status === 'matches' ? 0 : 1;
  }
}
module.exports = { compare };
