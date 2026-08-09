import fs from 'node:fs';
import path from 'node:path';

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

export function readText(file) {
  return fs.readFileSync(file, 'utf8');
}

export function writeText(file, content) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, content, 'utf8');
}

export function appendJsonLine(file, value) {
  ensureDir(path.dirname(file));
  fs.appendFileSync(file, JSON.stringify(value) + '\n', 'utf8');
}

export function readData(file) {
  const text = readText(file).trim();
  return text ? JSON.parse(text) : null;
}

export function writeData(file, value) {
  writeText(file, JSON.stringify(value, null, 2) + '\n');
}

export function copyFile(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

export function exists(file) {
  return fs.existsSync(file);
}
