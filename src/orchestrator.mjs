import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { appendJsonLine, copyFile, ensureDir, exists, readData, writeData, writeText } from './io.mjs';
import { flattenTopics, loadCurriculum, passportPath, resolveTopic } from './curriculum.mjs';
import { blockingGapsForTopic, loadGaps, registerGap } from './gaps.mjs';
import { loadProgress, recomputeProgress, saveProgress, setTopicStatus } from './progress.mjs';
import { resolveTopicSources } from './sources.mjs';
import { expectedLectureHeading, validateBySchemaName, validateLectureHeading } from './validation.mjs';
import { FakeAgentAdapter } from './fakeAgents.mjs';
import { buildCodexTaskPackets, codexTaskDir } from './codexTaskPackets.mjs';

const TERMINAL = new Set(['COMPLETED', 'FAILED', 'NEEDS_HUMAN_REVIEW', 'CANCELLED']);

export class Orchestrator {
  constructor(root, agent = new FakeAgentAdapter()) {
    this.root = root;
    this.agent = agent;
  }

  now() {
    return new Date().toISOString();
  }

  event(runDir, event, data = {}) {
    appendJsonLine(path.join(runDir, 'events.jsonl'), { ts: this.now(), event, ...data });
  }

  createRun(topicId) {
    const stamp = this.now().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    const runId = `${stamp}_${topicId}_${crypto.randomBytes(3).toString('hex')}`;
    const runDir = path.join(this.root, 'runs', runId);
    for (const dir of [
      '',
      '00-input',
      '01-brief',
      '02-research',
      '03-lecture/review-v1',
      '04-assessment',
      '05-project/before',
      '05-project/proposed',
      '05-project/reviews',
      '05-project/diff',
      '05-project/approved',
      '06-visuals',
      '99-package'
    ]) ensureDir(path.join(runDir, dir));
    const run = {
      runId,
      topicId,
      status: 'NEW',
      startedAt: this.now(),
      updatedAt: this.now(),
      workflowVersion: '0.3-iteration-6',
      adapter: { name: 'FakeAgentAdapter', version: '0.3-deterministic' },
      promptVersions: {
        methodologist: 'stakeholders-iteration-2',
        contentCritic: 'stakeholders-iteration-2',
        writer: 'stakeholders-iteration-2',
        reviewPanel: 'stakeholders-iteration-3',
        assessment: 'stakeholders-iteration-4',
        projectArtifacts: 'stakeholders-iteration-5'
      },
      revision: { lecture: 0, assessment: 0, projectArtifacts: 0 },
      errors: []
    };
    this.saveRun(runDir, run);
    this.event(runDir, 'RUN_CREATED', { topicId });
    return { runId, runDir, run };
  }

  loadRun(runId) {
    const runDir = path.join(this.root, 'runs', runId);
    return { runDir, run: readData(path.join(runDir, 'run.json')) };
  }

  saveRun(runDir, run) {
    run.updatedAt = this.now();
    writeData(path.join(runDir, 'run.json'), run);
  }

  setStatus(runDir, run, status) {
    run.status = status;
    this.saveRun(runDir, run);
    this.event(runDir, 'STATE_CHANGED', { status });
  }

  courseStatus() {
    const curriculum = loadCurriculum(this.root);
    const progress = recomputeProgress(this.root, curriculum, loadProgress(this.root));
    return { progress, gaps: loadGaps(this.root).gaps.filter(g => g.status === 'open') };
  }

  resolveNextTopic() {
    const curriculum = loadCurriculum(this.root);
    const progress = recomputeProgress(this.root, curriculum, loadProgress(this.root));
    if (!progress.next_candidate) throw new Error('NO_NEXT_TOPIC');
    const candidate = resolveTopic(curriculum, progress.next_candidate.topic_id);
    const blockers = blockingGapsForTopic(this.root, candidate.topic.id);
    if (blockers.length) throw new Error(`BLOCKING_GAP: ${blockers.map(g => g.id).join(', ')}`);
    return candidate;
  }

