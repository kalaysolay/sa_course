import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FakeAgentAdapter } from './fakeAgents.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class OpenAIAdapter extends FakeAgentAdapter {
  constructor(options = {}) {
    super();
    this.model = options.model || process.env.OPENAI_MODEL || 'gpt-5.6-terra';
    this.reasoningEffort = options.reasoningEffort || process.env.OPENAI_REASONING_EFFORT || 'medium';
    this.temperature = options.temperature ?? (process.env.OPENAI_TEMPERATURE ? Number(process.env.OPENAI_TEMPERATURE) : 0.3);
    this.useFallbackOnError = Boolean(options.useFallbackOnError);
  }

  requireKey() {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not set. Set it before running with --adapter openai.');
    }
  }

  call({ role, system, user, textFormat = 'json' }) {
    this.requireKey();
    const worker = path.join(__dirname, 'openaiResponseWorker.mjs');
    const child = spawnSync(process.execPath, [worker], {
      input: JSON.stringify({
        model: this.model,
        reasoningEffort: this.reasoningEffort,
        temperature: this.temperature,
        textFormat,
        system,
        user
      }),
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024
    });
    if (child.status !== 0) {
      const detail = (child.stderr || child.stdout || '').trim();
      throw new Error(`OpenAI adapter failed for ${role}: ${detail}`);
    }
    const result = JSON.parse(child.stdout);
    return result.text;
  }

  callJson(args) {
    const text = this.call({ ...args, textFormat: 'json' });
    try {
      return JSON.parse(text);
    } catch (error) {
      throw new Error(`OpenAI adapter returned invalid JSON for ${args.role}: ${error.message}\n${text}`);
    }
  }

  safe(role, producer, fallback) {
    try {
      return producer();
    } catch (error) {
      if (!this.useFallbackOnError) throw error;
      return fallback();
    }
  }

  designLesson({ topic, module, section, passport, fixture }) {
    if (fixture) return super.designLesson({ topic, module, section, passport, fixture });
    return this.safe('methodologist', () => this.callJson({
      role: 'methodologist',
      system: methodologistSystem(),
      user: JSON.stringify({ topic, module: pickModule(module), section: pickSection(section), passport }, null, 2)
    }), () => super.designLesson({ topic, module, section, passport, fixture }));
  }

  scopeReview({ brief, passport, fixture }) {
    if (fixture) return super.scopeReview({ brief, passport, fixture });
    return this.safe('content-critic-scope', () => this.callJson({
      role: 'content-critic-scope',
      system: scopeCriticSystem(),
      user: JSON.stringify({ brief, passport }, null, 2)
    }), () => super.scopeReview({ brief, passport, fixture }));
  }

  writeLecture({ brief, revision = 1, fixture }) {
    if (fixture) return super.writeLecture({ brief, revision, fixture });
    return this.safe('lesson-writer', () => this.call({
      role: 'lesson-writer',
      textFormat: 'text',
      system: writerSystem(),
      user: JSON.stringify({ brief, revision }, null, 2)
    }), () => super.writeLecture({ brief, revision, fixture }));
  }

  subjectReview({ brief, lecture }) {
    return this.safe('subject-reviewer', () => this.callJson({
      role: 'subject-reviewer',
      system: reviewerSystem('subject'),
      user: JSON.stringify({ brief, lecture }, null, 2)
    }), () => super.subjectReview({ brief, lecture }));
  }

  coverageReview({ brief, lecture }) {
    return this.safe('content-critic-coverage', () => this.callJson({
      role: 'content-critic-coverage',
      system: coverageCriticSystem(),
      user: JSON.stringify({ brief, lecture }, null, 2)
    }), () => super.coverageReview({ brief, lecture }));
  }

  methodologyReview({ brief, lecture }) {
    return this.safe('methodology-reviewer', () => this.callJson({
      role: 'methodology-reviewer',
      system: reviewerSystem('methodology'),
      user: JSON.stringify({ brief, lecture }, null, 2)
    }), () => super.methodologyReview({ brief, lecture }));
  }

  editorialReview({ brief, lecture }) {
    return this.safe('editorial-reviewer', () => this.callJson({
      role: 'editorial-reviewer',
      system: reviewerSystem('editorial'),
      user: JSON.stringify({ brief, lecture }, null, 2)
    }), () => super.editorialReview({ brief, lecture }));
  }

  createAssessment({ brief, revision = 1, fixture }) {
    if (fixture) return super.createAssessment({ brief, revision, fixture });
    return this.safe('assessment-author', () => this.callJson({
      role: 'assessment-author',
      system: assessmentAuthorSystem(),
      user: JSON.stringify({ brief, revision }, null, 2)
    }), () => super.createAssessment({ brief, revision, fixture }));
  }

  assessmentReview({ brief, assessment }) {
    return this.safe('assessment-reviewer', () => this.callJson({
      role: 'assessment-reviewer',
      system: assessmentReviewerSystem(),
      user: JSON.stringify({ brief, assessment }, null, 2)
    }), () => super.assessmentReview({ brief, assessment }));
  }

  projectArtifact({ brief, change, revision = 1, fixture }) {
    if (fixture) return super.projectArtifact({ brief, change, revision, fixture });
    return this.safe('project-artifact-author', () => this.call({
      role: 'project-artifact-author',
      textFormat: 'text',
      system: projectArtifactSystem(),
      user: JSON.stringify({ brief, change, revision }, null, 2)
    }), () => super.projectArtifact({ brief, change, revision, fixture }));
  }

  projectReview({ brief, change, proposedArtifacts }) {
    return this.safe('project-artifact-reviewer', () => this.callJson({
      role: 'project-artifact-reviewer',
      system: reviewerSystem('project-artifact'),
      user: JSON.stringify({ brief, change, proposedArtifacts }, null, 2)
    }), () => super.projectReview({ brief, change, proposedArtifacts }));
  }
}

