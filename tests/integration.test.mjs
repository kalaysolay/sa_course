import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Orchestrator, resetProgressToSeed } from '../src/orchestrator.mjs';
import { FakeAgentAdapter } from '../src/fakeAgents.mjs';
import { OpenAIAdapter } from '../src/openaiAdapter.mjs';
import { parseArgs, runCli } from '../src/cli.mjs';
import { loadCurriculum, resolveTopic } from '../src/curriculum.mjs';
import { readData, writeData } from '../src/io.mjs';
import { loadGaps, registerGap } from '../src/gaps.mjs';
import { resolveSourceIds } from '../src/sources.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function fixtureRoot() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'course-publisher-'));
  fs.cpSync(projectRoot, tmp, {
    recursive: true,
    filter: src => !src.includes(`${path.sep}.git`)
      && !src.includes(`${path.sep}node_modules`)
      && !src.includes(`${path.sep}runs${path.sep}`)
      && !src.includes(`${path.sep}output${path.sep}`)
  });
  fs.rmSync(path.join(tmp, 'runs'), { recursive: true, force: true });
  fs.rmSync(path.join(tmp, 'output'), { recursive: true, force: true });
  fs.mkdirSync(path.join(tmp, 'runs'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'output'), { recursive: true });
  writeData(path.join(tmp, 'course', 'gap-registry.yaml'), { gaps: [] });
  resetProgressToSeed(tmp);
  return tmp;
}

test('lesson 14 resolves to REQ-STAKEHOLDERS', () => {
  const root = fixtureRoot();
  const topic = resolveTopic(loadCurriculum(root), '14').topic;
  assert.equal(topic.id, 'REQ-STAKEHOLDERS');
});

test('publish-next chooses course_order 14 when topics 1..13 are completed', () => {
  const root = fixtureRoot();
  const next = new Orchestrator(root).resolveNextTopic();
  assert.equal(next.topic.course_order, 14);
  assert.equal(next.topic.id, 'REQ-STAKEHOLDERS');
});

test('blocking major GAP prevents silent jump to 15', () => {
  const root = fixtureRoot();
  registerGap(root, { type: 'blocked_topic', severity: 'major', description: 'manual blocker', affected_topics: ['REQ-STAKEHOLDERS'] });
  assert.throws(() => new Orchestrator(root).resolveNextTopic(), /BLOCKING_GAP/);
});

test('missing Topic Passport stops run and creates GAP', () => {
  const root = fixtureRoot();
  const curriculum = loadCurriculum(root);
  const row = resolveTopic(curriculum, 'REQ-STAKEHOLDERS');
  fs.rmSync(path.join(root, row.topic.passport));
  const result = new Orchestrator(root).publishTopic('REQ-STAKEHOLDERS');
  assert.equal(result.status, 'NEEDS_HUMAN_REVIEW');
  assert.match(result.error, /MISSING_TOPIC_PASSPORT/);
  assert.equal(loadGaps(root).gaps.at(-1).type, 'missing_topic');
});

test('source_id resolves through Source Registry', () => {
  const root = fixtureRoot();
  const [source] = resolveSourceIds(root, ['SRC-WIEGERS-REQUIREMENTS']);
  assert.equal(source.title, 'Software Requirements');
});

test('incomplete Lesson Brief is rejected and moves through BRIEF_REWORK', () => {
  const root = fixtureRoot();
  const result = new Orchestrator(root).publishTopic('REQ-STAKEHOLDERS', { fixture: 'incomplete-brief' });
  assert.equal(result.status, 'COMPLETED');
  const events = fs.readFileSync(path.join(result.runDir, 'events.jsonl'), 'utf8');
  assert.match(events, /BRIEF_REWORK/);
});

test('incomplete lecture is rejected and moves through LECTURE_REWORK', () => {
  const root = fixtureRoot();
  const result = new Orchestrator(root).publishTopic('REQ-STAKEHOLDERS', { fixture: 'incomplete-lecture' });
  assert.equal(result.status, 'COMPLETED');
  const events = fs.readFileSync(path.join(result.runDir, 'events.jsonl'), 'utf8');
  assert.match(events, /LECTURE_REWORK/);
});

test('curriculum_gap from Content Critic is registered without curriculum mutation', () => {
  const root = fixtureRoot();
  const before = fs.readFileSync(path.join(root, 'course', 'curriculum.yaml'), 'utf8');
  const result = new Orchestrator(root).publishTopic('REQ-STAKEHOLDERS', { fixture: 'curriculum-gap' });
  const after = fs.readFileSync(path.join(root, 'course', 'curriculum.yaml'), 'utf8');
  assert.equal(result.status, 'NEEDS_HUMAN_REVIEW');
  assert.equal(loadGaps(root).gaps.at(-1).type, 'curriculum_gap');
  assert.equal(after, before);
});