  publishNext(options = {}) {
    return this.publishTopic(this.resolveNextTopic().topic.id, options);
  }

  prepareCodexNext(options = {}) {
    return this.prepareCodexRun(this.resolveNextTopic().topic.id, options);
  }

  prepareCodexRun(ref, options = {}) {
    const curriculum = loadCurriculum(this.root);
    const row = resolveTopic(curriculum, ref);
    const { module, section, topic } = row;
    const { runId, runDir, run } = this.createRun(topic.id);
    run.adapter = { name: 'CodexAppAdapter', version: '0.3-task-packets', externalApiRequired: false };
    this.saveRun(runDir, run);

    try {
      writeText(path.join(runDir, '00-input', 'request.md'), options.request || `prepare codex lesson ${topic.id}\n`);
      writeData(path.join(runDir, '00-input', 'course-context.yaml'), { module: module.id, section: section.id, topic });
      copyFile(path.join(this.root, 'project', 'compliance', 'project-state.yaml'), path.join(runDir, '00-input', 'project-state.yaml'));
      this.setStatus(runDir, run, 'TOPIC_RESOLVED');

      const blockers = blockingGapsForTopic(this.root, topic.id);
      if (blockers.length) throw new Error(`BLOCKING_GAP: ${blockers.map(g => g.id).join(', ')}`);

      const progress = loadProgress(this.root);
      setTopicStatus(progress, topic.id, 'in_progress', { run_id: runId });
      recomputeProgress(this.root, curriculum, progress);
      this.setStatus(runDir, run, 'PROGRESS_CHECKED');

      const pPath = passportPath(this.root, topic);
      if (!exists(pPath)) {
        const gap = registerGap(this.root, {
          type: 'missing_topic',
          severity: 'major',
          detected_during: { topic_id: topic.id, run_id: runId },
          description: `Topic Passport отсутствует: ${topic.passport}`,
          affected_topics: [topic.id],
          suggested_action: 'Создать Topic Passport перед запуском Codex-native production.'
        });
        throw new Error(`MISSING_TOPIC_PASSPORT: ${gap.id}`);
      }

      const passport = readData(pPath);
      validateBySchemaName(this.root, 'topic-passport.schema.json', passport);
      writeData(path.join(runDir, '00-input', 'topic-passport.json'), passport);
      const sources = resolveTopicSources(this.root, passport);
      writeData(path.join(runDir, '00-input', 'source-registry-slice.json'), sources);
      this.setStatus(runDir, run, 'CONTEXT_READY');

      const openGaps = loadGaps(this.root).gaps.filter(gap => gap.status === 'open' && (gap.affected_topics || []).includes(topic.id));
      const publisherConfig = readData(path.join(this.root, 'publisher.yaml'));
      const tasks = buildCodexTaskPackets({
        createdAt: this.now(),
        run,
        module,
        section,
        topic,
        passport,
        sources,
        openGaps,
        courseTracker: publisherConfig.course_tracker
      });
      const taskDir = codexTaskDir(runDir);
      ensureDir(taskDir);
      for (const packet of tasks.packets) writeText(path.join(taskDir, packet.file), packet.content);
      writeData(path.join(taskDir, 'codex-manifest.json'), tasks.manifest);
      this.event(runDir, 'CODEX_TASKS_CREATED', { taskDir: 'codex-tasks', taskCount: tasks.manifest.taskCount });
      this.setStatus(runDir, run, 'CODEX_TASKS_READY');
      return { runId, status: run.status, runDir, taskDir, manifest: path.join(taskDir, 'codex-manifest.json') };
    } catch (error) {
      run.errors.push({ ts: this.now(), message: error.message });
      const status = error.message.startsWith('BLOCKING_GAP') || error.message.startsWith('MISSING_TOPIC_PASSPORT') ? 'NEEDS_HUMAN_REVIEW' : 'FAILED';
      this.setStatus(runDir, run, status);
      const progress = loadProgress(this.root);
      setTopicStatus(progress, topic.id, status === 'NEEDS_HUMAN_REVIEW' ? 'blocked' : 'needs_revision', { run_id: runId });
      recomputeProgress(this.root, curriculum, progress);
      return { runId, status, error: error.message, runDir };
    }
  }
  publishTopic(ref, options = {}) {
    const curriculum = loadCurriculum(this.root);
    const row = resolveTopic(curriculum, ref);
    const { module, section, topic } = row;
    const { runId, runDir, run } = this.createRun(topic.id);
    try {
      writeText(path.join(runDir, '00-input', 'request.md'), options.request || `publish ${topic.id}\n`);
      writeData(path.join(runDir, '00-input', 'course-context.yaml'), { module: module.id, section: section.id, topic });
      copyFile(path.join(this.root, 'project', 'compliance', 'project-state.yaml'), path.join(runDir, '00-input', 'project-state.yaml'));
      this.setStatus(runDir, run, 'TOPIC_RESOLVED');

      const blockers = blockingGapsForTopic(this.root, topic.id);
      if (blockers.length) throw new Error(`BLOCKING_GAP: ${blockers.map(g => g.id).join(', ')}`);

      const progress = loadProgress(this.root);
      setTopicStatus(progress, topic.id, 'in_progress', { run_id: runId });
      recomputeProgress(this.root, curriculum, progress);
      this.setStatus(runDir, run, 'PROGRESS_CHECKED');

      const pPath = passportPath(this.root, topic);
      if (!exists(pPath)) {
        const gap = registerGap(this.root, {
          type: 'missing_topic',
          severity: 'major',
          detected_during: { topic_id: topic.id, run_id: runId },
          description: `Topic Passport отсутствует: ${topic.passport}`,
          affected_topics: [topic.id],
          suggested_action: 'Создать Topic Passport перед запуском production.'
        });
        throw new Error(`MISSING_TOPIC_PASSPORT: ${gap.id}`);
      }
      const passport = readData(pPath);
      validateBySchemaName(this.root, 'topic-passport.schema.json', passport);
      this.setStatus(runDir, run, 'CONTEXT_READY');

      return this.continueRunInternal(runDir, run, { curriculum, module, section, topic, passport, options });
    } catch (error) {
      run.errors.push({ ts: this.now(), message: error.message });
      const status = error.message.startsWith('BLOCKING_GAP') || error.message.startsWith('MISSING_TOPIC_PASSPORT') ? 'NEEDS_HUMAN_REVIEW' : 'FAILED';
      this.setStatus(runDir, run, status);
      const progress = loadProgress(this.root);
      setTopicStatus(progress, topic.id, status === 'NEEDS_HUMAN_REVIEW' ? 'blocked' : 'needs_revision', { run_id: runId });
      recomputeProgress(this.root, curriculum, progress);
      return { runId, status, error: error.message, runDir };
    }
  }