function pickModule(module) {
  return { id: module.id, title: module.title, order: module.order };
}

function pickSection(section) {
  return { id: section.id, title: section.title, order: section.order };
}

function jsonContract(extra = '') {
  return `Return only valid JSON. Use this review shape when reviewing: {"reviewer":"...","artifact":"...","verdict":"APPROVED|REJECTED","summary":"...","positiveNotes":[],"issues":[{"id":"...","severity":"critical|major|minor|suggestion","category":"...","location":"...","problem":"...","requiredChange":"..."}]}. ${extra}`;
}

function methodologistSystem() {
  return `${jsonContract()} You are Lesson Architect / Methodologist for a Russian beginner course in business and systems analysis. Create a lesson-brief JSON matching the existing contract: topicId,title,moduleId,sectionId,audienceLevel,prerequisites,learningOutcomes,mustCover,shouldCover,doNotCover,misconceptions,recommendedStructure,projectUsage,assessmentRequirements,editorialRequirements,target. Do not write the lecture. Do not mutate curriculum.`;
}

function scopeCriticSystem() {
  return `${jsonContract()} You are Content Critic in SCOPE_REVIEW mode. Check completeness of the Lesson Brief against Topic Passport. Reject major/critical missing fundamentals, missing project artifact, missing misconceptions, or scope boundary gaps. You may propose gapProposal but must not change curriculum.`;
}

function writerSystem() {
  return 'You are Lesson Writer. Write a full Russian lecture in Markdown for beginners. It must read like a human lecture for self-study and video recording, not a README. Cover all mustCover items substantively, include Compliance project examples, explain tables narratively, and respect doNotCover.';
}

function reviewerSystem(kind) {
  const focus = {
    subject: 'correctness and dangerous simplifications',
    methodology: 'teachability, prerequisites, learning outcome coverage, and practice alignment',
    editorial: 'readability, narrative flow, structure, tone, and table explanations',
    'project-artifact': 'project artifact consistency with the lesson brief and expected changes'
  }[kind] || kind;
  return `${jsonContract()} You are ${kind} reviewer. Focus on ${focus}. Reject on critical or major issues. Do not rewrite the artifact; return structured issues only.`;
}

function coverageCriticSystem() {
  return `${jsonContract()} You are Content Critic in COVERAGE_REVIEW mode. Check that the lecture substantively covers every mustCover item and every learning outcome. Reject if anything mandatory is only mentioned superficially or missing.`;
}

function assessmentAuthorSystem() {
  return `${jsonContract('For assessment return {"topicId":"...","items":[...]}.')} You are Assessment Author. Create knowledge and application questions plus a required project_case when requested. Every item must include id,type,learningOutcomes,difficulty and either question/options/correct/explanation or task/expectedResult. Cover all learning outcomes.`;
}

function assessmentReviewerSystem() {
  return `${jsonContract('Also include coverage as an object: {"LO_ID":["ITEM_ID"]}.')} You are Assessment Reviewer. Verify all learning outcomes are covered, knowledge/application counts satisfy requirements, and required project exercise exists.`;
}

function projectArtifactSystem() {
  return 'You are Project Artifact Author. Return only Markdown content for the proposed artifact. Do not edit canonical project files. The artifact must match the lesson brief, learning outcomes, and Compliance case.';
}
