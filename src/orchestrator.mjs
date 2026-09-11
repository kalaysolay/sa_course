import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { appendJsonLine, copyFile, ensureDir, exists, readData, writeData, writeText } from './io.mjs';
import { flattenTopics, loadCurriculum, passportPath, resolveTopic } from './curriculum.mjs';
import { blockingGapsForTopic, loadGaps, registerGap } from './gaps.mjs';
import { loadProgress, recomputeProgress, saveProgress, setTopicStatus } from './progress.mjs';
import { resolveTopicSources } from './sources.mjs';
import { validateBySchemaName, validateLectureHeading, validateLecturePackageFormat } from './validation.mjs';
import { FakeAgentAdapter } from './fakeAgents.mjs';
import { buildCodexTaskPackets, codexTaskDir } from './codexTaskPackets.mjs';
import { blockingIssues, deterministicAssessmentReview, payloadChars, sourcePreflight } from './pipelinePolicy.mjs';

const TERMINAL = new Set(['COMPLETED', 'FAILED', 'NEEDS_HUMAN_REVIEW', 'CANCELLED']);

export class Orchestrator {
  constructor(root, agent = new FakeAgentAdapter()) {
    this.root = root;
    this.agent = agent;
    this.config = readData(path.join(root, 'publisher.yaml'));
  }

  now() {
    return new Date().toISOString();
  }

  event(runDir, event, data = {}) {
    appendJsonLine(path.join(runDir, 'events.jsonl'), { ts: this.now(), event, ...data });
  }

  invokeAgent(runDir, stage, input, producer) {
    const startedAt = Date.now();
    try {
      const output = producer();
      const usage = typeof this.agent.drainUsage === 'function' ? this.agent.drainUsage() : [];
      this.event(runDir, 'LLM_STAGE_COMPLETED', {
        stage,
        inputChars: payloadChars(input),
        outputChars: payloadChars(output),
        durationMs: Date.now() - startedAt,
        usage
      });
      return output;
    } catch (error) {
      this.event(runDir, 'LLM_STAGE_FAILED', {
        stage,
        inputChars: payloadChars(input),
        durationMs: Date.now() - startedAt,
        error: error.message
      });
      throw error;
    }
  }

  preflightSources(runDir, run, topic, passport, sources) {
    const decision = sourcePreflight(passport, sources);
    for (const source of decision.missing) {
      registerGap(this.root, {
        type: 'source_gap',
        severity: decision.severity,
        detected_during: { topic_id: topic.id, run_id: run.runId },
        description: `Primary source ${source.id} зарегистрирован, но недоступен.`,
        affected_topics: [topic.id],
        suggested_action: decision.blocking
          ? 'Добавить доступный primary source до генерации урока.'
          : 'Продолжить на secondary sources и явно отметить ограничение.'
      });
    }
    this.event(runDir, 'SOURCE_PREFLIGHT', {
      policy: decision.policy,
      missingPrimary: decision.missing.map(source => source.id),
      severity: decision.severity,
      blocking: decision.blocking
    });
    if (decision.blocking) {
      throw new Error(`BLOCKING_SOURCE_GAP: ${decision.missing.map(source => source.id).join(', ')}`);
    }
    return decision;
  }

