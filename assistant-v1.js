(function () {
  'use strict';
  if (typeof CUSTOMER_APP_MODE !== 'undefined' && CUSTOMER_APP_MODE) return;
  const section = document.getElementById('assistant');
  if (!section || typeof sb === 'undefined') return;
  let conversation = null, owner = null, busy = false, loaded = false;
  const style = document.createElement('style');
  style.textContent = '.csa-panel{margin-bottom:20px}.csa-log{max-height:420px;overflow:auto;display:grid;gap:12px;margin:18px 0}.csa-line{padding:12px 15px;border-radius:12px;background:#f2f6f8;white-space:pre-wrap;overflow-wrap:anywhere}.csa-line.user{background:#e2f3e9;margin-left:8%}.csa-compose{display:flex;gap:10px;align-items:end}.csa-compose textarea{width:100%;min-height:85px;resize:vertical}.csa-status{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.csa-tag{border-radius:20px;padding:6px 10px;background:#f0f3f5;font-size:12px}.csa-draft{border:1px solid #c9ded2;border-radius:12px;padding:16px;margin:12px 0}.csa-draft pre{font:inherit;white-space:pre-wrap;overflow-wrap:anywhere;background:#f6f8f7;padding:12px}.csa-actions{display:flex;gap:8px;flex-wrap:wrap}.csa-phone{display:grid;gap:10px;max-width:480px}.csa-error{color:#a03120}.csa-label{display:block;font-size:13px;font-weight:600;margin-bottom:5px}@media(max-width:650px){.csa-compose{flex-wrap:wrap}.csa-compose textarea{flex-basis:100%}}';
  document.head.appendChild(style);
  const panel = document.createElement('div'); panel.className = 'card csa-panel';
  panel.innerHTML = `<h2>Your business assistant</h2><p>Ask about customers, systems and appointments, or prepare a message to send.</p>
    <div class="csa-status" id="csa-connections" aria-live="polite"></div>
    <div class="csa-actions"><button class="mini" data-csa-prompt="What appointments and jobs have I got this week?">This week’s jobs</button><button class="mini" data-csa-prompt="Show me the latest incoming WhatsApp messages.">WhatsApp replies</button><button class="mini" id="csa-new">New conversation</button><button class="mini" id="csa-refresh">Refresh messages</button></div>
    <div class="csa-log" id="csa-log" role="log" aria-live="polite"></div>
    <form id="csa-form"><label class="csa-label" for="csa-message">What would you like me to do?</label><div class="csa-compose"><textarea id="csa-message" maxlength="2000" placeholder="Find Stef and draft an email asking about his deposit." required></textarea><button class="btn" id="csa-send" type="submit">Ask assistant</button><button class="mini" id="csa-dictate" type="button" hidden>Dictate</button></div></form>
    <p class="muted" id="csa-help">Every outgoing message needs your confirmation. Booking changes and invoices are still handled in their usual app sections.</p>
    <p id="csa-error" class="csa-error" role="alert"></p><div id="csa-drafts"></div>
    <details><summary>Phone assistant setup</summary><p id="csa-phone-state">Check connections to see whether calling is available.</p><form id="csa-phone-form" class="csa-phone"><label>Your mobile number<input id="csa-phone" type="tel" autocomplete="tel" placeholder="+34…" required></label><label>Personal phone PIN<input id="csa-pin" type="password" inputmode="numeric" autocomplete="new-password" pattern="[0-9]{6,10}" placeholder="6 to 10 digits"></label><button class="mini" type="submit">Save phone access</button><p class="muted">Use this number when calling. Enter your PIN on the keypad. Leave the PIN blank to keep your current one.</p></form></details>`;
  section.insertBefore(panel, document.getElementById('assistantList'));
  const top = section.querySelector('.top p'); if (top) top.textContent = 'Customer lookups, message drafts and your daily priorities.';
  const get = id => document.getElementById(id);
  const error = text => { get('csa-error').textContent = text || ''; };
  async function request(mode, body) {
    const result = await sb.auth.getSession(), s = result.data.session;
    if (!s) throw new Error('Please sign in to CS Energy.');
    if (owner !== s.user.id) { owner = s.user.id; conversation = null; get('csa-log').replaceChildren(); get('csa-drafts').replaceChildren(); }
    const response = await fetch(`/api/assistant?mode=${mode}`, { method: body ? 'POST' : 'GET',
      headers: { Authorization: 'Bearer ' + s.access_token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'The assistant could not complete this request.');
    return payload;
  }
  function line(text, role) { const el = document.createElement('div'); el.className = 'csa-line ' + role; el.textContent = text; get('csa-log').appendChild(el); el.scrollIntoView({ block: 'nearest' }); }
  function renderAction(action) {
    const existing = document.getElementById('csa-action-' + action.id); if (existing) existing.remove();
    const card = document.createElement('div'); card.className = 'csa-draft'; card.id = 'csa-action-' + action.id;
    const title = document.createElement('strong'); title.textContent = `${action.kind === 'email' ? 'Email' : 'WhatsApp'} to ${action.payload.customer_name} · ${action.payload.to}`;
    const body = document.createElement('pre'); body.textContent = (action.payload.subject ? 'Subject: ' + action.payload.subject + '\n\n' : '') + action.payload.text;
    const status = document.createElement('p'); const expired = Date.parse(action.expires_at) <= Date.now();
    const pending = action.status === 'pending' && !expired;
    status.textContent = action.error || (pending ? 'Please review this exact message before confirming.' : action.status === 'pending' ? 'Draft expired — ask for a new draft.' : action.status === 'submitted' ? 'Provider status: ' + (action.provider_status || 'submitted') : 'Status: ' + action.status);
    card.append(title, body, status);
    if (pending) {
      const buttons = document.createElement('div'); buttons.className = 'csa-actions';
      for (const [mode, label] of [['approve', 'Confirm and send'], ['cancel', 'Cancel draft']]) {
        const button = document.createElement('button'); button.className = 'mini'; button.textContent = label;
        button.onclick = async () => { error(''); buttons.querySelectorAll('button').forEach(b => b.disabled = true); try {
          const result = await request(mode, { action_id: action.id, confirmed: mode === 'approve' }); renderAction(result.action);
        } catch (e) { error(e.message); buttons.querySelectorAll('button').forEach(b => b.disabled = false); } };
        buttons.appendChild(button);
      }
      card.appendChild(buttons);
    }
    get('csa-drafts').prepend(card);
  }
  async function refresh() {
    try {
      const result = await request('status'); loaded = true; error('');
      get('csa-connections').replaceChildren();
      for (const [key, name] of [['ai', 'AI'], ['calendar', 'Google Calendar'], ['email', 'Email'], ['whatsapp', 'WhatsApp'], ['phone', 'Phone']]) {
        const tag = document.createElement('span'); tag.className = 'csa-tag'; tag.textContent = name + ': ' + (result.integrations[key] ? 'configured' : 'setup needed'); get('csa-connections').appendChild(tag);
      }
      get('csa-phone').value = result.phone;
      get('csa-phone-state').textContent = result.integrations.phone ? `Call ${result.integrations.phoneNumber} from your registered mobile.` : 'The telephone provider still needs connecting. You can save your mobile number and PIN now.';
      get('csa-drafts').replaceChildren(); result.actions.slice().reverse().forEach(renderAction);
    } catch (e) { error(e.message); }
  }
  get('csa-form').onsubmit = async e => {
    e.preventDefault(); if (busy) return;
    const message = get('csa-message').value.trim(); if (!message) return;
    busy = true; get('csa-send').disabled = true; get('csa-send').textContent = 'Checking…'; error(''); line(message, 'user');
    try {
      const result = await request('chat', { message, session_id: conversation }); conversation = result.session_id;
      line(result.reply, 'assistant'); result.drafts.forEach(renderAction); get('csa-message').value = '';
    } catch (e) { error(e.message); }
    finally { busy = false; get('csa-send').disabled = false; get('csa-send').textContent = 'Ask assistant'; }
  };
  get('csa-new').onclick = () => { if (!busy) { conversation = null; get('csa-log').replaceChildren(); error(''); } };
  get('csa-refresh').onclick = refresh;
  panel.querySelectorAll('[data-csa-prompt]').forEach(button => { button.onclick = () => { get('csa-message').value = button.dataset.csaPrompt; get('csa-message').focus(); }; });
  get('csa-phone-form').onsubmit = async e => {
    e.preventDefault(); const button = e.currentTarget.querySelector('button'); button.disabled = true; error('');
    try { await request('phone-settings', { phone: get('csa-phone').value, pin: get('csa-pin').value }); get('csa-pin').value = ''; await refresh(); line('Your phone access details have been saved.', 'assistant'); }
    catch (e) { error(e.message); } finally { button.disabled = false; }
  };
  const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (Speech) {
    const recogniser = new Speech(); recogniser.lang = 'en-GB'; recogniser.interimResults = false;
    get('csa-dictate').hidden = false; get('csa-dictate').onclick = () => { error(''); try { recogniser.start(); } catch {} };
    recogniser.onresult = event => { get('csa-message').value = event.results[0][0].transcript; };
    recogniser.onerror = () => error('Dictation could not start. You can type your request instead.');
  }
  // Other existing add-ons wrap navigation too. Observe the view rather than replacing it.
  new MutationObserver(() => { if (section.classList.contains('active')) refresh(); }).observe(section, { attributes: true, attributeFilter: ['class'] });
  sb.auth.onAuthStateChange((event, s) => { if (!s || (owner && owner !== s.user.id)) { conversation = null; owner = null; loaded = false; get('csa-log').replaceChildren(); get('csa-drafts').replaceChildren(); } });
  if (section.classList.contains('active') && !loaded) refresh();
})();
