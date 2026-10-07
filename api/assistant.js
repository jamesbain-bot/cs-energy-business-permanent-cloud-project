const { authenticate, rows, eq, fail, phone, pinHash, integrationStatus, newSession, session, now, AppError } = require('../lib/assistant/core');
const { chat, approve, cancel, rateLimit } = require('../lib/assistant/agent');
const { voice } = require('../lib/assistant/voice');
const { webhook } = require('../lib/assistant/whatsapp');

async function readBody(req) {
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 256 * 1024) fail('Request is too large.', 413);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    const query = new URL(req.url, 'https://local.invalid').searchParams;
    const mode = query.get('mode') || 'status';
    if (!['GET', 'POST'].includes(req.method)) fail('Method not allowed.', 405);
    if (mode === 'whatsapp') {
      const result = await webhook(req, req.method === 'POST' ? await readBody(req) : Buffer.alloc(0), query);
      return result.text !== undefined ? res.status(200).send(result.text) : res.status(200).json(result.json);
    }
    if (mode === 'voice') {
      if (req.method !== 'POST') fail('Method not allowed.', 405);
      if (!(req.headers['content-type'] || '').startsWith('application/x-www-form-urlencoded')) fail('Expected a phone form.', 415);
      const raw = await readBody(req), form = new URLSearchParams(raw.toString('utf8'));
      if (new Set(form.keys()).size !== [...form.keys()].length) fail('Duplicate phone fields.');
      const result = await voice(req, Object.fromEntries(form), query);
      res.setHeader('Content-Type', 'text/xml; charset=utf-8');
      return res.status(200).send(result);
    }
    const account = await authenticate(req), owner = account.user_id;
    if (req.method === 'GET') {
      if (mode !== 'status') fail('Method not allowed.', 405);
      const actions = await rows('actions', `owner_user_id=${eq(owner)}&order=created_at.desc&limit=20`);
      return res.status(200).json({ integrations: integrationStatus(), phone: account.phone_e164 || '', hasPin: !!account.pin_hash, actions });
    }
    if (!(req.headers['content-type'] || '').startsWith('application/json')) fail('Expected JSON.', 415);
    const raw = await readBody(req); let body;
    try { body = JSON.parse(raw.toString('utf8')); } catch { fail('Invalid JSON.'); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) fail('Invalid request.');
    if (mode === 'chat') {
      // Session creation itself is rate limited, so empty requests cannot create unbounded rows.
      if (typeof body.message !== 'string' || !body.message.trim() || body.message.length > 2000) fail('Please enter a message of up to 2,000 characters.');
      if (!body.session_id) await rateLimit(owner);
      const s = body.session_id ? await session(owner, body.session_id) : await newSession(owner);
      return res.status(200).json(await chat(owner, s, body.message));
    }
    if (mode === 'approve') {
      if (body.confirmed !== true) fail('Please confirm the displayed recipient and message.');
      return res.status(200).json({ action: await approve(owner, body.action_id) });
    }
    if (mode === 'cancel') return res.status(200).json({ action: await cancel(owner, body.action_id) });
    if (mode === 'phone-settings') {
      const number = phone(body.phone), updates = { phone_e164: number };
      if (body.pin) updates.pin_hash = pinHash(String(body.pin));
      if (!account.pin_hash && !updates.pin_hash) fail('Set a personal PIN before enabling phone access.');
      await rows('access', `user_id=${eq(owner)}`, { method: 'PATCH', body: updates });
      // Changing phone credentials invalidates existing calls.
      await rows('sessions', `owner_user_id=${eq(owner)}&channel=eq.phone`, { method: 'PATCH', body: { expires_at: now() } });
      return res.status(200).json({ saved: true });
    }
    fail('Unknown assistant action.', 404);
  } catch (error) {
    if (!(error instanceof AppError)) console.error('assistant request failed', error.name || 'Error');
    return res.status(error.status || 500).json({ error: error instanceof AppError ? error.message : 'The assistant could not complete this request. Please try again.' });
  }
}
module.exports = handler;
module.exports.config = { api: { bodyParser: false }, maxDuration: 60 };