  humanReviewError(error) {
    return /^(BLOCKING_GAP|BLOCKING_SOURCE_GAP|MISSING_TOPIC_PASSPORT)/.test(error.message);
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
      workflowVersion: '0.4-lean',
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

  finalizeCodexRun(runId) {
    const { runDir, run } = this.loadRun(runId);
    const existingManifest = path.join(runDir, '99-package', 'lesson-manifest.json');
    if (run.status === 'COMPLETED' && exists(existingManifest)) {
      return { runId, status: run.status, finalized: false, runDir };
    }

    const curriculum = loadCurriculum(this.root);
    const { module, topic } = resolveTopic(curriculum, run.topicId);
    const passport = readData(path.join(runDir, '00-input', 'topic-passport.json'));
    const briefPath = exists(path.join(runDir, '01-brief', 'lesson-brief-final.json'))
      ? path.join(runDir, '01-brief', 'lesson-brief-final.json')
      : path.join(runDir, '01-brief', 'lesson-brief-v1.json');
    const requiredFiles = [
      briefPath,
      path.join(runDir, '02-research', 'source-pack.md'),
      path.join(runDir, '03-lecture', 'final.md'),
      path.join(runDir, '04-assessment', 'draft.json'),
      path.join(runDir, '04-assessment', 'exercises.md'),
      path.join(runDir, '04-assessment', 'answers.md')
    ];
    const missing = requiredFiles.filter(file => !exists(file));
    if (missing.length) throw new Error(`CODEX_FINALIZE_MISSING: ${missing.map(file => path.relative(runDir, file)).join(', ')}`);

    const brief = readData(briefPath);
    const assessment = readData(path.join(runDir, '04-assessment', 'draft.json'));
    const lecture = fs.readFileSync(path.join(runDir, '03-lecture', 'final.md'), 'utf8');
    validateBySchemaName(this.root, 'lesson-brief.schema.json', brief);
    validateBySchemaName(this.root, 'assessment.schema.json', assessment);
    const formatIssues = validateLecturePackageFormat(lecture, topic);
    if (formatIssues.length) throw new Error(`CODEX_FINALIZE_FORMAT: ${formatIssues.map(issue => issue.id).join(', ')}`);
    this.assertDeterministicQuality(topic, brief, lecture);
    const lectureReviewRoot = path.join(runDir, '03-lecture');
    const reviewDirs = fs.readdirSync(lectureReviewRoot, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && /^review-v\d+$/.test(entry.name))
      .map(entry => entry.name)
      .sort((left, right) => Number(left.slice(8)) - Number(right.slice(8)));
    const verdicts = {};
    for (const reviewDir of reviewDirs) {
      for (const name of ['content', 'learning']) {
        const reviewPath = path.join(lectureReviewRoot, reviewDir, `${name}.json`);
        if (exists(reviewPath)) verdicts[name] = readData(reviewPath);
      }
    }
    const missingReviews = ['content', 'learning'].filter(name => !verdicts[name]);
    const rejectedReviews = Object.entries(verdicts).filter(([, review]) => review.verdict !== 'APPROVED');
    if (missingReviews.length || rejectedReviews.length) {
      throw new Error(`CODEX_FINALIZE_REVIEW: missing=${missingReviews.join(',') || 'none'} rejected=${rejectedReviews.map(([name]) => name).join(',') || 'none'}`);
    }
    const finalReviewDir = path.join(lectureReviewRoot, reviewDirs.at(-1) || 'review-v1');
    ensureDir(finalReviewDir);
    writeData(path.join(finalReviewDir, 'format.json'), this.lectureFormatReview(topic, lecture));
    const assessmentReview = deterministicAssessmentReview(brief, assessment);
    if (blockingIssues(assessmentReview).length) {
      writeData(path.join(runDir, '04-assessment', 'review.json'), assessmentReview);
      throw new Error(`CODEX_FINALIZE_ASSESSMENT: ${blockingIssues(assessmentReview).map(issue => issue.id).join(', ')}`);
    }

    const projectArtifacts = passport.project?.expected_artifacts || [];
    let change = { topicId: topic.id, changes: [] };
    const changePath = path.join(runDir, '05-project', 'project-change.json');
    if (exists(changePath)) change = readData(changePath);
    if (projectArtifacts.length && !exists(changePath)) {
      throw new Error('CODEX_FINALIZE_PROJECT: project-change.json is required by the Topic Passport.');
    }
    if (!exists(path.join(runDir, '05-project', 'task.md'))) {
      writeText(path.join(runDir, '05-project', 'task.md'), projectArtifacts.length
        ? '# Project Task\n\nSee the approved project artifacts in this lesson package.\n'
        : '# Project Task\n\nNo separate project artifact is required; use the assessment project case.\n');
    }

    const outputDir = path.join(this.root, 'output', module.id, topic.id);
    ensureDir(path.join(outputDir, 'project', 'diff'));
    copyFile(path.join(runDir, '03-lecture', 'final.md'), path.join(outputDir, 'lecture.md'));
    copyFile(path.join(runDir, '04-assessment', 'exercises.md'), path.join(outputDir, 'exercises.md'));
    copyFile(path.join(runDir, '04-assessment', 'answers.md'), path.join(outputDir, 'answers.md'));
    copyFile(path.join(runDir, '02-research', 'source-pack.md'), path.join(outputDir, 'sources.md'));
    copyFile(path.join(runDir, '05-project', 'task.md'), path.join(outputDir, 'project', 'task.md'));
    if (exists(path.join(runDir, '05-project', 'approved'))) {
      fs.cpSync(path.join(runDir, '05-project', 'approved'), path.join(outputDir, 'project', 'solution'), { recursive: true });
    }
    if (exists(path.join(runDir, '05-project', 'diff'))) {
      fs.cpSync(path.join(runDir, '05-project', 'diff'), path.join(outputDir, 'project', 'diff'), { recursive: true });
    }

    const metrics = this.payloadMetrics(runDir);
    writeData(path.join(runDir, '99-package', 'payload-metrics.json'), metrics);
    const manifest = {
      topicId: topic.id,
      runId: run.runId,
      status: 'COMPLETED',
      workflowVersion: run.workflowVersion,
      learningOutcomes: brief.learningOutcomes.map(outcome => outcome.id),
      files: { lecture: 'lecture.md', exercises: 'exercises.md', answers: 'answers.md', sources: 'sources.md' },
      projectChanges: (change.changes || []).map(item => item.artifact),
      reviews: { content: 'APPROVED', learning: 'APPROVED', format: 'APPROVED', assessment: 'APPROVED', project: projectArtifacts.length ? 'APPROVED' : 'SKIPPED' },
      metrics: 'payload-metrics.json'
    };
    writeData(existingManifest, manifest);
    writeData(path.join(outputDir, 'lesson-manifest.json'), manifest);
    validateBySchemaName(this.root, 'lesson-manifest.schema.json', manifest);
    this.setStatus(runDir, run, 'PACKAGE_READY');

    const progress = loadProgress(this.root);
    setTopicStatus(progress, topic.id, 'completed', { run_id: run.runId, output: `output/${module.id}/${topic.id}/` });
    recomputeProgress(this.root, curriculum, progress);
    this.event(runDir, 'CODEX_RUN_FINALIZED', { output: `output/${module.id}/${topic.id}/`, metrics });
    this.setStatus(runDir, run, 'COMPLETED');
    return { runId, status: run.status, finalized: true, output: outputDir, runDir };
  }

  payloadMetrics(runDir) {
    const eventPath = path.join(runDir, 'events.jsonl');
    const events = exists(eventPath)
      ? fs.readFileSync(eventPath, 'utf8').split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line))
      : [];
    const stages = events.filter(event => event.event === 'LLM_STAGE_COMPLETED');
    const exactUsage = stages.flatMap(stage => stage.usage || []).reduce((totals, item) => {
      const usage = item.usage || {};
      totals.inputTokens += usage.input_tokens || 0;
      totals.outputTokens += usage.output_tokens || 0;
      totals.totalTokens += usage.total_tokens || 0;
      totals.cachedInputTokens += usage.input_tokens_details?.cached_tokens || 0;
      totals.reasoningTokens += usage.output_tokens_details?.reasoning_tokens || 0;
      return totals;
    }, { inputTokens: 0, outputTokens: 0, totalTokens: 0, cachedInputTokens: 0, reasoningTokens: 0 });
    const pathChars = target => {
      if (!exists(target)) return 0;
      const stat = fs.statSync(target);
      if (stat.isFile()) return fs.readFileSync(target, 'utf8').length;
      return fs.readdirSync(target, { withFileTypes: true })
        .reduce((sum, entry) => sum + pathChars(path.join(target, entry.name)), 0);
    };
    const codexManifestPath = path.join(runDir, 'codex-tasks', 'codex-manifest.json');
    const codexManifest = exists(codexManifestPath) ? readData(codexManifestPath) : null;
    const plannedCodexInputChars = (codexManifest?.tasks || []).reduce((sum, task) => (
      sum + (task.inputFiles || []).reduce((taskSum, file) => taskSum + pathChars(path.join(runDir, file)), 0)
    ), 0);
    const producedCodexOutputChars = (codexManifest?.tasks || []).reduce((sum, task) => (
      sum + (task.expectedOutputs || []).reduce((taskSum, output) => taskSum + pathChars(path.join(runDir, output)), 0)
    ), 0);
    return {
      measuredAt: this.now(),
      stageCount: stages.length,
      payloadInputChars: stages.reduce((sum, stage) => sum + (stage.inputChars || 0), 0),
      payloadOutputChars: stages.reduce((sum, stage) => sum + (stage.outputChars || 0), 0),
      plannedCodexInputChars,
      producedCodexOutputChars,
      exactUsageAvailable: exactUsage.totalTokens > 0,
      exactUsage
    };
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
      copyFile(path.join(this.root, 'course', 'audience.md'), path.join(runDir, '00-input', 'audience.md'));
      copyFile(path.join(this.root, 'course', 'course-style.md'), path.join(runDir, '00-input', 'course-style.md'));
      this.preflightSources(runDir, run, topic, passport, sources);
      this.setStatus(runDir, run, 'CONTEXT_READY');

