/* Проверяем доставку и повтор заявки без сети, БД и отправки реальных контактов. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function setup(saved = new Map()) {
  const requests = [];
  const inputs = {
    '#wlEmail': { value: 'test@example.invalid', focus() {} },
    '#wlPhone': { value: '+77011234567', focus() {}, addEventListener() {} },
    '[data-role="status"]': { textContent: '' },
    '[data-role="send"]': { disabled: false, addEventListener(_, fn) { this.send = fn; } }
  };
  const host = { innerHTML: '', querySelector: key => inputs[key] };
  const c = { TypeError, setTimeout: fn => fn(),
    localStorage: { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) },
    Api: { post: async (url, payload) => { requests.push(payload); if (c.failure) throw c.failure; return {}; } },
    AppUI: { toast() {}, modal: opts => { c.modal = opts; host.innerHTML = opts.html; return { body: host }; } }
  };
  c.window = c;
  vm.createContext(c);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../assets/js/waitlist.js'), 'utf8'), c);
  return { c, inputs, host, saved, requests, send: () => inputs['[data-role="send"]'].send() };
}

test('Сетевой сбой оставляет черновик и форму, повтор подтверждается только сервером', async () => {
  const { c, inputs, host, saved, send, requests } = setup();
  c.Waitlist.open('team');
  assert.equal(c.modal.title, 'Обсудить Team');
  c.failure = new TypeError('Failed to fetch');
  await send();
  assert.match(inputs['[data-role="status"]'].textContent, /Доставка заявки не подтверждена/);
  assert.match(host.innerHTML, /wlEmail/);
  assert.equal(inputs['[data-role="send"]'].disabled, false);
  assert.equal(JSON.parse(saved.get('ag_waitlist'))[0].source, 'team');
  c.failure = null;
  await send();
  assert.match(host.innerHTML, /Запрос на Team сохранён на сервере/);
  assert.equal(requests[1].source, 'team');
  assert.deepEqual(JSON.parse(saved.get('ag_waitlist')), []);
});

test('Кабинет не объявляет успех при сбое localStorage; повтор остаётся доступен', async () => {
  const { c, inputs, host, send } = setup();
  c.localStorage.setItem = () => { throw new Error('storage full'); };
  c.failure = new TypeError('Failed to fetch');
  c.Waitlist.renderInline(host, 'account');
  await send();
  assert.match(inputs['[data-role="status"]'].textContent, /черновик не сохранён/);
  assert.equal(inputs['[data-role="send"]'].disabled, false);
  assert.match(host.innerHTML, /wlEmail/);
});

test('409 подтверждает существующую почту, а не новый Team-запрос; HTTP-сбой сохраняет поля', async () => {
  const { c, host, inputs, send } = setup();
  c.Waitlist.open('team');
  c.failure = { status: 500 };
  await send();
  assert.match(inputs['[data-role="status"]'].textContent, /Отправка не подтверждена/);
  c.failure = { status: 409 };
  await send();
  assert.match(host.innerHTML, /Новая запись не создана/);
  assert.doesNotMatch(host.innerHTML, /Запрос на Team сохранён/);
});

test('Черновик восстанавливает контакты и Team-контекст после открытия формы', () => {
  const saved = new Map([['ag_waitlist', JSON.stringify([{ email: 'draft@example.invalid', phone: '+77011234567', source: 'team' }])]]);
  const { c, inputs } = setup(saved);
  c.Waitlist.open('team');
  assert.equal(inputs['#wlEmail'].value, 'draft@example.invalid');
  assert.match(inputs['[data-role="status"]'].textContent, /Доставка заявки не подтверждена/);
});

test('Телефон +7 проходит, иностранный код и лишние цифры не подменяются маской', () => {
  const { c } = setup();
  assert.equal(c.Waitlist.normalizePhone('+7 (701) 123-45-67'), '+77011234567');
  assert.equal(c.Waitlist.normalizePhone('8 (916) 123-45-67'), '+79161234567');
  // Последняя цифра вводится в уже отформатированный номер: код не дублируется.
  assert.equal(c.Waitlist.formatPhone('+7 (701) 123-45-6'), '+7 (701) 123-45-6');
  assert.equal(c.Waitlist.formatPhone('+7 (701) 123-45-67'), '+7 (701) 123-45-67');
  for (const phone of ['+380501234567', '+1234567890', '+791612345678']) {
    assert.equal(c.Waitlist.formatPhone(phone), phone);
    assert.equal(c.Waitlist.normalizePhone(phone), null);
  }
});
