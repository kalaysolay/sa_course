/* Проверяем выключенный счётчик и отсутствие персональных данных без обращения к Метрике. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

async function setup(metrikaId) {
  const scripts = [];
  const calls = [];
  const c = { URL, URLSearchParams, Set, Number, Date,
    location: { origin: 'https://analystgym.pro', pathname: '/task.html',
      search: '?id=db-slow-report&utm_source=telegram&token=SECRET&email=test@example.com', hash: '#SECRET' },
    document: { referrer: 'https://example.org/private?email=SECRET',
      createElement: () => ({}), head: { appendChild: el => scripts.push(el) } },
    fetch: async () => ({ ok: true, json: async () => ({ metrikaId }) }),
    ym: (...args) => calls.push(args)
  };
  c.window = c;
  vm.createContext(c);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../assets/js/analytics.js'), 'utf8'), c);
  c.AppAnalytics.goal('waitlist_success_pro');
  c.AppAnalytics.goal('test@example.com');
  await new Promise(resolve => setImmediate(resolve));
  return { c, scripts, calls };
}

test('Без ID и при некорректном ID внешние скрипты и события не отправляются', async () => {
  for (const id of ['', 'not-a-counter']) {
    const { c, scripts, calls } = await setup(id);
    c.AppAnalytics.goal('review_open');
    assert.equal(scripts.length, 0);
    assert.equal(calls.length, 0);
  }
});

test('Счётчик получает разрешённые цели и очищенный URL, без секретов и контактов', async () => {
  const { c, scripts, calls } = await setup('123456');
  c.AppAnalytics.goal('solution_submitted');
  assert.equal(scripts.length, 1);
  assert.equal(scripts[0].src, 'https://mc.yandex.ru/metrika/tag.js');
  const init = calls.find(call => call[1] === 'init')[2];
  assert.equal(init.webvisor, false);
  assert.equal(init.trackLinks, false);
  assert.equal(init.defer, true);
  const hit = calls.find(call => call[1] === 'hit');
  assert.equal(hit[2], 'https://analystgym.pro/task.html?id=db-slow-report&utm_source=telegram');
  assert.equal(hit[3].referer, 'https://example.org');
  assert(calls.some(call => call[2] === 'waitlist_success_pro'));
  assert(calls.some(call => call[2] === 'solution_submitted'));
  assert.doesNotMatch(JSON.stringify(calls), /SECRET|test@example/);
  // Сбой внешней библиотеки после инициализации не прерывает отправку решения.
  c.ym = () => { throw new Error('blocked'); };
  assert.doesNotThrow(() => c.AppAnalytics.goal('solution_submitted'));
});
