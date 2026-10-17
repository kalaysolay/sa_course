const test = require('node:test');
const assert = require('node:assert/strict');
const { compare } = require('../scripts/compare-review-eval.cjs');
const set = require('../../backend/modules/review/src/test/resources/review-control-set.json');

test('Отсутствие разметки методиста не превращается в успешную калибровку', () => {
  const report = compare(set, {}, {});
  assert.equal(report.status, 'incomplete'); assert.equal(report.missing.length, 5);
});

test('Сравнение проверяет рубрику, диапазон и версии модели; синтетические метки остаются фикстурой теста', () => {
  const fixture = { task: { rubric: [{ id: 'c' }] }, cases: [{ id: 'one' }] };
  const labels = { one: { reviewer: 'Синтетическая фикстура', reviewedAt: '2026-10-17', reason: 'Проверка сравнения', states: { c: 'miss' }, minScore: 0, maxScore: 20 } };
  const responses = { one: { criteria: [{ id: 'c', state: 'hit' }], grade: { score: 94 }, context: { taskVersion: 1, promptVersions: { sa: 1 }, model: 'stub' } } };
  assert.equal(compare(fixture, responses, labels).differences.length, 2);
  responses.one.criteria[0].state = 'miss'; responses.one.grade.score = 10;
  assert.equal(compare(fixture, responses, labels).status, 'matches');
  delete responses.one.context.model; assert.equal(compare(fixture, responses, labels).status, 'incomplete');
});
