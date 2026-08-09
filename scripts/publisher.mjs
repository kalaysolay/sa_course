#!/usr/bin/env node
import { runCli } from '../src/cli.mjs';

try {
  const result = runCli(process.argv.slice(2), process.cwd());
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
