'use strict';
const crypto = require('node:crypto');
const { fail, requestJson, rows, eq, now, phone, equalSecret } = require('./core');

async function googleToken() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw || !process.env.GOOGLE_CALENDAR_ID) fail('Google Calendar is not connected.', 503);
  const credentials = JSON.parse(raw);
  const seconds = Math.floor(Date.now() / 1000);
  const part = x => Buffer.from(JSON.stringify(x)).toString('base64url');
  const unsigned = `${part({ alg: 'RS256', typ: 'JWT' })}.${part({
    iss: credentials.client_email, sub: process.env.GOOGLE_IMPERSONATE_EMAIL || 'james.bain@competasolar.es',
    scope: 'https://www.googleapis.com/auth/calendar.readonly', aud: 'https://oauth2.googleapis.com/token',
    iat: seconds, exp: seconds + 3600
  })}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(unsigned), credentials.private_key).toString('base64url');
  const { response, body } = await requestJson('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` })
  });
  if (!response.ok || !body.access_token) fail('Google Calendar could not authenticate.');
  return body.access_token;
}
function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '') && !isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
function madridDate(value) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
}
async function calendar(from, to) {
  if (!validDate(from) || !validDate(to) || from > to || (Date.parse(to) - Date.parse(from)) / 86400000 > 31) fail('Choose a date range of at most 31 days.');
  const token = await googleToken();
  // Wide UTC bounds, then filter by Madrid local date (including DST and all-day events).
  const query = new URLSearchParams({ timeMin: new Date(Date.parse(from) - 86400000).toISOString(),
    timeMax: new Date(Date.parse(to) + 2 * 86400000).toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: '250' });
  const { response, body } = await requestJson(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(process.env.GOOGLE_CALENDAR_ID)}/events?${query}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) fail('Google Calendar could not be read.');
  return { truncated: !!body.nextPageToken, events: (body.items || []).filter(event => {
    const start = event.start?.date || madridDate(event.start?.dateTime);
    const end = event.end?.date || madridDate(event.end?.dateTime);
    return start <= to && end >= from;
  }).map(event => ({ id: event.id, title: event.summary, start: event.start, end: event.end, location: event.location })) };
}
async function whatsappWindow(owner, number) {
  const messages = await rows('messages', `owner_user_id=${eq(owner)}&from_phone=${eq(number)}&received_at=gt.${new Date(Date.now() - 24 * 3600000).toISOString()}&limit=1`);
  return !!messages[0];
}
async function sendMessage(action) {
  const { payload: p, kind, owner_user_id: owner } = action;
  if (kind === 'email') {
    if (!process.env.RESEND_API_KEY) fail('Email is not connected.', 503);
    const { response, body } = await requestJson('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `cs-assistant-${action.id}` },
      body: JSON.stringify({ from: process.env.ASSISTANT_EMAIL_FROM || 'CS Energy <info@competasolar.es>', to: [p.to], subject: p.subject, text: p.text })
    });
    if (response.status >= 500) throw new Error('Provider result uncertain');
    if (!response.ok) fail(`Email provider rejected this message (${response.status}).`);
    if (!body.id) throw new Error('Provider result uncertain');
    return { provider_id: body.id, provider_status: 'submitted' };
  }
  if (kind !== 'whatsapp') fail('Unsupported action.');
  if (!process.env.WHATSAPP_ACCESS_TOKEN || !process.env.WHATSAPP_PHONE_NUMBER_ID || !/^v\d+\.\d+$/.test(process.env.WHATSAPP_GRAPH_VERSION || '')) fail('WhatsApp Business is not connected.', 503);
  if (owner !== process.env.WHATSAPP_OWNER_USER_ID) fail('WhatsApp is connected to a different business account.', 403);
  if (!await whatsappWindow(owner, p.to)) fail('This customer has not messaged the connected WhatsApp number in the last 24 hours. An approved WhatsApp template is required; this version supports replies inside that window.');
  const { response, body } = await requestJson(`https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION}/${encodeURIComponent(process.env.WHATSAPP_PHONE_NUMBER_ID)}/messages`, {
    method: 'POST', headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: phone(p.to).slice(1), type: 'text', text: { body: p.text } })
  });
  if (response.status >= 500) throw new Error('Provider result uncertain');
  if (!response.ok) fail(`WhatsApp rejected this message (${response.status}).`);
  if (!body.messages?.[0]?.id) throw new Error('Provider result uncertain');
  return { provider_id: body.messages[0].id, provider_status: 'submitted' };
}
function verifyTwilio(url, params, signature, secret) {
  if (!secret || !signature) return false;
  const data = url + Object.keys(params).sort().map(key => key + params[key]).join('');
  return equalSecret(crypto.createHmac('sha1', secret).update(data).digest('base64'), signature);
}
function verifyMeta(raw, signature, secret) {
  return !!secret && equalSecret('sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex'), signature);
}
module.exports = { calendar, validDate, madridDate, whatsappWindow, sendMessage, verifyTwilio, verifyMeta };
