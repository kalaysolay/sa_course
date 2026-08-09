import { Orchestrator } from './orchestrator.mjs';
import { OpenAIAdapter } from './openaiAdapter.mjs';

export function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};
  const positional = [];
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (arg === '--fixture') options.fixture = rest[++i];
    else if (arg === '--stop-after') options.stopAfter = rest[++i];
    else if (arg === '--adapter') options.adapter = rest[++i];
    else if (arg === '--model') options.model = rest[++i];
    else if (arg === '--reasoning') options.reasoningEffort = rest[++i];
    else if (arg === '--temperature') options.temperature = Number(rest[++i]);
    else if (arg === '--fallback-on-error') options.useFallbackOnError = true;
    else positional.push(arg);
  }
  return { command, positional, options };
}

export function runCli(argv, root = process.cwd()) {
  const { command, positional, options } = parseArgs(argv);
  const codexMode = options.adapter === 'codex';
  const adapter = options.adapter === 'openai'
    ? new OpenAIAdapter({
        model: options.model,
        reasoningEffort: options.reasoningEffort,
        temperature: options.temperature,
        useFallbackOnError: options.useFallbackOnError
      })
    : undefined;
  if (adapter && command !== '/course-status' && command !== '/list-gaps' && command !== '/status') {
    adapter.requireKey();
  }
  const orchestrator = new Orchestrator(root, adapter);
  const input = [command || '', ...positional].join(' ').trim();
  if (!command || command === '/course-status' || /где мы остановились/i.test(input)) return orchestrator.courseStatus();
  if (command === '/list-gaps' || /gap/i.test(input) || /дыры/i.test(input)) return orchestrator.courseStatus().gaps;
  if (command === '/prepare-codex-next') return orchestrator.prepareCodexNext(options);
  if (command === '/prepare-codex-topic' || command === '/prepare-codex-lesson') return orchestrator.prepareCodexRun(positional[0], options);
  if (command === '/publish-next' || command === '/continue-course' || /продолжай курс/i.test(input) || /следующ/i.test(input)) return codexMode ? orchestrator.prepareCodexNext(options) : orchestrator.publishNext(options);
  if (command === '/publish-topic') return codexMode ? orchestrator.prepareCodexRun(positional[0], options) : orchestrator.publishTopic(positional[0], options);
  if (command === '/publish-lesson') return codexMode ? orchestrator.prepareCodexRun(positional[0], options) : orchestrator.publishTopic(positional[0], options);
  if (command === '/resume') return orchestrator.resume(positional[0], options);
  if (command === '/status') return orchestrator.loadRun(positional[0]).run;
  const lesson = input.match(/лекци[яю]\s*№?\s*(\d+)/i);
  if (lesson) return codexMode ? orchestrator.prepareCodexRun(lesson[1], options) : orchestrator.publishTopic(lesson[1], options);
  throw new Error('UNKNOWN_COMMAND: ' + command);
}
