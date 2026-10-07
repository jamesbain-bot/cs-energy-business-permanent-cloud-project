'use strict';
const crypto = require('node:crypto');
const { fail, eq, rows, db, phone, verifyPin, now, newSession, integrationStatus } = require('./core');
const { verifyTwilio } = require('./providers');
const { chat, approve, cancel, actionFor } = require('./agent');

const xml = text => String(text || '').replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
const say = text => `<Say language="en-GB" voice="Polly.Amy">${xml(text)}</Say>`;
const hangup = text => `<?xml version="1.0" encoding="UTF-8"?><Response>${say(text)}<Hangup/></Response>`;
function publicUrl() {
  const value = process.env.ASSISTANT_PUBLIC_URL || '';
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) fail('Phone callback URL must use HTTPS.', 503);
  return url.origin;
}
function callback(s, phase, actionId) {
  const query = new URLSearchParams({ mode: 'voice', sid: s.id, nonce: s.voice_nonce, phase });
  if (actionId) query.set('aid', actionId);
  return `${publicUrl()}/api/assistant?${query}`;
}
function gather(s, text, phase = 'talk', actionId) {
  const pin = phase === 'pin';
  // Read the whole preview before listening for approval; speech cannot interrupt the draft.
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${say(text)}<Gather action="${xml(callback(s, phase, actionId))}" method="POST" input="${pin ? 'dtmf' : 'speech dtmf'}" ${pin ? 'finishOnKey="#"' : 'numDigits="1" speechTimeout="auto" language="en-GB"'} timeout="8" actionOnEmptyResult="true"/>${say('I did not hear anything. Goodbye.')}<Hangup/></Response>`;
}
function confirmation(s, action) {
  const p = action.payload;
  return gather(s, `Please check this ${action.kind} to ${p.customer_name}, ${p.to}. ${p.subject ? 'Subject: ' + p.subject + '. ' : ''}${p.text}. Say yes or press 1 to submit this exact message. Say no or press 2 to cancel.`, 'confirm', action.id);
}
function decision(params) {
  if (params.Digits === '1') return 'approve';
  if (params.Digits === '2') return 'cancel';
  if (Number(params.Confidence || 0) < 0.85) return null;
  const text = String(params.SpeechResult || '').toLowerCase().replace(/[.!?,]/g, '').trim();
  if (/^(yes|yes please|yes send it|send it|confirm)$/.test(text)) return 'approve';
  if (/^(no|no thanks|cancel|cancel it|do not send)$/.test(text)) return 'cancel';
  return null;
}
async function voice(req, params, query) {
  if (!integrationStatus().phone) fail('Phone service is not configured.', 503);
  const url = publicUrl() + req.url;
  if (!verifyTwilio(url, params, req.headers['x-twilio-signature'], process.env.TWILIO_AUTH_TOKEN)) fail('Invalid phone webhook signature.', 403);
  if (params.AccountSid !== process.env.TWILIO_ACCOUNT_SID || !/^CA[0-9a-f]{32}$/i.test(params.CallSid || '')) fail('Invalid call.', 403);
  let caller;
  try { caller = phone(params.From); if (phone(params.To) !== phone(process.env.TWILIO_PHONE_NUMBER)) fail('Invalid number.', 403); }
  catch { return hangup('This assistant is for registered CS Energy staff.'); }
  const accounts = await rows('access', `phone_e164=${eq(caller)}&enabled=eq.true&limit=1`);
  const account = accounts[0];
  if (!account?.pin_hash) return hangup('This assistant is for registered CS Energy staff.');
  let sessions = await rows('sessions', `provider_id=${eq(params.CallSid)}&owner_user_id=${eq(account.user_id)}&channel=eq.phone&limit=1`);
  let s = sessions[0];
  if (!query.get('sid')) {
    if (s) return s.last_voice_response || hangup('This call has already started. Please call again.');
    s = await newSession(account.user_id, 'phone', params.CallSid);
    const response = gather(s, 'Hello, this is the CS Energy AI assistant. Enter your personal PIN, followed by the hash key.', 'pin');
    await rows('sessions', `id=${eq(s.id)}`, { method: 'PATCH', body: { last_voice_response: response } });
    return response;
  }
  if (!s || s.id !== query.get('sid') || Date.parse(s.expires_at) <= Date.now()) return hangup('This call has expired. Please call again.');
  const nonce = query.get('nonce');
  if (nonce !== s.voice_nonce) return nonce === s.last_voice_nonce && s.last_voice_response ? s.last_voice_response : hangup('That request has already been handled.');
  const claimed = await rows('sessions', `id=${eq(s.id)}&owner_user_id=${eq(account.user_id)}&voice_nonce=${eq(nonce)}`, {
    method: 'PATCH', body: { voice_nonce: crypto.randomUUID(), last_voice_nonce: nonce, last_voice_response: null }
  });
  if (!claimed[0]) return hangup('This request is already being processed. Please call again.');
  s = claimed[0];
  let response;
  try {
    if (!s.phone_authenticated) {
      const allowed = await db('rpc/cs_energy_assistant_pin_attempt', { method: 'POST', body: { p_owner: account.user_id } });
      if (!allowed) response = hangup('PIN entry is temporarily locked. Please try again in fifteen minutes.');
      else if (query.get('phase') !== 'pin' || !verifyPin(params.Digits, account.pin_hash)) response = gather(s, 'That PIN was not recognised. Enter your PIN followed by hash.', 'pin');
      else {
        await rows('access', `user_id=${eq(account.user_id)}`, { method: 'PATCH', body: { failed_pin_attempts: 0, pin_locked_until: null } });
        await rows('sessions', `id=${eq(s.id)}`, { method: 'PATCH', body: { phone_authenticated: true } });
        response = gather(s, 'Hello. What would you like me to check or prepare?');
      }
    } else if (query.get('phase') === 'confirm') {
      const id = query.get('aid');
      if (!id || id !== s.pending_action_id) fail('That draft is no longer awaiting confirmation.');
      const action = await actionFor(account.user_id, id);
      if (action.session_id !== s.id || action.status !== 'pending') fail('That draft has already been handled.');
      const answer = decision(params);
      if (!answer) response = confirmation(s, action);
      else {
        const result = answer === 'approve' ? await approve(account.user_id, id) : await cancel(account.user_id, id);
        await rows('sessions', `id=${eq(s.id)}`, { method: 'PATCH', body: { pending_action_id: null } });
        const message = result.status === 'submitted' ? 'Submitted to the messaging provider. Delivery is not yet confirmed.' : result.status === 'cancelled' ? 'Cancelled.' : result.error || 'The message was not submitted.';
        response = gather(s, message + ' What else can I help with?');
      }
    } else {
      const speech = String(params.SpeechResult || '').trim();
      if (!speech) response = hangup('I did not hear a request. Goodbye.');
      else if (/^(goodbye|bye|that is all|that\x27s all)[.!]?$/i.test(speech)) response = hangup('Goodbye.');
      else {
        const result = await chat(account.user_id, s, speech);
        const action = result.drafts[0];
        if (action && action.payload.text.length > 1200) {
          response = gather(s, 'I prepared a long message. Please review and confirm it in the assistant section of your back office. What else can I help with?');
        } else response = action ? confirmation(s, action) : gather(s, result.reply);
      }
    }
  } catch (error) {
    response = gather(s, (error.status ? error.message : 'I could not complete that request. Please check the assistant in your back office.') + ' What else can I help with?', s.phone_authenticated ? 'talk' : 'pin');
  }
  await rows('sessions', `id=${eq(s.id)}&voice_nonce=${eq(s.voice_nonce)}`, { method: 'PATCH', body: { last_voice_response: response } });
  return response;
}
module.exports = { voice, xml, gather, decision, confirmation };
