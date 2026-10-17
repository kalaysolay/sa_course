/* Регрессии изоляции аккаунтов и восстановления сессии; запуск: node --test tests/session.test.cjs. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function browser(fetch, saved = new Map()) {
  const events = new EventTarget();
  const document = new EventTarget();
  document.cookie = '';
  document.readyState = 'complete';
  const c = {
    document, navigator: {}, crypto: require('node:crypto').webcrypto, Event, TextEncoder, AbortSignal, console, setTimeout, clearTimeout,
    location: { protocol: 'http:', reload() { c.reloaded = true; } },
    addEventListener: events.addEventListener.bind(events), dispatchEvent: events.dispatchEvent.bind(events),
    localStorage: { getItem: k => saved.get(k) || null, setItem: (k, v) => saved.set(k, v) },
    fetch, SA_DATA: { tasks: [] }, AppUI: { confirm: async () => false }
  };
  c.window = c;
  vm.createContext(c);
  c.load = name => vm.runInContext(fs.readFileSync(path.join(__dirname, '../assets/js', name), 'utf8'), c);
  c.load('store.js');
  return c;
}

const response = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json' }
});

function runView(extra = {}) {
  return { id: 'run', version: 0, bankVersion: 'bank-v1', status: 'active', questions: [{ id: 'old', options: ['А', 'Б'] }],
    answers: {}, flags: {}, index: 0, startedAt: 1000, result: null, ...extra };
}

test('Поздние ответы диагностики не попадают в другой аккаунт после переключения', async () => {
  for (const operation of ['begin', 'load', 'finish', 'claimGuest']) {
    const c = browser(); c.Api = { mode: 'server', user: { id: 'a' } };
    c.Store.setUser(null); c.Store.saveAssessment({ ...runView(), runId: 'run', server: true, guestToken: 'guest' });
    c.Store.setUser('a'); c.Store.saveAssessment({ ...runView(), runId: 'run', server: true }); c.load('assessment-session.js');
    let release;
    const delayed = async () => { await new Promise(resolve => { release = resolve; }); return runView(); };
    c.Api.startAssessmentRun = c.Api.getAssessmentRun = c.Api.finishAssessmentRun = c.Api.claimAssessmentRun = delayed;
    const pending = c.AssessmentSession[operation]();
    while (!release) await new Promise(resolve => setImmediate(resolve));
    c.dispatchEvent(new Event('ag:before-account-change')); c.Store.setUser('b'); c.Api.user = { id: 'b' };
    release(); await assert.rejects(pending, /Аккаунт изменился/);
    assert.equal(c.Store.assessment(), null, operation);
  }
});

test('Привязка гостя сохраняет ещё не отправленные ответы и завершённый конфликт отдельной копией', async () => {
  const c = browser(); c.Api = { mode: 'server', user: { id: 'a' } }; c.load('assessment-session.js');
  c.Store.setUser(null); c.Store.saveAssessment({ ...runView(), runId: 'run', server: true, guestToken: 'guest', dirty: true, answers: { old: 1 } });
  c.Store.setUser('a'); c.Api.claimAssessmentRun = async () => runView({ version: 1 });
  c.Api.saveAssessmentRun = async (id, token, p) => runView({ version: 2, answers: p.answers });
  await c.AssessmentSession.claimGuest();
  assert.equal(c.Store.assessment().answers.old, 1); assert.equal(c.Store.assessment().dirty, false);
  assert.equal(c.Store.guestAssessment(), null);
  c.Store.setUser(null); c.Store.saveAssessment({ ...runView(), runId: 'run', server: true, guestToken: 'guest', dirty: true, answers: { old: 1 } });
  c.Store.setUser('a'); c.Api.claimAssessmentRun = async () => runView({ status: 'completed', answers: { old: 0 } });
  await c.AssessmentSession.claimGuest();
  assert.equal(c.Store.assessment().answers.old, 0); assert.equal(c.Store.assessment().unsyncedBackup.answers.old, 1);
});

test('Истёкшее гостевое прохождение позволяет начать новое с сохранением прежней локальной копии', async () => {
  const c = browser(); c.Api = { mode: 'server', user: null }; c.Store.setUser(null); c.load('assessment-session.js');
  c.Store.saveAssessment({ ...runView(), runId: 'run', server: true, guestToken: 'guest', answers: { old: 1 } });
  c.Api.getAssessmentRun = async () => { throw Object.assign(new Error('Истёк'), { status: 410 }); };
  assert.equal((await c.AssessmentSession.load()).unavailable, true);
  c.Api.startAssessmentRun = async id => runView({ id }); await c.AssessmentSession.begin();
  assert.notEqual(c.Store.assessment().runId, 'run');
  assert.equal(c.Store.assessment().previousRunBackup.answers.old, 1);
});

test('Диагностика повторяет потерянный старт с прежними идентификатором и гостевым секретом', async () => {
  const c = browser(); c.Api = { mode: 'server', user: null }; c.Store.setUser(null); c.load('assessment-session.js');
  const starts = [];
  c.Api.startAssessmentRun = async (id, token) => { starts.push({ id, token }); if (starts.length === 1) throw new Error('Сеть'); return runView({ id }); };
  await assert.rejects(c.AssessmentSession.begin());
  const first = c.Store.assessment(); assert.equal(first.starting, true); assert.ok(first.guestToken.length >= 32);
  await c.AssessmentSession.begin();
  assert.deepEqual(starts[0], starts[1]); assert.equal(c.Store.assessment().bankVersion, 'bank-v1');
});

test('Ответ сервера на прошлый прогресс не затирает новые ответы во время сохранения', async () => {
  const c = browser(); c.Api = { mode: 'server', user: { id: 'a' } }; c.Store.setUser('a'); c.load('assessment-session.js');
  c.Store.saveAssessment({ ...runView(), runId: 'run', server: true, sync: 'saved' });
  let release, sent = [];
  c.Api.saveAssessmentRun = async (id, token, progress) => {
    sent.push(JSON.parse(JSON.stringify(progress)));
    if (sent.length === 1) await new Promise(resolve => { release = resolve; });
    return runView({ version: sent.length, answers: progress.answers });
  };
  c.AssessmentSession.save({ answers: { old: 0 }, flags: {}, index: 0 });
  const pending = c.AssessmentSession.flush();
  c.AssessmentSession.save({ answers: { old: 1 }, flags: {}, index: 0 }); release(); await pending;
  assert.equal(sent.length, 2); assert.equal(sent[1].version, 1);
  assert.equal(c.Store.assessment().answers.old, 1); assert.equal(c.Store.assessment().version, 2);
  assert.equal(c.Store.assessment().dirty, false);
});

test('Конфликт диагностики и сеть сохраняют локальную копию, завершение использует только серверный результат', async () => {
  const c = browser(); c.Api = { mode: 'server', user: { id: 'a' } }; c.Store.setUser('a'); c.load('assessment-session.js');
  c.Store.saveAssessment({ ...runView(), runId: 'run', server: true, sync: 'saved' });
  c.Api.saveAssessmentRun = async () => { const error = new Error('Версия'); error.status = 409; throw error; };
  c.AssessmentSession.save({ answers: { old: 1 }, flags: {}, index: 0 });
  await assert.rejects(c.AssessmentSession.flush());
  assert.equal(c.Store.assessment().sync, 'conflict'); assert.equal(c.Store.assessment().answers.old, 1);
  c.Api.getAssessmentRun = async () => runView({ version: 4 }); c.AppUI.confirm = async () => true;
  c.Api.saveAssessmentRun = async (id, token, p) => runView({ version: p.version + 1, answers: p.answers });
  await c.AssessmentSession.retry();
  c.Api.finishAssessmentRun = async () => runView({ status: 'completed', result: { scoreRounded: 17 }, finishedAt: '2026-10-17T00:00:00Z' });
  await c.AssessmentSession.finish();
  assert.equal(c.Store.assessment().result.scoreRounded, 17); assert.equal(c.Store.assessment().sync, 'saved');
});

test('Загрузка диагностики использует замороженные серверные вопросы и сохраняет неподтверждённые ответы', async () => {
  const c = browser(); c.Api = { mode: 'server', user: { id: 'a' } }; c.Store.setUser('a'); c.load('assessment-session.js');
  c.Store.saveAssessment({ ...runView(), runId: 'run', server: true, dirty: true, answers: { old: 1 } });
  c.Api.getAssessmentRun = async () => runView({ version: 2, answers: { old: 0 } });
  await c.AssessmentSession.load();
  assert.equal(c.Store.assessment().sync, 'conflict'); assert.equal(c.Store.assessment().answers.old, 1);
  assert.equal(c.Store.assessment().questions[0].id, 'old');
});

test('Серверный каталог полностью заменяет встроенные задачи и игнорирует локальные правки', async () => {
  const c = browser(server(async url => url === '/api/auth/me' ? response({ id: 'a' }) : response({}, 404)));
  c.SA_DATA.tasks = [{ id: 'removed', title: 'Архив' }, { id: 'live', title: 'Старый текст' }];
  c.Store.saveTaskEdit('live', { title: 'Локальная подмена' });
  const fetch = c.fetch;
  c.fetch = (url, options) => url === '/api/tasks' ? response([{ id: 'live', title: 'С сервера' }]) : fetch(url, options);
  c.load('api.js'); await c.Api.ready;
  assert.equal(c.Store.tasks().length, 1);
  assert.equal(c.Store.task('removed'), null);
  assert.equal(c.Store.task('live').title, 'С сервера');
});

test('Пустые серверные справочники и каталог не восстанавливаются из демо', async () => {
  const c = browser(server(async url => url === '/api/auth/me' ? response({ id: 'a' }) : response({}, 404)));
  c.SA_DATA.tasks = [{ id: 'demo' }]; c.SA_DATA.tags = [{ id: 'demo-tag' }];
  c.SA_DATA.collections = [{ id: 'demo-set' }];
  c.load('api.js'); await c.Api.ready;
  assert.equal(c.Store.tasks().length, 0);
  assert.equal(c.Store.dictionaries().tags.length, 0);
  assert.equal(c.Store.dictionaries().collections.length, 0);
});

test('Ошибка обновления каталога сохраняет режим сервера и не показывает встроенные задачи', async () => {
  const c = browser(server(async url => url === '/api/auth/me' ? response({ id: 'a' }) : response({}, 404)));
  c.SA_DATA.tasks = [{ id: 'demo' }];
  const fetch = c.fetch;
  c.fetch = (url, options) => url === '/api/tasks' ? response({}, 503) : fetch(url, options);
  c.load('api.js'); await c.Api.ready;
  assert.equal(c.Api.mode, 'server');
  assert.ok(c.Api.catalogError);
  assert.equal(c.Store.tasks().length, 0);
});

test('Детали задачи читаются отдельным запросом, эталон не подменяется встроенным', async () => {
  const c = browser(server(async url => {
    if (url === '/api/auth/me') return response({ id: 'a' });
    if (url.endsWith('/detail')) return response({ id: 'live', statement: { brief: 'Новое' }, version: 12 });
    return response({ error: 'reference_locked' }, 403);
  }));
  c.load('api.js'); await c.Api.ready;
  const detail = await c.Api.getTask('live');
  assert.equal(detail.statement.brief, 'Новое');
  assert.equal(detail.version, 12);
  assert.equal(detail.authorSolution, undefined);
  await assert.rejects(c.Api.getReference('live'), e => e.status === 403);
});

test('Отправка решения передаёт именно открытую версию задачи', async () => {
  let submitted;
  const c = browser(server(async (url, options) => {
    if (url === '/api/auth/me') return response({ id: 'a' });
    submitted = JSON.parse(options.body); return response({ attemptId: 'one' });
  }));
  c.load('api.js'); await c.Api.ready;
  await c.Api.submitAttempt('live', [], 'same-key', 42);
  assert.equal(submitted.taskVersion, 42);
});

function server(handler) {
  return async (url, options = {}) => {
    if (url === '/api/health') return response({ status: 'UP' });
    if (url === '/api/dictionaries') return response({});
    if (url === '/api/tasks' || url === '/api/collections') return response([]);
    if (url === '/api/auth/csrf') return response({ token: 'csrf' });
    return handler(url, options);
  };
}

test('Потеря ответа и перезагрузка сохраняют точные тело и ключ отправки', async () => {
  const saved = new Map(); const requests = [];
  const fetch = server(async (url, options) => {
    if (url === '/api/auth/me') return response({ id: 'a' });
    if (url === '/api/attempts') {
      const persisted = JSON.parse(saved.get('sa-trainer:v2:a:submission:live')).pending;
      assert.equal(persisted.key, options.headers['Idempotency-Key']);
      assert.equal(JSON.stringify(persisted.body), options.body);
      requests.push(options);
      if (requests.length === 1) throw new TypeError('Ответ потерян после приёма');
      return response({ attemptId: 'same-attempt', taskId: 'live', status: 'in_review' }, 202);
    }
    return response({}, 404);
  });
  let c = browser(fetch, saved); c.load('api.js'); await c.Api.ready;
  const tabs = [{ id: 'doc', type: 'doc', title: 'Решение', content: 'Контракт' }];
  await assert.rejects(c.Api.submitReliable('live', tabs, 8));
  c = browser(fetch, saved); c.load('api.js'); await c.Api.ready;
  assert.equal(requests.length, 1, 'Перезагрузка сама не отправляет POST');
  assert.equal((await c.Api.submitReliable('live', tabs, 8)).attemptId, 'same-attempt');
  assert.equal(requests[0].body, requests[1].body);
  assert.equal(requests[0].headers['Idempotency-Key'], requests[1].headers['Idempotency-Key']);
  assert.equal(c.Store.pendingSubmission('live'), null);
});

test('Изменённый черновик не подменяет запрос с неопределённым исходом', async () => {
  let posts = 0;
  const c = browser(server(async (url) => {
    if (url === '/api/auth/me') return response({ id: 'a' });
    posts++; throw new TypeError('Сеть');
  }));
  c.load('api.js'); await c.Api.ready;
  await assert.rejects(c.Api.submitReliable('live', [], 8));
  const key = c.Store.pendingSubmission('live').key;
  await assert.rejects(c.Api.submitReliable('live', [{ content: 'Новые правки' }], 8),
    e => e.body.error === 'pending_submission_changed');
  assert.equal(posts, 1); assert.equal(c.Store.pendingSubmission('live').key, key);
  c.Store.setUser('b'); assert.equal(c.Store.pendingSubmission('live'), null);
  c.Store.setUser('a'); assert.equal(c.Store.pendingSubmission('live').key, key);
});

test('Две вкладки с Web Locks объединяют одновременные отправки, черновики не стирают ключ', async () => {
  const saved = new Map(); let posts = 0, chain = Promise.resolve();
  const locks = { request(name, send) { const result = chain.then(send); chain = result.catch(() => {}); return result; } };
  const fetch = server(async url => {
    if (url === '/api/auth/me') return response({ id: 'a' });
    posts++; return response({ attemptId: 'one', taskId: 'live', status: 'in_review' }, 202);
  });
  const a = browser(fetch, saved), b = browser(fetch, saved);
  a.navigator.locks = b.navigator.locks = locks;
  a.load('api.js'); b.load('api.js'); await Promise.all([a.Api.ready, b.Api.ready]);
  const [first, second] = await Promise.all([a.Api.submitReliable('live', [], 8), b.Api.submitReliable('live', [], 8)]);
  assert.equal(posts, 1); assert.equal(first.attemptId, second.attemptId);
  a.Store.savePendingSubmission('x', { key: 'x' });
  b.Store.savePendingSubmission('y', { key: 'y' });
  b.Store.saveSolution('live', { tabs: [] });
  a.Store.clearPendingSubmission('x');
  assert.equal(a.Store.pendingSubmission('y').key, 'y');
});

test('Однозначный отказ очищает ключ, временный сбой сохраняет его', async () => {
  let code = 503;
  const c = browser(server(async url => url === '/api/auth/me' ? response({ id: 'a' }) : response({ error: 'solution_too_large' }, code)));
  c.load('api.js'); await c.Api.ready;
  await assert.rejects(c.Api.submitReliable('live', [], 8));
  assert.ok(c.Store.pendingSubmission('live'));
  code = 413;
  await assert.rejects(c.Api.submitReliable('live', [], 8));
  assert.equal(c.Store.pendingSubmission('live'), null);
});

test('Успешный HTTP без корректного идентификатора попытки сохраняет исходный ключ', async () => {
  const c = browser(server(async url => url === '/api/auth/me' ? response({ id: 'a' }) : response({}, 202)));
  c.load('api.js'); await c.Api.ready;
  await assert.rejects(c.Api.submitReliable('live', [], 8));
  assert.ok(c.Store.pendingSubmission('live'));
});

test('Черновики, попытки и диагностика одного аккаунта не видны другому и гостю', () => {
  const c = browser();
  c.Store.setUser('a');
  c.Store.saveSolution('task', { tabs: [{ type: 'doc', content: 'Личное' }] });
  c.Store.addAttempt('task', { id: 'a1' });
  c.Store.saveAssessment({ result: { score: 90 } });
  c.Store.setUser('b');
  assert.equal(c.Store.solution('task'), null);
  assert.equal(c.Store.attempts('task').length, 0);
  assert.equal(c.Store.assessment(), null);
  c.Store.setUser(null);
  assert.equal(c.Store.solution('task'), null);
  c.Store.setUser('a');
  assert.equal(c.Store.solution('task').tabs[0].content, 'Личное');
});

test('Старое общее хранилище не присваивается гостю или новому аккаунту', () => {
  const saved = new Map([['sa-trainer:v1', JSON.stringify({ solutions: { secret: {} } })]]);
  const c = browser(undefined, saved);
  c.Store.setUser(null);
  assert.equal(c.Store.solution('secret'), null);
  c.Store.setUser('b');
  assert.equal(c.Store.solution('secret'), null);
  assert.ok(saved.has('sa-trainer:v1')); // Исходник остаётся для ручного восстановления владельцем.
});

test('Перенос гостевых черновиков не заменяет существующее решение аккаунта', () => {
  const c = browser();
  c.Store.setUser(null);
  c.Store.saveSolution('new', { tabs: [{ content: 'Гостевой' }] });
  c.Store.saveSolution('conflict', { tabs: [{ content: 'Гость' }] });
  c.Store.setUser('a');
  c.Store.saveSolution('conflict', { tabs: [{ content: 'Аккаунт' }] });
  assert.equal(c.Store.importGuestDrafts(), 1);
  assert.equal(c.Store.solution('conflict').tabs[0].content, 'Аккаунт');
  c.Store.setUser(null);
  assert.equal(c.Store.solution('new'), null);
  assert.equal(c.Store.solution('conflict').tabs[0].content, 'Гость');
});

test('Изоляция сохраняется при недоступном localStorage', () => {
  const c = browser();
  c.localStorage.getItem = c.localStorage.setItem = () => { throw new Error('blocked'); };
  c.Store.setUser('a');
  c.Store.saveSolution('t', { tabs: ['a'] });
  c.Store.setUser('b');
  assert.equal(c.Store.solution('t'), null);
  c.Store.setUser('a');
  assert.equal(c.Store.solution('t').tabs[0], 'a');
});

test('Параллельные 401 используют один refresh и повторяют исходные запросы', async () => {
  let expired = false, rotations = 0;
  const c = browser(server(async url => {
    if (url === '/api/auth/me') return response(expired ? {} : { id: 'a' }, expired ? 401 : 200);
    if (url === '/api/auth/refresh') { rotations++; expired = false; return response({ id: 'a' }); }
    return response(expired ? {} : { ok: true }, expired ? 401 : 200);
  }));
  c.load('api.js'); await c.Api.ready;
  expired = true;
  await Promise.all([c.Api.get('/api/private/a'), c.Api.get('/api/private/b')]);
  assert.equal(rotations, 1);
  assert.equal(c.Store.owner(), 'a');
});

test('Переполненный localStorage не теряет черновик при переключении аккаунта', () => {
  const c = browser();
  c.localStorage.setItem = () => { throw new Error('quota'); };
  c.Store.setUser('a');
  c.Store.saveSolution('t', { tabs: ['a'] });
  c.Store.setUser('b');
  assert.equal(c.Store.solution('t'), null);
  c.Store.setUser('a');
  assert.equal(c.Store.solution('t').tabs[0], 'a');
});

test('Повтор после 401 сохраняет тело, ключ идемпотентности и аккаунт', async () => {
  let expired = false;
  const sent = [];
  const c = browser(server(async (url, options) => {
    if (url === '/api/auth/me') return response(expired ? {} : { id: 'a' }, expired ? 401 : 200);
    if (url === '/api/auth/refresh') { expired = false; return response({ id: 'a' }); }
    sent.push(options);
    return response(expired ? {} : { attemptId: 'one' }, expired ? 401 : 200);
  }));
  c.load('api.js'); await c.Api.ready; expired = true;
  await c.Api.submitAttempt('t', [{ content: 'Решение' }], 'same-key');
  assert.equal(sent.length, 2);
  assert.equal(sent[0].body, sent[1].body);
  assert.equal(sent[1].headers['Idempotency-Key'], 'same-key');
  assert.equal(sent[1].headers['X-Account-ID'], 'a');
});

test('Сетевая ошибка отправки не запускает автоматический повтор', async () => {
  let attempts = 0;
  const c = browser(server(async url => {
    if (url === '/api/auth/me') return response({ id: 'a' });
    attempts++; throw new Error('network');
  }));
  c.load('api.js'); await c.Api.ready;
  await assert.rejects(c.Api.submitAttempt('t', [], 'key'));
  assert.equal(attempts, 1);
});

test('Отозванная сессия сохраняет черновик в прежнем аккаунте и не становится демо', async () => {
  let expired = false;
  const c = browser(server(async url => {
    if (url === '/api/auth/me') return response(expired ? {} : { id: 'a' }, expired ? 401 : 200);
    return response({}, 401);
  }));
  c.load('api.js'); await c.Api.ready;
  c.Store.saveSolution('t', { tabs: ['draft'] });
  expired = true;
  await assert.rejects(c.Api.submitAttempt('t', [], 'key'));
  assert.equal(c.Api.user, null);
  assert.equal(c.Api.mode, 'server');
  assert.equal(c.Store.owner(), 'a');
  assert.equal(c.Store.solution('t').tabs[0], 'draft');
});

test('Неверный пароль входа не вызывает refresh', async () => {
  let rotations = 0;
  const c = browser(server(async url => {
    if (url === '/api/auth/me') return response({ id: 'a' });
    if (url === '/api/auth/refresh') rotations++;
    return response({}, 401);
  }));
  c.load('api.js'); await c.Api.ready;
  await assert.rejects(c.Api.login('a@example.com', 'wrong'));
  assert.equal(rotations, 0);
});

test('Смена аккаунта во время refresh запрещает повтор старой мутации', async () => {
  let expired = false, writes = 0;
  const c = browser(server(async url => {
    if (url === '/api/auth/me') return response(expired ? {} : { id: 'a' }, expired ? 401 : 200);
    if (url === '/api/auth/refresh') return response({ id: 'b' });
    writes++; return response({}, 401);
  }));
  c.load('api.js'); await c.Api.ready; expired = true;
  await assert.rejects(c.Api.submitAttempt('t', [], 'key'), { status: 409 });
  assert.equal(writes, 1);
  assert.equal(c.reloaded, true);
});

test('Ошибка каталога и недоступный backend не включают локальный mock', async () => {
  const c = browser(async url => {
    if (url === '/api/health') return response({ status: 'UP' });
    if (url === '/api/auth/me') return response({ id: 'a' });
    return response({}, 500);
  });
  c.load('api.js'); await c.Api.ready;
  assert.equal(c.Api.mode, 'server');
  const down = browser(async () => { throw new Error('offline'); });
  down.load('api.js'); await down.Api.ready;
  assert.equal(down.Api.mode, 'unavailable');
});

test('Политика пароля учитывает байты кириллицы', async () => {
  const c = browser(server(async () => response({ id: 'a' })));
  c.load('api.js'); await c.Api.ready;
  assert.equal(c.Api.validPassword('short'), false);
  assert.equal(c.Api.validPassword('я'.repeat(36)), true);
  assert.equal(c.Api.validPassword('я'.repeat(37)), false);
});