test('successful run completes topic and recomputes next_candidate', () => {
  const root = fixtureRoot();
  const result = new Orchestrator(root).publishTopic('REQ-STAKEHOLDERS');
  assert.equal(result.status, 'COMPLETED');
  const progress = readData(path.join(root, 'course', 'progress.yaml'));
  assert.equal(progress.topics['REQ-STAKEHOLDERS'].status, 'completed');
  assert.equal(progress.next_candidate.topic_id, 'REQ-ELICITATION');
});

test('REQ-STAKEHOLDERS passes NEW -> COMPLETED on fake agent outputs', () => {
  const root = fixtureRoot();
  const result = new Orchestrator(root).publishTopic('REQ-STAKEHOLDERS');
  const run = readData(path.join(result.runDir, 'run.json'));
  assert.equal(run.status, 'COMPLETED');
  assert.ok(fs.existsSync(path.join(result.output, 'lecture.md')));
  assert.ok(fs.existsSync(path.join(result.output, 'lesson-manifest.json')));
});

test('resume continues a controlled stopped run', () => {
  const root = fixtureRoot();
  const orchestrator = new Orchestrator(root);
  const stopped = orchestrator.publishTopic('REQ-STAKEHOLDERS', { stopAfter: 'BRIEF_READY' });
  assert.equal(stopped.status, 'BRIEF_READY');
  const resumed = orchestrator.resume(stopped.runId);
  assert.equal(resumed.status, 'COMPLETED');
});

test('iteration 2 Methodologist produces a rich REQ-STAKEHOLDERS brief', () => {
  const root = fixtureRoot();
  const result = new Orchestrator(root).publishTopic('REQ-STAKEHOLDERS');
  const brief = readData(path.join(result.runDir, '01-brief', 'lesson-brief-final.json'));
  assert.equal(brief.learningOutcomes.length, 4);
  assert.ok(brief.mustCover.includes('пользователь системы и stakeholder — не одно и то же'));
  assert.ok(brief.projectUsage.artifactsToUpdate.includes('business-analysis/stakeholders.md'));
  assert.ok(brief.misconceptions.some(item => /только .*пользовател/i.test(item)));
});

test('iteration 2 Writer produces a narrative stakeholders lecture covering the approved scope', () => {
  const root = fixtureRoot();
  const result = new Orchestrator(root).publishTopic('REQ-STAKEHOLDERS');
  const lecture = fs.readFileSync(path.join(result.output, 'lecture.md'), 'utf8');
  assert.ok(lecture.length > 9000);
  assert.match(lecture, /Первый день аналитика в Compliance-проекте/);
  assert.match(lecture, /Пользователь системы и stakeholder — не одно и то же/i);
  assert.match(lecture, /Stakeholder Register: не таблица ради таблицы/i);
  assert.match(lecture, /Границы темы: RACI и политические конфликты не разбираются глубоко/i);
});

test('iteration 2 Content Critic rejects a stakeholders brief without project artifact', () => {
  const root = fixtureRoot();
  const curriculum = loadCurriculum(root);
  const row = resolveTopic(curriculum, 'REQ-STAKEHOLDERS');
  const passport = readData(path.join(root, row.topic.passport));
  const adapter = new FakeAgentAdapter();
  const brief = adapter.designLesson({ topic: row.topic, module: row.module, section: row.section, passport });
  brief.projectUsage.artifactsToUpdate = [];
  const scopeReview = adapter.scopeReview({ brief, passport });
  assert.equal(scopeReview.verdict, 'REJECTED');
  assert.ok(scopeReview.issues.some(issue => issue.category === 'project_artifact_gap'));
});

test('iteration 3 Subject Reviewer rejects a factual stakeholder error and revision loop recovers', () => {
  const root = fixtureRoot();
  const result = new Orchestrator(root).publishTopic('REQ-STAKEHOLDERS', { fixture: 'subject-error' });
  assert.equal(result.status, 'COMPLETED');
  const subjectV1 = readData(path.join(result.runDir, '03-lecture', 'review-v1', 'subject.json'));
  const subjectV2 = readData(path.join(result.runDir, '03-lecture', 'review-v2', 'subject.json'));
  assert.equal(subjectV1.verdict, 'REJECTED');
  assert.ok(subjectV1.issues.some(issue => issue.category === 'factual_error'));
  assert.equal(subjectV2.verdict, 'APPROVED');
});