      const openGaps = loadGaps(this.root).gaps.filter(gap => gap.status === 'open' && (gap.affected_topics || []).includes(topic.id));
      const publisherConfig = this.config;
      const tasks = buildCodexTaskPackets({
        createdAt: this.now(),
        run,
        module,
        section,
        topic,
        passport,
        sources,
        openGaps,
        courseTracker: publisherConfig.course_tracker,
        optimization: publisherConfig.optimization
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
      const status = this.humanReviewError(error) ? 'NEEDS_HUMAN_REVIEW' : 'FAILED';
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
      const sources = resolveTopicSources(this.root, passport);
      writeData(path.join(runDir, '00-input', 'topic-passport.json'), passport);
      writeData(path.join(runDir, '00-input', 'source-registry-slice.json'), sources);
      this.preflightSources(runDir, run, topic, passport, sources);
      this.setStatus(runDir, run, 'CONTEXT_READY');

      return this.continueRunInternal(runDir, run, { curriculum, module, section, topic, passport, options });
    } catch (error) {
      run.errors.push({ ts: this.now(), message: error.message });
      const status = this.humanReviewError(error) ? 'NEEDS_HUMAN_REVIEW' : 'FAILED';
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
      : this.invokeAgent(runDir, 'lesson-brief', { topic, module: module.id, section: section.id, passport }, () => (
          this.agent.designLesson({ topic, module, section, passport, fixture: options.fixture })
        ));
    writeData(path.join(runDir, '01-brief', 'lesson-brief-v1.json'), brief);
    validateBySchemaName(this.root, 'lesson-brief.schema.json', brief);
    this.event(runDir, 'ARTIFACT_CREATED', { path: '01-brief/lesson-brief-v1.json' });
    if (maybeStop('BRIEF_READY')) return { runId: run.runId, status: run.status, runDir };
    this.setStatus(runDir, run, 'BRIEF_READY');

    let scope = this.invokeAgent(runDir, 'scope-review', { brief, passport }, () => (
      this.agent.scopeReview({ brief, passport, fixture: options.fixture })
    ));
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
      brief = this.invokeAgent(runDir, 'lesson-brief-revision', { topic, module: module.id, section: section.id, passport }, () => (
        this.agent.designLesson({ topic, module, section, passport, fixture: null })
      ));
      writeData(path.join(runDir, '01-brief', 'lesson-brief-final.json'), brief);
      scope = this.invokeAgent(runDir, 'scope-review-recheck', { brief, passport }, () => (
        this.agent.scopeReview({ brief, passport, fixture: null })
      ));
      writeData(path.join(runDir, '01-brief', 'scope-review-v2.json'), scope);
      if (scope.verdict === 'REJECTED') throw new Error('BRIEF_REWORK_FAILED');
    } else {
      writeData(path.join(runDir, '01-brief', 'lesson-brief-final.json'), brief);
    }

    const sources = resolveTopicSources(this.root, passport);
    const sourcePack = this.invokeAgent(runDir, 'research', { sources }, () => this.agent.research({ sources }));
    writeText(path.join(runDir, '02-research', 'source-pack.md'), sourcePack);
    this.setStatus(runDir, run, 'RESEARCH_READY');

    let lectureApproved = false;
    let revision = 1;
    let lecture = '';
    let previousLecture = '';
    let requestedChanges = null;
    let activeReviewers = new Set(['content', 'learning']);
    const maxLectureRevisions = this.config.optimization?.mode === 'lean'
      ? Math.min(this.config.revisions?.lecture || 2, 2)
      : (this.config.revisions?.lecture || 3);
    while (!lectureApproved && revision <= maxLectureRevisions) {
      run.revision.lecture = revision;
      lecture = this.invokeAgent(runDir, `lecture-v${revision}`, { brief, sourcePack, previousLecture, requestedChanges }, () => (
        this.agent.writeLecture({ brief, topic, revision, fixture: options.fixture, previousLecture, requestedChanges })
      ));
      const draftName = `draft-v${revision}.md`;
      writeText(path.join(runDir, '03-lecture', draftName), lecture);
      this.setStatus(runDir, run, 'LECTURE_DRAFTED');
      const reviews = { format: this.lectureFormatReview(topic, lecture) };
      if (!blockingIssues(reviews.format).length) {
        if (activeReviewers.has('content')) {
          reviews.content = this.invokeAgent(runDir, `content-review-v${revision}`, { brief, lecture }, () => (
            this.agent.contentReview({ brief, lecture })
          ));
        }
        if (activeReviewers.has('learning')) {
          reviews.learning = this.invokeAgent(runDir, `learning-review-v${revision}`, { brief, lecture }, () => (
            this.agent.learningReview({ brief, lecture })
          ));
        }
      }
      const reviewDir = path.join(runDir, '03-lecture', `review-v${revision}`);
      ensureDir(reviewDir);
      for (const [name, value] of Object.entries(reviews)) writeData(path.join(reviewDir, `${name}.json`), value);
      this.setStatus(runDir, run, 'LECTURE_REVIEW');
      const blocking = Object.values(reviews).flatMap(review => blockingIssues(review));
      if (!blocking.length) lectureApproved = true;
      else {
        requestedChanges = this.revisionRequest(topic.id, revision + 1, draftName, ...Object.values(reviews));
        writeData(path.join(runDir, '03-lecture', `revision-request-v${revision}.json`), requestedChanges);
        if (!blockingIssues(reviews.format).length) {
          activeReviewers = new Set(Object.entries(reviews)
            .filter(([name, review]) => name !== 'format' && blockingIssues(review).length)
            .map(([name]) => name));
        }
        previousLecture = lecture;
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
    const maxAssessmentRevisions = this.config.revisions?.assessment || 2;
    while (!assessmentApproved && assessmentRevision <= maxAssessmentRevisions) {
      run.revision.assessment = assessmentRevision;
      assessment = this.invokeAgent(runDir, `assessment-v${assessmentRevision}`, { brief, revision: assessmentRevision }, () => (
        this.agent.createAssessment({ brief, revision: assessmentRevision, fixture: options.fixture })
      ));
      writeData(path.join(runDir, '04-assessment', `draft-v${assessmentRevision}.json`), assessment);
      writeData(path.join(runDir, '04-assessment', 'draft.json'), assessment);
      validateBySchemaName(this.root, 'assessment.schema.json', assessment);
      this.setStatus(runDir, run, 'ASSESSMENT_DRAFTED');
      assessmentReview = deterministicAssessmentReview(brief, assessment);
      if (blockingIssues(assessmentReview).length && this.config.optimization?.assessment_semantic_review === 'on_validation_failure') {
        assessmentReview = this.invokeAgent(runDir, `assessment-diagnosis-v${assessmentRevision}`, { brief, assessment }, () => (
          this.agent.assessmentReview({ brief, assessment })
        ));
      }
      writeData(path.join(runDir, '04-assessment', `review-v${assessmentRevision}.json`), assessmentReview);
      writeData(path.join(runDir, '04-assessment', 'review.json'), assessmentReview);
      if (!blockingIssues(assessmentReview).length) assessmentApproved = true;
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
    const maxProjectRevisions = this.config.optimization?.mode === 'lean'
      ? Math.min(this.config.revisions?.project_artifacts || 2, 2)
      : (this.config.revisions?.project_artifacts || 3);
    if (!change.changes.length && this.config.optimization?.skip_project_when_no_expected_artifacts !== false) {
      run.revision.projectArtifacts = 0;
      projectApproved = true;
      this.event(runDir, 'PROJECT_ARTIFACT_SKIPPED', { reason: 'no_expected_artifacts' });
    }
    while (!projectApproved && projectRevision <= maxProjectRevisions) {
      run.revision.projectArtifacts = projectRevision;
      proposedArtifacts = {};
      for (const item of change.changes) {
        const canonicalPath = path.join(this.root, 'project', 'compliance', item.artifact);
        const beforePath = path.join(runDir, '05-project', 'before', item.artifact);
        if (exists(canonicalPath)) copyFile(canonicalPath, beforePath);
        else writeText(beforePath, '');
        const proposed = this.invokeAgent(runDir, `project-artifact-v${projectRevision}`, { brief, change: item }, () => (
          this.agent.projectArtifact({ brief, change: item, revision: projectRevision, fixture: options.fixture })
        ));
        proposedArtifacts[item.artifact] = proposed;
        writeText(projectTaskPath, `# Project Task\n\nCreate proposed artifact: ${item.artifact}\n`);
        writeText(path.join(runDir, '05-project', 'proposed', item.artifact), proposed);
        writeText(path.join(runDir, '05-project', 'diff', item.artifact.replace(/[\\/]/g, '__') + `.v${projectRevision}.diff`), proposed.split('\n').map(line => `+${line}`).join('\n'));
      }
      this.setStatus(runDir, run, 'PROJECT_ARTIFACT_DRAFTED');
      projectReview = this.invokeAgent(runDir, `project-review-v${projectRevision}`, { brief, change, proposedArtifacts }, () => (
        this.agent.projectReview({ brief, change, proposedArtifacts })
      ));
      writeData(path.join(runDir, '05-project', 'reviews', `project-v${projectRevision}.json`), projectReview);
      writeData(path.join(runDir, '05-project', 'reviews', 'project.json'), projectReview);
      if (!blockingIssues(projectReview).length) projectApproved = true;
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
    const metrics = this.payloadMetrics(runDir);
    writeData(path.join(runDir, '99-package', 'payload-metrics.json'), metrics);
    const manifest = {
      topicId: topic.id,
      runId: run.runId,
      status: 'COMPLETED',
      learningOutcomes: brief.learningOutcomes.map(lo => lo.id),
      files: { lecture: 'lecture.md', exercises: 'exercises.md', answers: 'answers.md', sources: 'sources.md' },
      projectChanges: change.changes.map(c => c.artifact),
      reviews: { content: 'APPROVED', learning: 'APPROVED', format: 'APPROVED', assessment: 'APPROVED', project: change.changes.length ? 'APPROVED' : 'SKIPPED' },
      metrics: 'payload-metrics.json'
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
    const issues = validateLecturePackageFormat(lecture, topic);
    return {
      reviewer: 'format',
      artifact: '03-lecture/draft.md',
      verdict: issues.length ? 'REJECTED' : 'APPROVED',
      summary: issues.length ? `Deterministic format checks found ${issues.length} blocking issue(s).` : 'Deterministic format and package-link checks passed.',
      positiveNotes: [],
      issues
    };
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
