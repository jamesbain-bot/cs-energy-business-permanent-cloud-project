'use strict';
const crypto = require('node:crypto');

const SUPABASE_URL = 'https://xhbftdpbowqpfnvsvybt.supabase.co';
const PUBLIC_KEY = 'sb_publishable_cEsokxhFCIbvq4YUl5SoEQ_KsGSfeXt';
const TABLE = 'cs_energy_assistant_';
class AppError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
const fail = (message, status) => { throw new AppError(message, status); };
const eq = value => `eq.${encodeURIComponent(value)}`;
const now = () => new Date().toISOString();
const uuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value || '');
const clean = (value, max = 2000) => String(value || '').replace(/\u0000/g, '').slice(0, max);
const normalise = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
function phone(value) {
  let digits = String(value || '').replace(/[\s().-]/g, '');
  if (digits.startsWith('00')) digits = '+' + digits.slice(2);
  if (/^[6789]\d{8}$/.test(digits)) digits = '+34' + digits;
  if (/^[1-9]\d{9,14}$/.test(digits)) digits = '+' + digits;
  if (!/^\+[1-9]\d{7,14}$/.test(digits)) fail('Use an international phone number, such as +34…');
  return digits;
}
function equalSecret(a, b) {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length > 0 && x.length === y.length && crypto.timingSafeEqual(x, y);
}
function pinHash(pin, salt = crypto.randomBytes(16).toString('hex')) {
  if (!/^\d{6,10}$/.test(pin)) fail('Choose a PIN with 6 to 10 digits.');
  return `${salt}:${crypto.scryptSync(pin, salt, 32).toString('hex')}`;
}
function verifyPin(pin, hash) {
  if (!/^\d{6,10}$/.test(pin || '') || !/^[a-f0-9]{32}:[a-f0-9]{64}$/.test(hash || '')) return false;
  return equalSecret(pinHash(pin, hash.split(':')[0]), hash);
}
async function requestJson(url, options = {}, timeout = 10000) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(timeout) });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}
async function db(path, options = {}) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) fail('Assistant storage is not configured.', 503);
  const { response, body } = await requestJson(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json',
      Prefer: 'return=representation', ...options.headers },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {})
  });
  if (!response.ok) {
    // Never return database contents, credentials, or raw provider errors to callers.
    console.error('assistant database', response.status, body.code || 'unknown');
    fail('Assistant storage could not complete the request.', 503);
  }
  return body;
}
const rows = (table, query, options) => db(`${TABLE}${table}?${query}`, options);
async function access(owner) {
  if (!uuid(owner)) fail('Assistant access is not enabled for this account.', 403);
  const records = await rows('access', `user_id=${eq(owner)}&enabled=eq.true&limit=1`);
  if (!records[0]) fail('Assistant access is not enabled for this account.', 403);
  return records[0];
}
async function authenticate(req) {
  const authorization = req.headers.authorization || '';
  if (!/^Bearer \S+$/.test(authorization)) fail('Please sign in to CS Energy.', 401);
  const { response, body } = await requestJson(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: authorization, apikey: PUBLIC_KEY }
  });
  if (!response.ok || !uuid(body.id) || body.is_anonymous) fail('Please sign in again.', 401);
  return access(body.id);
}
async function snapshot(owner) {
  const records = await db(`cs_energy_app_state?user_id=${eq(owner)}&select=data,updated_at&limit=1`);
  if (!records[0]) fail('No saved business records were found for this account.', 404);
  return records[0];
}
function customer(data, id) {
  const record = (data.customers || []).find(item => item.id === id);
  if (!record) fail('That customer is not in this account. Search for the customer again.');
  return record;
}
function pick(record, keys) {
  return Object.fromEntries(keys.filter(key => record[key] != null).map(key => [key, clean(record[key], 1500)]));
}
function customerSummary(c) { return pick(c, ['id', 'name', 'location', 'address', 'phone', 'email', 'plan', 'nextService']); }
function integrationStatus() {
  const has = (...keys) => keys.every(key => !!process.env[key]);
  return {
    ai: has('OPENAI_API_KEY'), email: has('RESEND_API_KEY'),
    calendar: has('GOOGLE_SERVICE_ACCOUNT_JSON', 'GOOGLE_CALENDAR_ID'),
    whatsapp: has('WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_APP_SECRET', 'WHATSAPP_VERIFY_TOKEN', 'WHATSAPP_OWNER_USER_ID', 'WHATSAPP_GRAPH_VERSION'),
    phone: has('TWILIO_AUTH_TOKEN', 'TWILIO_ACCOUNT_SID', 'TWILIO_PHONE_NUMBER', 'ASSISTANT_PUBLIC_URL'),
    phoneNumber: process.env.TWILIO_PHONE_NUMBER || null,
    automaticReplies: false
  };
}
async function newSession(owner, channel = 'web', providerId = null) {
  const result = await rows('sessions', '', { method: 'POST', body: {
    owner_user_id: owner, channel, provider_id: providerId,
    expires_at: new Date(Date.now() + (channel === 'phone' ? 3600000 : 86400000)).toISOString()
  } });
  return result[0];
}
async function session(owner, id, channel = 'web') {
  if (!uuid(id)) fail('Start a new conversation.', 400);
  const result = await rows('sessions', `id=${eq(id)}&owner_user_id=${eq(owner)}&channel=${eq(channel)}&expires_at=gt.${now()}&limit=1`);
  if (!result[0]) fail('This conversation has expired. Start a new one.', 404);
  return result[0];
}
async function lockSession(s) {
  const token = crypto.randomUUID();
  const result = await rows('sessions', `id=${eq(s.id)}&owner_user_id=${eq(s.owner_user_id)}&or=(lock_until.is.null,lock_until.lt.${now()})`, {
    method: 'PATCH', body: { lock_token: token, lock_until: new Date(Date.now() + 90000).toISOString() }
  });
  if (!result[0]) fail('The assistant is still handling your previous request.', 409);
  return { ...result[0], lock_token: token };
}
async function saveSession(s, updates) {
  const result = await rows('sessions', `id=${eq(s.id)}&owner_user_id=${eq(s.owner_user_id)}&lock_token=${eq(s.lock_token)}`, {
    method: 'PATCH', body: { ...updates, lock_until: null, lock_token: null }
  });
  if (!result[0]) fail('Conversation changed. Please start a new request.', 409);
}
module.exports = { AppError, fail, eq, now, uuid, clean, normalise, phone, equalSecret, pinHash, verifyPin,
  requestJson, db, rows, access, authenticate, snapshot, customer, pick, customerSummary, integrationStatus,
  newSession, session, lockSession, saveSession };