test('iteration 3 Methodology Reviewer rejects missing final learning orientation and revision loop recovers', () => {
  const root = fixtureRoot();
  const result = new Orchestrator(root).publishTopic('REQ-STAKEHOLDERS', { fixture: 'methodology-gap' });
  assert.equal(result.status, 'COMPLETED');
  const methodologyV1 = readData(path.join(result.runDir, '03-lecture', 'review-v1', 'methodology.json'));
  const methodologyV2 = readData(path.join(result.runDir, '03-lecture', 'review-v2', 'methodology.json'));
  assert.equal(methodologyV1.verdict, 'REJECTED');
  assert.ok(methodologyV1.issues.some(issue => issue.category === 'teachability'));
  assert.equal(methodologyV2.verdict, 'APPROVED');
});

test('iteration 3 Editorial Reviewer rejects list-like lecture form and revision loop recovers', () => {
  const root = fixtureRoot();
  const result = new Orchestrator(root).publishTopic('REQ-STAKEHOLDERS', { fixture: 'editorial-gap' });
  assert.equal(result.status, 'COMPLETED');
  const editorialV1 = readData(path.join(result.runDir, '03-lecture', 'review-v1', 'editorial.json'));
  const editorialV2 = readData(path.join(result.runDir, '03-lecture', 'review-v2', 'editorial.json'));
  assert.equal(editorialV1.verdict, 'REJECTED');
  assert.ok(editorialV1.issues.some(issue => issue.category === 'narrative_opening'));
  assert.equal(editorialV2.verdict, 'APPROVED');
});

test('iteration 3 lecture review panel writes independent reviewer verdicts', () => {
  const root = fixtureRoot();
  const result = new Orchestrator(root).publishTopic('REQ-STAKEHOLDERS');
  const reviewDir = path.join(result.runDir, '03-lecture', 'review-v1');
  const subject = readData(path.join(reviewDir, 'subject.json'));
  const coverage = readData(path.join(reviewDir, 'coverage.json'));
  const methodology = readData(path.join(reviewDir, 'methodology.json'));
  const editorial = readData(path.join(reviewDir, 'editorial.json'));
  assert.equal(subject.reviewer, 'subject');
  assert.equal(coverage.reviewer, 'content-critic');
  assert.equal(methodology.reviewer, 'methodology');
  assert.equal(editorial.reviewer, 'editorial');
  assert.deepEqual([subject.verdict, coverage.verdict, methodology.verdict, editorial.verdict], ['APPROVED', 'APPROVED', 'APPROVED', 'APPROVED']);
});

test('iteration 4 Assessment Author creates LO coverage matrix and project exercise', () => {
  const root = fixtureRoot();
  const result = new Orchestrator(root).publishTopic('REQ-STAKEHOLDERS');
  const assessment = readData(path.join(result.runDir, '04-assessment', 'draft.json'));
  const review = readData(path.join(result.runDir, '04-assessment', 'review.json'));
  assert.equal(assessment.items.length, 6);
  assert.ok(assessment.items.some(item => item.type === 'project_case'));
  assert.equal(review.verdict, 'APPROVED');
  assert.deepEqual(Object.keys(review.coverage).sort(), ['REQ-STAKEHOLDERS-LO1', 'REQ-STAKEHOLDERS-LO2', 'REQ-STAKEHOLDERS-LO3', 'REQ-STAKEHOLDERS-LO4']);
});

test('iteration 4 Assessment Reviewer rejects missing project exercise and revision loop recovers', () => {
  const root = fixtureRoot();
  const result = new Orchestrator(root).publishTopic('REQ-STAKEHOLDERS', { fixture: 'assessment-gap' });
  assert.equal(result.status, 'COMPLETED');
  const reviewV1 = readData(path.join(result.runDir, '04-assessment', 'review-v1.json'));
  const reviewV2 = readData(path.join(result.runDir, '04-assessment', 'review-v2.json'));
  assert.equal(reviewV1.verdict, 'REJECTED');
  assert.ok(reviewV1.issues.some(issue => issue.category === 'project_exercise_missing'));
  assert.equal(reviewV2.verdict, 'APPROVED');
});

test('iteration 5 Project Artifact flow writes before proposed approved and diff without canonical merge', () => {
  const root = fixtureRoot();
  const canonical = path.join(root, 'project', 'compliance', 'business-analysis', 'stakeholders.md');
  assert.equal(fs.existsSync(canonical), false);
  const result = new Orchestrator(root).publishTopic('REQ-STAKEHOLDERS');
  assert.equal(fs.existsSync(canonical), false);
  assert.ok(fs.existsSync(path.join(result.runDir, '05-project', 'before', 'business-analysis', 'stakeholders.md')));
  assert.ok(fs.existsSync(path.join(result.runDir, '05-project', 'proposed', 'business-analysis', 'stakeholders.md')));
  assert.ok(fs.existsSync(path.join(result.runDir, '05-project', 'approved', 'business-analysis', 'stakeholders.md')));
  const diffFiles = fs.readdirSync(path.join(result.runDir, '05-project', 'diff'));
  assert.ok(diffFiles.some(file => file.includes('stakeholders.md.v1.diff')));
});

