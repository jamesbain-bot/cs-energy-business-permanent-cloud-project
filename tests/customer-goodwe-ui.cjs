// Focused browser QA with the real customer renderer/styles and synthetic records.
// Provider navigation is mocked; this does not log in to GoodWe or CS Energy.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const start = html.indexOf('function renderCustomerPortalHome(rec){');
const renderer = html.slice(start, html.indexOf('function updateCustomerServicePrice()', start));
const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(match => match[0]).join('\n');
const goodwe = { payload: { customer: { name: 'Test Customer', plan: 'No plan' }, portalStage: 'full', systems: [{ installed: '2025-01-01', inverter: 'GoodWe GW5000-EH', panels: 'Solar panels', battery: 'Battery', batteryKwh: 5, pv: 6, monitorPlatform: 'SEMS' }], pricing: {} } };

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.route('https://customer.example.test/**', route => route.fulfill({ body: '<html></html>', contentType: 'text/html' }));
    await context.route('https://eu-semsplus.goodwe.com/**', route => route.fulfill({ body: '<h1>Mock SEMS+ destination</h1>', contentType: 'text/html' }));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('https://customer.example.test/?customerapp=1');
    await page.setContent(`${styles}<div class="customer-app-shell"><div id="customerAppHome"></div></div>`);
    await page.evaluate(() => {
      window.CUSTOMER_APP_MODE = true;
      window.cloudSession = null;
      window.hasCarePlan = () => false;
      window.esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
      window.eur = value => `€${value}`;
      window.prettyDate = value => value || '—';
      window.statusClass = () => '';
    });
    await page.addScriptTag({ content: renderer });
    for (const file of ['customer-quote-stage-workflow-v1.js', 'customer-care-plan-sales-v1.js']) {
      await page.addScriptTag({ content: fs.readFileSync(path.join(root, file), 'utf8') });
    }
    const render = async rec => {
      await page.evaluate(rec => window.renderCustomerPortalHome(rec), rec);
      await page.waitForTimeout(80);
    };
    await render(goodwe);
    const link = page.getByRole('link', { name: 'Open GoodWe SEMS+' });
    assert.equal(await link.count(), 1);
    await link.focus();
    assert.equal(await link.evaluate(el => getComputedStyle(el).outlineStyle), 'solid');
    assert.ok((await link.boundingBox()).height >= 44, 'Touch target is at least 44px high');
    await page.locator('#customerServiceDescription').fill('Test service note stays here');
    for (let attempt = 0; attempt < 2; attempt++) {
      const popupPromise = context.waitForEvent('page');
      await link.click();
      const popup = await popupPromise;
      await popup.waitForLoadState();
      assert.equal(popup.url(), 'https://eu-semsplus.goodwe.com/');
      assert.equal(await popup.evaluate(() => window.opener), null);
      assert.equal(page.url(), 'https://customer.example.test/?customerapp=1');
      assert.equal(await page.locator('#customerServiceDescription').inputValue(), 'Test service note stays here');
      await popup.close();
    }
    await link.locator('..').screenshot({ path: process.env.SEMS_DESKTOP_SCREENSHOT || '/tmp/customer-goodwe-desktop.png' });
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await link.scrollIntoViewIfNeeded();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `No ${width}px horizontal overflow`);
      const box = await link.boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= width, 'Link stays inside mobile viewport');
      if (width === 390) await link.locator('..').screenshot({ path: process.env.SEMS_MOBILE_SCREENSHOT || '/tmp/customer-goodwe-mobile.png' });
    }
    await render(goodwe);
    assert.equal(await link.count(), 1, 'Repeated render does not duplicate links');
    await render({ payload: { ...goodwe.payload, systems: [{ inverter: 'Fronius Primo' }] } });
    assert.equal(await link.count(), 0, 'Switching customers removes GoodWe link');
    await render({ payload: { ...goodwe.payload, portalStage: 'quote' } });
    assert.equal(await link.count(), 0, 'Quote-only customers do not gain monitoring access');
    await render(goodwe);
    assert.equal(await link.count(), 1, 'Full customer view restores link');
    assert.deepEqual(errors, []);
    console.log('Browser QA passed: current customer wrappers, desktop, 390px/320px mobile, 44px target, keyboard focus, repeated external opens, no opener, retained form state, customer switching, and quote/full access.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
