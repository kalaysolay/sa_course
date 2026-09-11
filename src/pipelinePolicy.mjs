export function payloadChars(value) {
  if (value === undefined || value === null) return 0;
  return (typeof value === 'string' ? value : JSON.stringify(value)).length;
}

export function sourcePreflight(passport, sources) {
  const primaryIds = new Set(passport.sources?.primary || []);
  const missing = sources.filter(source => primaryIds.has(source.id) && source.availability !== 'available');
  const policy = passport.source_policy?.on_missing_primary || 'block_and_register_major_gap';
  const blocking = missing.length > 0 && /block|major/i.test(policy);
  return {
    policy,
    missing,
    severity: blocking ? 'major' : 'minor',
    blocking
  };
}

export function expectedProjectArtifacts(passport) {
  return passport.project?.expected_artifacts
    || passport.project?.artifacts
    || passport.projectUsage?.artifactsToUpdate
    || [];
}

export function requiresProjectStage(passport) {
  return expectedProjectArtifacts(passport).length > 0;
}

export function blockingIssues(review, severities = ['critical', 'major']) {
  const blocked = new Set(severities);
  return (review?.issues || []).filter(issue => blocked.has(issue.severity));
}

export function deterministicAssessmentReview(brief, assessment) {
  const items = assessment?.items || [];
  const covered = new Set(items.flatMap(item => item.learningOutcomes || []));
  const issues = (brief.learningOutcomes || [])
    .filter(outcome => !covered.has(outcome.id))
    .map(outcome => ({
      id: `ASM-${outcome.id}`,
      severity: 'major',
      category: 'learning_outcome_coverage',
      location: 'items',
      problem: `${outcome.id} is not assessed.`,
      requiredChange: `Add one item that assesses ${outcome.id}.`
    }));

  const projectRequired = Number(brief.assessmentRequirements?.projectCaseItems || 0) > 0;
  if (projectRequired && !items.some(item => item.type === 'project_case')) {
    issues.push({
      id: 'ASM-PROJECT-CASE',
      severity: 'major',
      category: 'project_exercise_missing',
      location: 'items',
      problem: 'The brief requires a project_case item.',
      requiredChange: 'Add one Compliance project_case item with observable acceptance criteria.'
    });
  }

  return {
    reviewer: 'deterministic-assessment',
    artifact: '04-assessment/draft.json',
    verdict: issues.length ? 'REJECTED' : 'APPROVED',
    summary: issues.length ? `Assessment has ${issues.length} blocking coverage issue(s).` : 'Assessment schema and LO coverage checks passed.',
    issues,
    coverage: Object.fromEntries((brief.learningOutcomes || []).map(outcome => [
      outcome.id,
      items.filter(item => (item.learningOutcomes || []).includes(outcome.id)).map(item => item.id)
    ]))
  };
}