test('iteration 5 Project Artifact Reviewer rejects incomplete stakeholders.md and revision loop recovers', () => {
  const root = fixtureRoot();
  const result = new Orchestrator(root).publishTopic('REQ-STAKEHOLDERS', { fixture: 'project-gap' });
  assert.equal(result.status, 'COMPLETED');
  const reviewV1 = readData(path.join(result.runDir, '05-project', 'reviews', 'project-v1.json'));
  const reviewV2 = readData(path.join(result.runDir, '05-project', 'reviews', 'project-v2.json'));
  assert.equal(reviewV1.verdict, 'REJECTED');
  assert.ok(reviewV1.issues.some(issue => issue.category === 'missing_interest' || issue.category === 'missing_influence'));
  assert.equal(reviewV2.verdict, 'APPROVED');
});

test('iteration 6 Run metadata and checkpoints are written', () => {
  const root = fixtureRoot();
  const stopped = new Orchestrator(root).publishTopic('REQ-STAKEHOLDERS', { stopAfter: 'LECTURE_APPROVED' });
  assert.equal(stopped.status, 'LECTURE_APPROVED');
  const stoppedRun = readData(path.join(stopped.runDir, 'run.json'));
  assert.equal(stoppedRun.workflowVersion, '0.3-iteration-6');
  assert.equal(stoppedRun.promptVersions.reviewPanel, 'stakeholders-iteration-3');
  const resumed = new Orchestrator(root).resume(stopped.runId);
  assert.equal(resumed.status, 'COMPLETED');
});

test('Codex-native prepare creates task packets without OPENAI_API_KEY', () => {
  const root = fixtureRoot();
  const oldKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  const result = new Orchestrator(root).prepareCodexRun('REQ-STAKEHOLDERS');
  assert.equal(result.status, 'CODEX_TASKS_READY');
  const manifest = readData(path.join(result.taskDir, 'codex-manifest.json'));
  assert.equal(manifest.mode, 'codex-app');
  assert.equal(manifest.externalApiRequired, false);
  assert.equal(manifest.topicId, 'REQ-STAKEHOLDERS');
  assert.ok(fs.existsSync(path.join(result.taskDir, '00-dispatch.md')));
  assert.ok(fs.existsSync(path.join(result.taskDir, '01-methodologist.md')));
  assert.ok(fs.existsSync(path.join(result.runDir, '00-input', 'topic-passport.json')));
  const progress = readData(path.join(root, 'course', 'progress.yaml'));
  assert.equal(progress.topics['REQ-STAKEHOLDERS'].status, 'in_progress');
  if (oldKey) process.env.OPENAI_API_KEY = oldKey;
});

test('Codex adapter flag on publish command prepares app tasks', () => {
  const root = fixtureRoot();
  const result = runCli(['/publish-lesson', '14', '--adapter', 'codex'], root);
  assert.equal(result.status, 'CODEX_TASKS_READY');
  const run = readData(path.join(result.runDir, 'run.json'));
  assert.equal(run.adapter.name, 'CodexAppAdapter');
  assert.equal(run.adapter.externalApiRequired, false);
});
test('OpenAI adapter CLI flags are parsed without changing fake default', () => {
  const parsed = parseArgs(['/publish-lesson', '15', '--adapter', 'openai', '--model', 'gpt-5.6-sol', '--reasoning', 'medium', '--temperature', '0.2']);
  assert.equal(parsed.command, '/publish-lesson');
  assert.equal(parsed.positional[0], '15');
  assert.equal(parsed.options.adapter, 'openai');
  assert.equal(parsed.options.model, 'gpt-5.6-sol');
  assert.equal(parsed.options.reasoningEffort, 'medium');
  assert.equal(parsed.options.temperature, 0.2);
});

test('OpenAI adapter fails fast when OPENAI_API_KEY is missing', () => {
  const oldKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  const adapter = new OpenAIAdapter({ model: 'gpt-5.6-terra' });
  assert.throws(() => adapter.requireKey(), /OPENAI_API_KEY is not set/);
  if (oldKey) process.env.OPENAI_API_KEY = oldKey;
});

test('OpenAI CLI preflight fails before creating a run when key is missing', () => {
  const root = fixtureRoot();
  const beforeRuns = fs.readdirSync(path.join(root, 'runs'));
  const oldKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  assert.throws(() => runCli(['/publish-lesson', '14', '--adapter', 'openai'], root), /OPENAI_API_KEY is not set/);
  assert.deepEqual(fs.readdirSync(path.join(root, 'runs')), beforeRuns);
  if (oldKey) process.env.OPENAI_API_KEY = oldKey;
});
