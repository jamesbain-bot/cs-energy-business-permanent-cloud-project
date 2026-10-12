// Synthetic customer records only. No login, customer data or provider requests.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const start = html.indexOf('function renderCustomerPortalHome(rec){');
const end = html.indexOf('function updateCustomerServicePrice()', start);
assert.ok(start >= 0 && end > start, 'Customer renderer exists');
const renderer = html.slice(start, end);

function portal() {
  const home = { innerHTML: '' };
  const context = vm.createContext({
    document: { getElementById: () => home, addEventListener() {} },
    setTimeout() {},
    esc: value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]),
    hasCarePlan: () => false,
    eur: value => `€${value}`,
    prettyDate: value => value || '—',
    statusClass: () => '',
  });
  context.window = context;
  vm.runInContext(renderer, context);
  vm.runInContext(fs.readFileSync(path.join(root, 'customer-quote-stage-workflow-v1.js'), 'utf8'), context);
  return rec => { context.renderCustomerPortalHome(rec); return home.innerHTML; };
}

function record(systems, portalStage = 'full') {
  return { payload: { customer: { name: 'Test Customer' }, systems, portalStage, pricing: {} } };
}

for (const system of [
  { inverter: 'GoodWe GW5000-EH' },
  { inverter: 'GOODWE hybrid' },
  { inverter: 'Good-We hybrid' },
  { monitorPlatform: 'SEMS Portal' },
  { monitoring: 'GoodWe SEMS+' },
]) {
  test(`shows official SEMS+ link for ${JSON.stringify(system)}`, () => {
    const result = portal()(record([system]));
    assert.match(result, /href="https:\/\/eu-semsplus\.goodwe\.com\/" target="_blank" rel="noopener noreferrer"/);
    assert.match(result, /Open GoodWe SEMS\+/);
    assert.match(result, /Sign in with your GoodWe account/);
    assert.match(result, /Opens in a new tab/);
    assert.equal((result.match(/class="mini customer-goodwe-link"/g) || []).length, 1);
  });
}

test('detects a GoodWe system beyond the first system', () => {
  assert.match(portal()(record([{ inverter: 'Fronius Primo' }, { inverter: 'GoodWe ET' }])), /customer-goodwe-link/);
});

test('does not label other brands or missing system records as GoodWe', () => {
  for (const systems of [[], [{}], [{ inverter: 'Fronius Primo', monitoring: 'Solar.web' }], [{ inverter: 'Solis', notes: 'Customer asked about GoodWe SEMS' }]]) {
    assert.doesNotMatch(portal()(record(systems)), /customer-goodwe-link/);
  }
});

test('preserves quote-only access and default quote stage', () => {
  const render = portal();
  assert.doesNotMatch(render(record([{ inverter: 'GoodWe ET' }], 'quote')), /customer-goodwe-link/);
  const missingStage = record([{ inverter: 'GoodWe ET' }]);
  delete missingStage.payload.portalStage;
  assert.doesNotMatch(render(missingStage), /customer-goodwe-link/);
});

test('rerenders without duplication or leaking a previous customer link', () => {
  const render = portal();
  const rec = record([{ inverter: 'GoodWe ET' }]);
  render(rec);
  assert.equal((render(rec).match(/class="mini customer-goodwe-link"/g) || []).length, 1);
  assert.doesNotMatch(render(record([{ inverter: 'Fronius Primo' }])), /customer-goodwe-link/);
  assert.match(render(rec), /customer-goodwe-link/);
});

test('does not mutate customer snapshots or include customer data in link', () => {
  const rec = record([{ inverter: 'GoodWe ET', serial: 'PRIVATE-SERIAL' }]);
  rec.payload.customer.email = 'private@example.test';
  const before = JSON.stringify(rec);
  const result = portal()(rec);
  assert.equal(JSON.stringify(rec), before);
  const anchor = result.match(/<a class="mini customer-goodwe-link"[^>]+>/)[0];
  assert.doesNotMatch(anchor, /PRIVATE-SERIAL|private@example|\?/);
});

test('escapes customer equipment text while preserving the fixed external link', () => {
  const result = portal()(record([{ inverter: 'GoodWe <img src=x onerror=alert(1)>' }]));
  assert.doesNotMatch(result, /<img/);
  assert.match(result, /GoodWe &lt;img/);
  assert.match(result, /href="https:\/\/eu-semsplus\.goodwe\.com\/"/);
});

test('all inline scripts remain valid JavaScript', () => {
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (!/\bsrc\s*=/.test(match[1]) && match[2].trim()) new vm.Script(match[2]);
  }
});