  resume(runId, options = {}) {
    const { runDir, run } = this.loadRun(runId);
    this.event(runDir, 'RESUME_REQUESTED', {});
    if (TERMINAL.has(run.status)) return { runId, status: run.status, resumed: false, runDir };
    const curriculum = loadCurriculum(this.root);
    const row = resolveTopic(curriculum, run.topicId);
    const passport = readData(passportPath(this.root, row.topic));
    return this.continueRunInternal(runDir, run, { curriculum, module: row.module, section: row.section, topic: row.topic, passport, options });
  }

  continueRunInternal(runDir, run, ctx) {
    const { curriculum, module, section, topic, passport, options } = ctx;
    const maybeStop = status => {
      if (options.stopAfter === status) {
        this.setStatus(runDir, run, status);
        return true;
      }
      return false;
    };

    let brief = exists(path.join(runDir, '01-brief', 'lesson-brief-v1.json'))
      ? readData(path.join(runDir, '01-brief', 'lesson-brief-v1.json'))
      : this.agent.designLesson({ topic, module, section, passport, fixture: options.fixture });
    writeData(path.join(runDir, '01-brief', 'lesson-brief-v1.json'), brief);
    validateBySchemaName(this.root, 'lesson-brief.schema.json', brief);
    this.event(runDir, 'ARTIFACT_CREATED', { path: '01-brief/lesson-brief-v1.json' });
    if (maybeStop('BRIEF_READY')) return { runId: run.runId, status: run.status, runDir };
    this.setStatus(runDir, run, 'BRIEF_READY');

    let scope = this.agent.scopeReview({ brief, passport, fixture: options.fixture });
    writeData(path.join(runDir, '01-brief', 'scope-review-v1.json'), scope);
    validateBySchemaName(this.root, 'review.schema.json', scope);
    this.setStatus(runDir, run, 'BRIEF_SCOPE_REVIEW');
    if (scope.verdict === 'REJECTED') {
      const curriculumGap = scope.issues.find(i => i.gapProposal?.type === 'curriculum_gap');
      if (curriculumGap) {
        registerGap(this.root, {
          type: 'curriculum_gap',
          severity: curriculumGap.severity,
          detected_during: { topic_id: topic.id, run_id: run.runId },
          description: curriculumGap.problem,
          affected_topics: [topic.id],
          suggested_action: curriculumGap.gapProposal.suggestedAction
        });
        this.setStatus(runDir, run, 'NEEDS_HUMAN_REVIEW');
        return { runId: run.runId, status: run.status, runDir };
      }
      writeData(path.join(runDir, '01-brief', 'revision-request-v1.json'), this.revisionRequest(topic.id, 1, 'lesson-brief-v1.json', scope));
      this.setStatus(runDir, run, 'BRIEF_REWORK');
      brief = this.agent.designLesson({ topic, module, section, passport, fixture: null });
      writeData(path.join(runDir, '01-brief', 'lesson-brief-final.json'), brief);
      scope = this.agent.scopeReview({ brief, passport, fixture: null });
      writeData(path.join(runDir, '01-brief', 'scope-review-v2.json'), scope);
      if (scope.verdict === 'REJECTED') throw new Error('BRIEF_REWORK_FAILED');
    } else {
      writeData(path.join(runDir, '01-brief', 'lesson-brief-final.json'), brief);
    }

    const sources = resolveTopicSources(this.root, passport);
    for (const source of sources.filter(s => passport.sources?.primary?.includes(s.id) && s.availability !== 'available')) {
      registerGap(this.root, {
        type: 'source_gap',
        severity: passport.source_policy?.on_missing_primary ? 'minor' : 'major',
        detected_during: { topic_id: topic.id, run_id: run.runId },
        description: `Primary source ${source.id} зарегистрирован, но недоступен.`,
        affected_topics: [topic.id],
        suggested_action: 'Добавить локальный источник или подтвердить продолжение на secondary sources.'
      });
    }
    writeText(path.join(runDir, '02-research', 'source-pack.md'), this.agent.research({ sources }));
    this.setStatus(runDir, run, 'RESEARCH_READY');

    let lectureApproved = false;
    let revision = 1;
    let lecture = '';
    while (!lectureApproved && revision <= 3) {
      run.revision.lecture = revision;
      lecture = this.agent.writeLecture({ brief, topic, revision, fixture: options.fixture });
      const draftName = `draft-v${revision}.md`;
      writeText(path.join(runDir, '03-lecture', draftName), lecture);
      this.setStatus(runDir, run, 'LECTURE_DRAFTED');
      const reviews = {
        subject: this.agent.subjectReview({ brief, lecture }),
        coverage: this.agent.coverageReview({ brief, lecture }),
        methodology: this.agent.methodologyReview({ brief, lecture }),
        editorial: this.agent.editorialReview({ brief, lecture }),
        format: this.lectureFormatReview(topic, lecture)
      };
      const reviewDir = path.join(runDir, '03-lecture', `review-v${revision}`);
      ensureDir(reviewDir);
      for (const [name, value] of Object.entries(reviews)) writeData(path.join(reviewDir, `${name}.json`), value);
      this.setStatus(runDir, run, 'LECTURE_REVIEW');
      const blockingIssues = Object.values(reviews).flatMap(r => r.issues || []).filter(i => ['critical', 'major'].includes(i.severity));
      if (!blockingIssues.length) lectureApproved = true;
      else {
        writeData(path.join(runDir, '03-lecture', `revision-request-v${revision}.json`), this.revisionRequest(topic.id, revision + 1, draftName, ...Object.values(reviews)));
        this.setStatus(runDir, run, 'LECTURE_REWORK');
        revision += 1;
      }
    }
    if (!lectureApproved) {
      this.setStatus(runDir, run, 'NEEDS_HUMAN_REVIEW');
      return { runId: run.runId, status: run.status, runDir };
    }
    writeText(path.join(runDir, '03-lecture', 'final.md'), lecture);
    this.assertDeterministicQuality(topic, brief, lecture);
    this.setStatus(runDir, run, 'LECTURE_APPROVED');
    if (maybeStop('LECTURE_APPROVED')) return { runId: run.runId, status: run.status, runDir };

    let assessmentApproved = false;
    let assessment = null;
    let assessmentReview = null;
    let assessmentRevision = 1;
    while (!assessmentApproved && assessmentRevision <= 2) {
      run.revision.assessment = assessmentRevision;
      assessment = this.agent.createAssessment({ brief, revision: assessmentRevision, fixture: options.fixture });
      writeData(path.join(runDir, '04-assessment', `draft-v${assessmentRevision}.json`), assessment);
      writeData(path.join(runDir, '04-assessment', 'draft.json'), assessment);
      validateBySchemaName(this.root, 'assessment.schema.json', assessment);
      this.setStatus(runDir, run, 'ASSESSMENT_DRAFTED');
      assessmentReview = this.agent.assessmentReview({ brief, assessment });
      writeData(path.join(runDir, '04-assessment', `review-v${assessmentRevision}.json`), assessmentReview);
      writeData(path.join(runDir, '04-assessment', 'review.json'), assessmentReview);
      const blockingAssessmentIssues = (assessmentReview.issues || []).filter(i => ['critical', 'major'].includes(i.severity));
      if (!blockingAssessmentIssues.length) assessmentApproved = true;
      else {
        writeData(path.join(runDir, '04-assessment', `revision-request-v${assessmentRevision}.json`), this.revisionRequest(topic.id, assessmentRevision + 1, `draft-v${assessmentRevision}.json`, assessmentReview));
        assessmentRevision += 1;
      }
    }
    if (!assessmentApproved) {
      this.setStatus(runDir, run, 'NEEDS_HUMAN_REVIEW');
      return { runId: run.runId, status: run.status, runDir };
    }
    writeText(path.join(runDir, '04-assessment', 'exercises.md'), this.assessmentMarkdown(assessment, false));
    writeText(path.join(runDir, '04-assessment', 'answers.md'), this.assessmentMarkdown(assessment, true));
    this.setStatus(runDir, run, 'ASSESSMENT_APPROVED');
    if (maybeStop('ASSESSMENT_APPROVED')) return { runId: run.runId, status: run.status, runDir };

    const change = this.agent.projectChange({ brief });
    writeData(path.join(runDir, '05-project', 'project-change.json'), change);
    validateBySchemaName(this.root, 'project-change.schema.json', change);
    const projectTaskPath = path.join(runDir, '05-project', 'task.md');
    writeText(
      projectTaskPath,
      change.changes.length
        ? `# Project Task\n\nPrepare the proposed analyst artifact changes for this lesson.\n`
        : '# Project Task\n\nNo analyst artifact change is required for this lesson. Use the lesson-package exercise only; do not change the canonical project documentation.\n'
    );
    let projectApproved = false;
    let projectReview = null;
    let projectRevision = 1;
    let proposedArtifacts = {};
    while (!projectApproved && projectRevision <= 3) {
      run.revision.projectArtifacts = projectRevision;
      proposedArtifacts = {};
      for (const item of change.changes) {
        const canonicalPath = path.join(this.root, 'project', 'compliance', item.artifact);
        const beforePath = path.join(runDir, '05-project', 'before', item.artifact);
        if (exists(canonicalPath)) copyFile(canonicalPath, beforePath);
        else writeText(beforePath, '');
        const proposed = this.agent.projectArtifact({ brief, change: item, revision: projectRevision, fixture: options.fixture });
        proposedArtifacts[item.artifact] = proposed;
        writeText(projectTaskPath, `# Project Task\n\nCreate proposed artifact: ${item.artifact}\n`);
        writeText(path.join(runDir, '05-project', 'proposed', item.artifact), proposed);
        writeText(path.join(runDir, '05-project', 'diff', item.artifact.replace(/[\\/]/g, '__') + `.v${projectRevision}.diff`), proposed.split('\n').map(line => `+${line}`).join('\n'));
      }
      this.setStatus(runDir, run, 'PROJECT_ARTIFACT_DRAFTED');
      projectReview = this.agent.projectReview({ brief, change, proposedArtifacts });
      writeData(path.join(runDir, '05-project', 'reviews', `project-v${projectRevision}.json`), projectReview);
      writeData(path.join(runDir, '05-project', 'reviews', 'project.json'), projectReview);
      const blockingProjectIssues = (projectReview.issues || []).filter(i => ['critical', 'major'].includes(i.severity));
      if (!blockingProjectIssues.length) projectApproved = true;
      else {
        writeData(path.join(runDir, '05-project', `revision-request-v${projectRevision}.json`), this.revisionRequest(topic.id, projectRevision + 1, `project-artifact-v${projectRevision}`, projectReview));
        projectRevision += 1;
      }
    }
    if (!projectApproved) {
      this.setStatus(runDir, run, 'NEEDS_HUMAN_REVIEW');
      return { runId: run.runId, status: run.status, runDir };
    }
    for (const [artifact, proposed] of Object.entries(proposedArtifacts)) {
      writeText(path.join(runDir, '05-project', 'approved', artifact), proposed);
    }
    this.setStatus(runDir, run, 'PROJECT_ARTIFACT_APPROVED');
    if (maybeStop('PROJECT_ARTIFACT_APPROVED')) return { runId: run.runId, status: run.status, runDir };

    const outputDir = path.join(this.root, 'output', module.id, topic.id);
    ensureDir(path.join(outputDir, 'project', 'diff'));
    copyFile(path.join(runDir, '03-lecture', 'final.md'), path.join(outputDir, 'lecture.md'));
    copyFile(path.join(runDir, '04-assessment', 'exercises.md'), path.join(outputDir, 'exercises.md'));
    copyFile(path.join(runDir, '04-assessment', 'answers.md'), path.join(outputDir, 'answers.md'));
    copyFile(path.join(runDir, '02-research', 'source-pack.md'), path.join(outputDir, 'sources.md'));
    copyFile(path.join(runDir, '05-project', 'task.md'), path.join(outputDir, 'project', 'task.md'));
    fs.cpSync(path.join(runDir, '05-project', 'proposed'), path.join(outputDir, 'project', 'solution'), { recursive: true });
    fs.cpSync(path.join(runDir, '05-project', 'diff'), path.join(outputDir, 'project', 'diff'), { recursive: true });
    const manifest = {
      topicId: topic.id,
      runId: run.runId,
      status: 'COMPLETED',
      learningOutcomes: brief.learningOutcomes.map(lo => lo.id),
      files: { lecture: 'lecture.md', exercises: 'exercises.md', answers: 'answers.md', sources: 'sources.md' },
      projectChanges: change.changes.map(c => c.artifact),
      reviews: { subject: 'APPROVED', coverage: 'APPROVED', methodology: 'APPROVED', editorial: 'APPROVED', assessment: 'APPROVED', project: 'APPROVED' }
    };
    writeData(path.join(runDir, '99-package', 'lesson-manifest.json'), manifest);
    writeData(path.join(outputDir, 'lesson-manifest.json'), manifest);
    validateBySchemaName(this.root, 'lesson-manifest.schema.json', manifest);
    this.setStatus(runDir, run, 'PACKAGE_READY');

    const progress = loadProgress(this.root);
    setTopicStatus(progress, topic.id, 'completed', { run_id: run.runId, output: `output/${module.id}/${topic.id}/` });
    recomputeProgress(this.root, curriculum, progress);
    this.setStatus(runDir, run, 'COMPLETED');
    return { runId: run.runId, status: run.status, output: outputDir, runDir };
  }

