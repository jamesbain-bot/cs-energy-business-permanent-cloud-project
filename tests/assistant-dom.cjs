// DOM interaction fallback when a browser binary is unavailable. No layout assertions.
const { JSDOM } = require('jsdom');
const fs = require('node:fs');
const assert = require('node:assert/strict');
(async () => {
  const dom = new JSDOM('<section id="assistant" class="view active"><div class="top"><p></p></div><div id="assistantList"></div></section>', { url: 'https://app.example.test', runScripts: 'outside-only' });
  const w = dom.window; let sends = 0;
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.CUSTOMER_APP_MODE = false;
  w.sb = { auth: { getSession: async () => ({ data: { session: { access_token: 'fake', user: { id: 'test-owner' } } } }), onAuthStateChange() {} } };
  const action = { id: 'test-action', kind: 'email', status: 'pending', expires_at: '2099-01-01', payload: { customer_name: 'Stef', to: 'stef@example.test', subject: 'Deposit', text: '<img src=x onerror="window.injected=true">Please confirm the deposit.' } };
  w.fetch = async (url, options) => {
    const mode = new URL(url, w.location).searchParams.get('mode');
    if (mode === 'approve') { sends++; assert.equal(JSON.parse(options.body).confirmed, true); }
    const body = mode === 'chat' ? { session_id: 'test-session', reply: 'Draft ready.', drafts: [action] } : mode === 'approve' ? { action: { ...action, status: 'submitted', provider_status: 'submitted' } } : { integrations: { ai: true, calendar: true, email: true }, phone: '', actions: [] };
    return { ok: true, json: async () => body };
  };
  const waitFor = async fn => { for (let i=0;i<100;i++) { if(fn()) return; await new Promise(resolve=>setTimeout(resolve,10)); } throw new Error('DOM result did not appear'); };
  w.eval(fs.readFileSync('modal-layer-fix.js','utf8'));
  assert.equal(w.document.getElementById('cs-energy-assistant-addon').src, 'https://app.example.test/assistant-v1.js');
  w.eval(fs.readFileSync('assistant-v1.js','utf8'));
  await waitFor(() => w.document.getElementById('csa-connections').textContent.includes('AI: configured'));
  w.document.getElementById('csa-message').value = 'Email Stef about his deposit';
  w.document.getElementById('csa-form').dispatchEvent(new w.Event('submit', { cancelable: true }));
  await waitFor(() => w.document.querySelector('.csa-draft'));
  assert.equal(sends, 0); assert.equal(w.document.querySelector('.csa-draft img'), null); assert.equal(w.injected, undefined);
  w.document.querySelector('.csa-draft button').click();
  await waitFor(() => w.document.getElementById('csa-drafts').textContent.includes('Provider status: submitted'));
  assert.equal(sends, 1); assert.equal(w.document.querySelectorAll('.csa-draft button').length, 0);
  assert.equal(w.document.getElementById('csa-error').textContent, '');
  dom.window.close();
  console.log('DOM passed: connection status, draft preview, explicit send, duplicate-button removal and escaped customer text.');
})().catch(error => { console.error(error); process.exit(1); });
