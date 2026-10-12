'use strict';
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const handler = require('../api/quote-draft');
const { LIMITS, productPrice, prepareCatalog, hydrateDraft, validateRequest } = require('../lib/quote-draft');
const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const originalFetch = global.fetch;
const originalEnv = { OPENAI_API_KEY: process.env.OPENAI_API_KEY, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY, ASSISTANT_MODEL: process.env.ASSISTANT_MODEL };
let state, calls, aiBody, allowed, providerStatus, providerError;
const good = body => new Response(JSON.stringify(body));
const proposal = (extra = {}) => ({ title: 'Proposed solar installation', scope: 'Subject to site survey.', lines: [{ productId: 'p1', qty: 12 }, { productId: 'p2', qty: 1 }], warnings: [], missingItems: ['Labour and mounting to be confirmed.'], ...extra });
const modelResponse = draft => ({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(draft) }] }] });
beforeEach(() => {
  Object.assign(process.env, { OPENAI_API_KEY: 'test-ai-key', SUPABASE_SERVICE_ROLE_KEY: 'test-db-key', ASSISTANT_MODEL: 'gpt-4.1-mini' });
  state = { customers: [{ id: 'c1', name: 'PRIVATE-NAME', phone: 'PRIVATE-PHONE', address: 'PRIVATE-ADDRESS', email: 'PRIVATE-EMAIL' }], products: [
    { id: 'p1', manufacturer: 'Solar', model: 'Panel 450 W', category: 'Panel', cost: 80, sell: 100, pricingMethod: 'fixed', notes: 'PRIVATE-NOTES', supplierUrl: 'PRIVATE-URL' },
    { id: 'p2', manufacturer: 'Solar', model: 'Inverter', category: 'Inverter', cost: '1000', markup: '25', pricingMethod: 'markup' }
  ], settings: { secret: 'PRIVATE-SETTINGS' }, quotes: [] };
  calls = []; aiBody = modelResponse(proposal()); allowed = true; providerStatus = 200; providerError = null;
  global.fetch = async (input, options = {}) => {
    const url = new URL(input); calls.push({ url, options });
    if (url.pathname === '/auth/v1/user') return options.headers.Authorization === 'Bearer owner' ? good({ id: OWNER }) : options.headers.Authorization === 'Bearer other' ? good({ id: OTHER }) : new Response('{}', { status: 401 });
    if (url.pathname.endsWith('/cs_energy_assistant_access')) return good(url.searchParams.get('user_id') === 'eq.' + OWNER ? [{ user_id: OWNER, enabled: true }] : []);
    if (url.pathname.endsWith('/rpc/cs_energy_assistant_rate')) return good(allowed);
    if (url.pathname.endsWith('/cs_energy_app_state')) { assert.equal(url.searchParams.get('user_id'), 'eq.' + OWNER); return good([{ data: state, updated_at: '2026-10-09T09:00:00Z' }]); }
    if (url.hostname === 'api.openai.com') { if (providerError) throw providerError; return new Response(JSON.stringify(aiBody), { status: providerStatus }); }
    assert.fail('Unexpected request: ' + url.href);
  };
});
afterEach(() => {
  global.fetch = originalFetch;
  for (const [key, value] of Object.entries(originalEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
});
async function api(body = { customerId: 'c1', prompt: 'A 5 kW solar system', capacityKw: 5 }, { token = 'owner', method = 'POST', headers = {} } = {}) {
  const req = Readable.from([Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))]);
  req.method = method; req.headers = { authorization: token ? 'Bearer ' + token : '', 'content-type': 'application/json', ...headers };
  const result = { headers: {} };
  const res = { setHeader(key, value) { result.headers[key] = value; }, status(value) { result.status = value; return this; }, json(value) { result.body = value; return this; } };
  await handler(req, res); return result;
}
test('only an authenticated enabled owner can draft, and only via JSON POST', async () => {
  assert.equal((await api(undefined, { token: '' })).status, 401);
  assert.equal((await api(undefined, { token: 'other' })).status, 403);
  assert.equal((await api(undefined, { token: 'invalid' })).status, 401);
  const wrongMethod = await api(undefined, { method: 'GET' });
  assert.equal(wrongMethod.status, 405); assert.equal(wrongMethod.headers.Allow, 'POST');
  assert.equal((await api(undefined, { headers: { 'content-type': 'application/jsonp' } })).status, 415);
  assert.equal(calls.some(call => call.url.hostname === 'api.openai.com'), false);
});
test('hydrates saved prices, adds survey warning, isolates owner and sends no customer data or prices', async () => {
  const before = JSON.stringify(state), result = await api();
  assert.equal(result.status, 200);
  assert.equal(result.headers['Cache-Control'], 'no-store');
  assert.deepEqual(result.body.lines, [
    { productId: 'p1', qty: 12, cost: 80, sell: 100, description: 'Solar Panel 450 W' },
    { productId: 'p2', qty: 1, cost: 1000, sell: 1250, description: 'Solar Inverter' }
  ]);
  assert.equal(result.body.customerId, 'c1');
  assert.equal(result.body.savedAt, '2026-10-09T09:00:00Z');
  assert.match(result.body.warnings[0], /site survey/);
  const aiCall = calls.find(call => call.url.hostname === 'api.openai.com');
  const request = JSON.parse(aiCall.options.body), input = JSON.parse(request.input[0].content);
  assert.equal(request.store, false); assert.equal(request.model, 'gpt-4.1-mini');
  assert.equal(request.text.format.strict, true); assert.equal(request.tools, undefined);
  assert.equal(aiCall.options.signal instanceof AbortSignal, true);
  assert.equal(aiCall.options.body.includes('PRIVATE-'), false);
  assert.equal(input.customerId, undefined); assert.equal(input.catalog[0].cost, undefined); assert.equal(input.catalog[0].sell, undefined);
  assert.equal(JSON.stringify(state), before);
  assert.deepEqual(calls.filter(call => call.options.method && call.options.method !== 'GET').map(call => call.url.pathname), ['/rest/v1/rpc/cs_energy_assistant_rate', '/v1/responses']);
});
test('validates strict input shape, capacities and bounds before model calls', async () => {
  for (const body of [null, [], {}, { customerId: 'c1', prompt: '' }, { customerId: 'c1', prompt: 'x', products: [] }, { customerId: 'c1', prompt: 'x'.repeat(4001) }, ...[0, -1, '5', false, 10001].map(capacityKw => ({ customerId: 'c1', prompt: 'x', capacityKw }))]) assert.equal((await api(body)).status, 400);
  assert.equal((await api('{')).status, 400);
  assert.equal((await api(' '.repeat(LIMITS.body + 1))).status, 413);
  assert.equal((await api(undefined, { headers: { 'content-length': String(LIMITS.body + 1) } })).status, 413);
  assert.throws(() => validateRequest({ customerId: 'c1', prompt: 'x', capacityKw: NaN }));
  assert.equal(calls.some(call => call.url.hostname === 'api.openai.com'), false);
});
test('rejects a customer absent from owner snapshot and rate-limited requests', async () => {
  assert.equal((await api({ customerId: 'foreign', prompt: 'Solar' })).status, 400);
  allowed = false; assert.equal((await api()).status, 429);
  assert.equal(calls.some(call => call.url.hostname === 'api.openai.com'), false);
});
test('missing provider configuration fails safely', async () => {
  delete process.env.OPENAI_API_KEY;
  assert.equal((await api()).status, 503);
  assert.equal(calls.some(call => call.url.hostname === 'api.openai.com'), false);
});
test('pricing formula preserves explicit zero and rejects missing, malformed and negative prices', () => {
  assert.deepEqual(productPrice({ cost: 10, sell: 0 }), { cost: 10, sell: 0 });
  assert.deepEqual(productPrice({ cost: 10, markup: 0, pricingMethod: 'markup' }), { cost: 10, sell: 10 });
  assert.deepEqual(productPrice({ cost: '10.50', markup: '12.5', pricingMethod: 'markup' }), { cost: 10.5, sell: 11.8125 });
  for (const bad of [null, undefined, '', ' ', -1, 'nope', true, [], {}, Infinity, NaN]) {
    assert.equal(productPrice({ cost: bad, sell: 20 }), null);
    assert.equal(productPrice({ cost: 10, sell: bad }), null);
    assert.equal(productPrice({ cost: 10, markup: bad, pricingMethod: 'markup' }), null);
  }
  assert.equal(productPrice({ cost: 10, sell: 20, pricingMethod: 'other' }), null);
});
test('invalid catalogue pricing cannot be selected and exclusions are explained', async () => {
  state.products.push({ id: 'bad', model: 'Bad panel', cost: 10 });
  let result = await api(); assert.equal(result.status, 200); assert.match(result.body.warnings.at(-1), /1 saved product/);
  aiBody = modelResponse(proposal({ lines: [{ productId: 'bad', qty: 1 }] }));
  assert.equal((await api()).status, 502);
  state.products = [state.products[2]]; assert.equal((await api()).status, 409);
});
test('catalogue limits and duplicate IDs are rejected', () => {
  assert.throws(() => prepareCatalog([]));
  assert.throws(() => prepareCatalog(Array(301).fill(state.products[0])));
  assert.throws(() => prepareCatalog([state.products[0], state.products[0]]));
  assert.throws(() => prepareCatalog([{ ...state.products[0], model: 'x'.repeat(201) }]));
});
test('unknown products, added pricing, duplicate lines and invalid quantities fail closed', async () => {
  for (const lines of [[{ productId: 'invented', qty: 1 }], [{ productId: 'p1', qty: 1, sell: 1 }], [{ productId: 'p1', qty: 1 }, { productId: 'p1', qty: 2 }], ...[0, -1, 1.5, '2', null, 10001].map(qty => [{ productId: 'p1', qty }])]) {
    aiBody = modelResponse(proposal({ lines })); assert.equal((await api()).status, 502);
  }
  const { prices } = prepareCatalog(state.products);
  assert.throws(() => hydrateDraft(proposal({ sell: 99 }), prices));
  assert.throws(() => hydrateDraft(proposal({ warnings: Array(21).fill('warning') }), prices));
  assert.throws(() => hydrateDraft(proposal({ scope: 'x'.repeat(4001) }), prices));
});
test('empty recommendations remain explicit unsaved drafts with missing-item warnings', async () => {
  aiBody = modelResponse(proposal({ lines: [] }));
  const result = await api(); assert.equal(result.status, 200); assert.deepEqual(result.body.lines, []);
  assert.match(result.body.warnings.at(-1), /No priced products/);
});
test('incomplete responses, refusals, invalid JSON and oversized provider output are rejected', async () => {
  for (const value of [{ ...modelResponse(proposal()), status: 'incomplete' }, {}, { status: 'completed', output: [] }, modelResponse('not-an-object'), modelResponse(proposal({ scope: 'x'.repeat(70000) }))]) {
    aiBody = value; assert.equal((await api()).status, 502);
  }
  aiBody = { status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'No' }] }] };
  assert.equal((await api()).status, 422);
  aiBody = { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '{' }] }] };
  assert.equal((await api()).status, 502);
});
test('provider failure and timeout are bounded and do not leak provider messages', async () => {
  providerStatus = 429; aiBody = { error: 'SECRET-PROVIDER-ERROR' };
  let result = await api(); assert.equal(result.status, 502); assert.equal(JSON.stringify(result).includes('SECRET'), false);
  providerStatus = 200; providerError = new DOMException('SECRET', 'TimeoutError');
  result = await api(); assert.equal(result.status, 504); assert.equal(JSON.stringify(result).includes('SECRET'), false);
});