  revisionRequest(topicId, revision, sourceDraft, ...reviews) {
    const issues = reviews.flatMap(r => r.issues || []);
    return {
      topicId,
      revision,
      sourceDraft,
      mustFix: issues.filter(i => ['critical', 'major'].includes(i.severity)).map(i => ({
        source: reviews.find(r => (r.issues || []).includes(i))?.reviewer,
        issueId: i.id,
        requiredChange: i.requiredChange
      })),
      preserve: reviews.flatMap(r => r.positiveNotes || [])
    };
  }

  assessmentMarkdown(assessment, answers) {
    const lines = [answers ? '# Answers' : '# Exercises', ''];
    for (const item of assessment.items) {
      lines.push(`## ${item.id}`, '', item.question || item.task, '');
      if (item.options && !answers) for (const option of item.options) lines.push(`- ${option.id}. ${option.text}`);
      if (answers) lines.push(`Answer: ${(item.correct || [item.expectedResult]).join(', ')}`, '', item.explanation || item.expectedResult || '');
      lines.push('');
    }
    return lines.join('\n');
  }

  lectureFormatReview(topic, lecture) {
    try {
      validateLectureHeading(lecture, topic);
      return { reviewer: 'format', artifact: '03-lecture/draft.md', verdict: 'APPROVED', summary: 'Заголовок лекции соответствует номеру и названию из curriculum.', positiveNotes: [], issues: [] };
    } catch (error) {
      return {
        reviewer: 'format',
        artifact: '03-lecture/draft.md',
        verdict: 'REJECTED',
        summary: 'Заголовок лекции не соответствует обязательному формату.',
        positiveNotes: [],
        issues: [{
          id: 'FMT-LECTURE-HEADING',
          severity: 'major',
          category: 'lecture_heading',
          location: 'line 1',
          problem: error.message,
          requiredChange: `Сделать первой строкой: ${expectedLectureHeading(topic)}`
        }]
      };
    }
  }

