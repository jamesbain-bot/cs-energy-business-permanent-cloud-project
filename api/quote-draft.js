'use strict';
const { authenticate, AppError, fail } = require('../lib/assistant/core');
const { createDraft, LIMITS } = require('../lib/quote-draft');

async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); fail('Method not allowed.', 405); }
    const account = await authenticate(req);
    if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) fail('Expected JSON.', 415);
    if (Number(req.headers['content-length']) > LIMITS.body) fail('Request is too large.', 413);
    const chunks = []; let size = 0;
    for await (const chunk of req) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.length;
      if (size > LIMITS.body) fail('Request is too large.', 413);
      chunks.push(bytes);
    }
    let body;
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { fail('Invalid JSON.'); }
    return res.status(200).json(await createDraft(account.user_id, body));
  } catch (error) {
    if (!(error instanceof AppError)) console.error('quote draft failed', error.name || 'Error');
    return res.status(error instanceof AppError ? error.status : 500).json({ error: error instanceof AppError ? error.message : 'The quote draft could not be completed. Please try again.' });
  }
}
module.exports = handler;
module.exports.config = { api: { bodyParser: false }, maxDuration: 60 };
