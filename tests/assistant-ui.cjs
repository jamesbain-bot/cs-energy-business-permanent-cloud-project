// UI smoke test with synthetic account/provider data; never touches a real inbox.
const { chromium } = require('playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 950 } });
    let sends = 0;
    const action = { id: 'test-action', kind: 'email', status: 'pending', expires_at: '2099-01-01', payload: { customer_name: 'Stef', to: 'stef@example.test', subject: 'Deposit', text: 'Hi Stef, please let me know about the deposit. Thanks, James.' } };
    await page.route('https://app.example.test/**', async route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/') return route.fulfill({ body: '<html></html>', contentType: 'text/html' });
      const mode = url.searchParams.get('mode');
      const body = mode === 'chat' ? { session_id: 'test-session', reply: 'I have prepared the message for your approval.', drafts: [action] } : mode === 'approve' ? { action: { ...action, status: 'submitted', provider_status: 'submitted' } } : { integrations: { ai: true, calendar: true, email: true, phone: false, whatsapp: false }, phone: '', hasPin: false, actions: [] };
      if (mode === 'approve') sends++;
      await route.fulfill({ json: body });
    });
    await page.goto('https://app.example.test/');
    const original = fs.readFileSync('index.html', 'utf8');
    const styles = [...original.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[0]).join('\n');
    await page.setContent(`${styles}<main style="max-width:980px;margin:30px auto;padding:20px"><section id="assistant" class="view active"><div class="top"><h1>CS Energy Assistant</h1><p></p></div><div id="assistantList"></div></section></main>`);
    await page.evaluate(() => { window.CUSTOMER_APP_MODE = false; window.sb = { auth: { getSession: async () => ({ data: { session: { access_token: 'fake', user: { id: 'test-owner' } } } }), onAuthStateChange: () => {} } }; window.switchView = () => {}; });
    await page.addScriptTag({ content: fs.readFileSync('assistant-v1.js', 'utf8') });
    await page.getByText('AI: configured', { exact: true }).waitFor();
    await page.locator('#csa-message').fill('Email Stef asking about the deposit.');
    await page.getByRole('button', { name: 'Ask assistant', exact: true }).click();
    await page.getByText('Please review this exact message before confirming.').waitFor();
    assert.equal(sends, 0);
    await page.screenshot({ path: '/tmp/cs-assistant-desktop.png', fullPage: true });
    await page.getByRole('button', { name: 'Confirm and send', exact: true }).click();
    await page.getByText('Provider status: submitted').waitFor();
    assert.equal(sends, 1);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'No horizontal overflow');
    await page.screenshot({ path: '/tmp/cs-assistant-mobile.png', fullPage: true });
    console.log('UI passed: connection status, chat, immutable preview, explicit confirmation, desktop/mobile layout.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
