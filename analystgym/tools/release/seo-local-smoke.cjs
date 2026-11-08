/* Проверка настоящего JAR на временной БД; production и реальные заявки не затрагиваются. */
const { execFileSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { randomBytes } = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const output = path.join(root, 'backend/app/build/seo-smoke');
fs.mkdirSync(output, { recursive: true });
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function freePort() {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

(async () => {
  const db = 'analystgym-seo-' + randomBytes(5).toString('hex');
  const password = randomBytes(24).toString('hex');
  let created = false;
  let app;
  const log = fs.openSync(path.join(output, 'app.log'), 'w');
  try {
    docker('run', '-d', '--name', db, '-p', '127.0.0.1::5432', '-e', 'POSTGRES_DB=analystgym',
      '-e', 'POSTGRES_USER=analystgym', '-e', 'POSTGRES_PASSWORD=' + password, 'postgres:16-alpine');
    created = true;
    const dbPort = docker('port', db, '5432/tcp').split(':').pop();
    const port = await freePort();
    app = spawn('java', ['-jar', path.join(root, 'backend/app/build/libs/app-0.1.0.jar'), '--server.port=' + port], {
      windowsHide: true, stdio: ['ignore', log, log],
      env: { ...process.env, APP_DB_URL: 'jdbc:postgresql://127.0.0.1:' + dbPort + '/analystgym',
        APP_DB_USER: 'analystgym', APP_DB_PASSWORD: password, APP_SITE_BASE_URL: 'https://analystgym.pro',
        APP_JWT_SECRET: randomBytes(48).toString('hex'), APP_GOOGLE_ENABLED: 'false', APP_MAIL_ENABLED: 'false',
        REVIEW_ENGINE: 'mock', REVIEW_QUEUE_ENABLED: 'false', QUALITY_RECHECK_ENABLED: 'false',
        BILLING_FAKE_ENABLED: 'false', ANALYTICS_METRIKA_ID: '' }
    });
    let spawnError;
    app.on('error', error => { spawnError = error; });
    const base = 'http://127.0.0.1:' + port;
    let ready = false;
    for (let i = 0; i < 120; i++) {
      if (spawnError) throw spawnError;
      if (app.exitCode !== null) throw new Error('JAR exited; see ' + output);
      try { if ((await fetch(base + '/actuator/health')).ok) { ready = true; break; } } catch (_) {}
      await pause(1000);
    }
    assert(ready, 'JAR startup timeout');
    const tasks = await (await fetch(base + '/api/tasks')).json();
    assert(tasks.length > 0);
    const id = tasks[0].id;
    for (const route of ['/robots.txt', '/sitemap.xml', '/', '/practice.html', '/catalog.html', '/task.html?id=' + encodeURIComponent(id)]) {
      const response = await fetch(base + route);
      assert.equal(response.status, 200, route);
      const body = await response.text();
      if (route.includes('task.html')) {
        assert(body.includes('<h1>'), 'SSR heading');
        assert(body.includes('LearningResource'), 'JSON-LD');
        fs.writeFileSync(path.join(output, 'task.html'), body);
      }
      if (route === '/sitemap.xml') assert(body.includes('https://analystgym.pro/task.html?id='), 'production canonical origin');
    }
    assert.equal((await fetch(base + '/task.html?id=missing')).status, 404);
    assert.equal((await fetch(base + '/account.html')).headers.get('x-robots-tag'), 'noindex, nofollow');
    if (process.argv.includes('--screenshots')) {
      const edge = process.env.EDGE_BINARY || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
      for (const [name, route] of [['task', '/task.html?id=' + encodeURIComponent(id)], ['catalog', '/catalog.html']]) {
        execFileSync(edge, ['--headless', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
          '--user-data-dir=' + path.join(output, 'edge-' + name + '-' + randomBytes(4).toString('hex')), '--window-size=1440,1100', '--virtual-time-budget=12000',
          '--screenshot=' + path.join(output, name + '.png'), base + route], { windowsHide: true, timeout: 60000, stdio: 'ignore' });
        assert(fs.existsSync(path.join(output, name + '.png')), 'Edge did not produce ' + name + '.png');
      }
    }
    console.log('SEO smoke OK: public discovery, SSR, canonical origin, 404 and noindex; screenshots: ' + process.argv.includes('--screenshots'));
  } finally {
    if (app && app.exitCode === null) {
      app.kill();
      await Promise.race([new Promise(resolve => app.once('exit', resolve)), pause(5000)]);
    }
    fs.closeSync(log);
    if (created) docker('rm', '-f', db);
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