  assertDeterministicQuality(topic, brief, lecture) {
    if (!lecture.trim()) throw new Error('QUALITY_GATE_EMPTY_LECTURE');
    validateLectureHeading(lecture, topic);
    if (lecture.length < 1000) throw new Error('QUALITY_GATE_LECTURE_TOO_SHORT');
    for (const item of brief.mustCover || []) {
      if (!lecture.toLowerCase().includes(item.toLowerCase())) throw new Error(`QUALITY_GATE_MUST_COVER_MISSING: ${item}`);
    }
    if (!lecture.includes('Compliance')) throw new Error('QUALITY_GATE_PROJECT_CASE_MISSING');
  }
}

export function resetProgressToSeed(root) {
  const curriculum = loadCurriculum(root);
  const rows = flattenTopics(curriculum);
  const progress = {
    course_id: 'system-analysis',
    updated_at: new Date().toISOString(),
    summary: {},
    last_completed: { topic_id: 'REQ-FNFR', course_order: 13, run_id: 'seed-completed-before-publisher' },
    next_candidate: { topic_id: 'REQ-STAKEHOLDERS', course_order: 14 },
    topics: {}
  };
  for (const row of rows) {
    const status = row.topic.course_order <= 13 ? 'completed' : 'planned';
    progress.topics[row.topic.id] = {
      course_order: row.topic.course_order,
      module_id: row.module.id,
      title: row.topic.title,
      status,
      output: status === 'completed' ? `output/${row.module.id}/${row.topic.id}/` : null
    };
  }
  return recomputeProgress(root, curriculum, progress);
}
