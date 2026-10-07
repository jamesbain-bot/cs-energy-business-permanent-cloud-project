'use strict';
const { fail, eq, rows, access, phone, equalSecret, clean } = require('./core');
const { verifyMeta } = require('./providers');

async function webhook(req, raw, query) {
  if (req.method === 'GET') {
    if (query.get('hub.mode') !== 'subscribe' || !equalSecret(query.get('hub.verify_token'), process.env.WHATSAPP_VERIFY_TOKEN)) fail('Invalid verification token.', 403);
    return { text: query.get('hub.challenge') || '' };
  }
  if (req.method !== 'POST') fail('Method not allowed.', 405);
  if (!verifyMeta(raw, req.headers['x-hub-signature-256'], process.env.WHATSAPP_APP_SECRET)) fail('Invalid WhatsApp webhook signature.', 403);
  const owner = process.env.WHATSAPP_OWNER_USER_ID;
  await access(owner);
  const body = JSON.parse(raw.toString('utf8'));
  if (body.object !== 'whatsapp_business_account') fail('Unexpected webhook payload.');
  for (const entry of body.entry || []) for (const change of entry.changes || []) {
    const value = change.value || {};
    if (value.metadata?.phone_number_id !== process.env.WHATSAPP_PHONE_NUMBER_ID) continue;
    for (const message of value.messages || []) {
      if (!message.id || !message.from || !/^\d+$/.test(String(message.timestamp))) continue;
      const timestamp = Number(message.timestamp) * 1000;
      if (!Number.isFinite(timestamp) || timestamp <= 0 || timestamp > Date.now() + 300000) continue;
      const text = message.type === 'text' ? clean(message.text?.body, 4000) : `[${clean(message.type, 30)} message: view it in WhatsApp]`;
      await rows('messages', 'on_conflict=provider_id', {
        method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
        body: { owner_user_id: owner, provider_id: clean(message.id, 250), from_phone: phone(message.from), body: text, received_at: new Date(timestamp).toISOString() }
      });
    }
    for (const status of value.statuses || []) {
      if (!['sent', 'delivered', 'read', 'failed'].includes(status.status)) continue;
      // Monotonic updates: a delayed sent callback cannot overwrite read or delivered.
      const previous = status.status === 'read' ? ['submitted', 'sent', 'delivered'] : status.status === 'delivered' ? ['submitted', 'sent'] : ['submitted'];
      await rows('actions', `owner_user_id=${eq(owner)}&provider_id=${eq(status.id)}&provider_status=in.(${previous.join(',')})`, {
        method: 'PATCH', body: { provider_status: status.status }
      });
    }
  }
  // Incoming content is stored, never granted tool access or sent an automatic response.
  return { json: { received: true } };
}
module.exports = { webhook };
