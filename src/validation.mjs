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
