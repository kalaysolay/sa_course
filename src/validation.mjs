import path from 'node:path';
import { readData } from './io.mjs';

export class ValidationError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = 'ValidationError';
    this.details = details;
  }
}

export function validateRequired(value, required, label) {
  const missing = required.filter(k => value?.[k] === undefined || value?.[k] === null);
  if (missing.length) throw new ValidationError(`${label} missing required fields: ${missing.join(', ')}`, missing);
  return true;
}

export function validateBySchemaName(root, schemaName, value) {
  const schema = readData(path.join(root, 'schemas', schemaName));
  return validateRequired(value, schema.required || [], schemaName);
}

export function expectedLectureHeading(topic) {
  return `# Лекция ${topic.course_order}. ${topic.title}`;
}

export function validateLectureHeading(lecture, topic) {
  const actual = lecture.split(/\r?\n/, 1)[0];
  const expected = expectedLectureHeading(topic);
  if (actual !== expected) {
    throw new ValidationError(`QUALITY_GATE_INVALID_LECTURE_HEADING: expected "${expected}", received "${actual}"`);
  }
  return true;
}

export function validateLecturePackageFormat(lecture, topic) {
  const issues = [];
  try {
    validateLectureHeading(lecture, topic);
  } catch (error) {
    issues.push({
      id: 'FMT-LECTURE-HEADING',
      severity: 'major',
      category: 'lecture_heading',
      location: 'line 1',
      problem: error.message,
      requiredChange: `Сделать первой строкой: ${expectedLectureHeading(topic)}`
    });
  }

  const runRelativeLinks = [...lecture.matchAll(/\[[^\]]+\]\((\.\.\/[^)]+)\)/g)];
  for (const match of runRelativeLinks) {
    issues.push({
      id: `FMT-PACKAGE-LINK-${issues.length + 1}`,
      severity: 'major',
      category: 'package_link_integrity',
      location: match[0],
      problem: `Run-relative link ${match[1]} will not survive publication into the lesson package.`,
      requiredChange: 'Use a public URL or a path that exists inside the published lesson package.'
    });
  }

  const fences = lecture.match(/^```/gm) || [];
  if (fences.length % 2 !== 0) {
    issues.push({
      id: 'FMT-UNCLOSED-FENCE',
      severity: 'major',
      category: 'markdown_fence',
      location: 'lecture body',
      problem: 'Markdown contains an unclosed fenced code block.',
      requiredChange: 'Close every fenced code block before review.'
    });
  }

  return issues;
}
