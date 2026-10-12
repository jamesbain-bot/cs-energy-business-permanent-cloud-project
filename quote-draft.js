/* AI suggestions stay in memory until the user adds them to the existing quote editor. */
(function () {
  'use strict';
  if (typeof CUSTOMER_APP_MODE !== 'undefined' && CUSTOMER_APP_MODE) return;
  const form = document.getElementById('quoteForm');
  if (!form || typeof sb === 'undefined') return;
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'ghost'; button.textContent = '✨ Draft with AI'; button.id = 'quote-ai-open';
  form.querySelector('.section-head').appendChild(button);
  const style = document.createElement('style');
  style.textContent = '#quote-ai-dialog{border:0;border-radius:18px;padding:24px;width:min(720px,calc(100% - 32px));max-height:85vh;overflow:auto;color:inherit}#quote-ai-dialog::backdrop{background:#122b3db3}#quote-ai-dialog textarea{width:100%;min-height:110px}#quote-ai-dialog label{display:block;margin:14px 0 5px}#quote-ai-dialog .ai-review{background:#f3f7f5;padding:16px;border-radius:12px;margin:16px 0;overflow-wrap:anywhere}#quote-ai-dialog .ai-totals{text-align:right}#quote-ai-dialog .ai-error{color:#a03120}#quote-ai-dialog table{width:100%;font-size:13px}#quote-ai-dialog th,#quote-ai-dialog td{padding:8px;text-align:left}#quote-ai-dialog .btnrow{flex-wrap:wrap}';
  document.head.appendChild(style);
  const dialog = document.createElement('dialog'); dialog.id = 'quote-ai-dialog'; dialog.setAttribute('aria-labelledby', 'quote-ai-title');
  dialog.innerHTML = `<div class="modaltop"><h2 id="quote-ai-title">Draft this quotation with AI</h2><button type="button" class="close" aria-label="Close AI draft">×</button></div>
    <p id="quote-ai-customer"></p><p>Describe the work. Suggestions use your saved price book and the existing 21% IVA calculation. Review equipment suitability, quantities and omissions before saving.</p>
    <label for="quote-ai-prompt">Job description</label><textarea id="quote-ai-prompt" maxlength="4000" placeholder="For example: rooftop solar with battery storage. Include the equipment, quantities and site requirements you already know."></textarea>
    <label for="quote-ai-capacity">Requested system capacity (kWp, optional)</label><input id="quote-ai-capacity" type="number" min="0.01" max="10000" step="0.01">
    <p class="muted">The description and product catalogue are processed by OpenAI. Leave personal details out of the description. Customer contact details are not included automatically.</p>
    <p id="quote-ai-status" role="status" aria-live="polite"></p><p id="quote-ai-error" class="ai-error" role="alert"></p><div id="quote-ai-preview"></div>
    <div class="btnrow"><button type="button" class="ghost" id="quote-ai-cancel">Cancel</button><button type="button" class="primary" id="quote-ai-generate">Generate draft</button><button type="button" class="primary" id="quote-ai-apply" hidden>Add reviewed lines to quote</button></div>`;
  document.body.appendChild(dialog);
  const el = id => document.getElementById('quote-ai-' + id);
  let generation = 0, controller = null, draft = null, context = null, busy = false;
  const rawLines = () => [...document.querySelectorAll('#quoteLineBody tr')].map(row => ['.lineProduct', '.lineDesc', '.lineQty', '.lineCost', '.lineSell'].map(selector => row.querySelector(selector).value));
  const fingerprint = () => JSON.stringify({ customer: form.elements.customerId.value, edit: typeof editingQuoteId === 'undefined' ? null : editingQuoteId, lines: rawLines(), title: form.elements.title.value, scope: form.elements.scope.value });
  function invalidate() { generation++; if (controller) controller.abort(); controller = null; draft = null; busy = false; el('apply').hidden = true; el('generate').disabled = false; el('status').textContent = ''; }
  function close() { invalidate(); dialog.close(); button.focus(); }
  function changed() { invalidate(); el('preview').replaceChildren(); el('error').textContent = ''; }
  function node(tag, text, parent) { const n = document.createElement(tag); n.textContent = text; parent.appendChild(n); return n; }
  button.onclick = () => {
    const id = form.elements.customerId.value;
    const c = data.customers.find(c => c.id === id);
    if (!c) { form.elements.customerId.reportValidity(); form.elements.customerId.focus(); return; }
    invalidate(); context = { fingerprint: fingerprint(), customerId: id };
    el('customer').textContent = 'Customer: ' + c.name;
    el('prompt').value = form.elements.scope.value; el('capacity').value = '';
    el('preview').replaceChildren(); el('error').textContent = '';
    dialog.showModal(); el('prompt').focus();
  };
  dialog.querySelector('.close').onclick = close; el('cancel').onclick = close;
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  dialog.addEventListener('close', invalidate);
  el('prompt').addEventListener('input', changed); el('capacity').addEventListener('input', changed);
  const originalOpen = window.openQuoteModal;
  window.openQuoteModal = function (...args) { if (dialog.open) close(); return originalOpen.apply(this, args); };
  window.addEventListener('popstate', () => { if (dialog.open) close(); });
  sb.auth.onAuthStateChange?.((event) => { if (['SIGNED_OUT', 'SIGNED_IN'].includes(event) && dialog.open) close(); });
  el('generate').onclick = async () => {
    if (busy) return;
    const prompt = el('prompt').value.trim(), capacity = el('capacity').value;
    if (!prompt) { el('error').textContent = 'Describe the work first.'; return; }
    if (!el('capacity').checkValidity()) { el('capacity').reportValidity(); return; }
    invalidate(); const token = generation; busy = true; el('generate').disabled = true;
    el('error').textContent = ''; el('preview').replaceChildren(); el('status').textContent = 'Preparing suggestions from your saved products…';
    controller = new AbortController();
    try {
      const { data: auth } = await sb.auth.getSession();
      if (token !== generation || !dialog.open) return;
      if (!auth.session) throw new Error('Please sign in to CS Energy.');
      context.owner = auth.session.user.id;
      const response = await fetch('/api/quote-draft', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + auth.session.access_token }, body: JSON.stringify({ customerId: context.customerId, prompt, capacityKw: capacity ? Number(capacity) : null }), signal: controller.signal });
      const result = await response.json();
      if (token !== generation || !dialog.open) return;
      if (!response.ok) throw new Error(result.error || 'Could not generate a draft. Please try again.');
      if (!result || !Array.isArray(result.lines)) throw new Error('Invalid draft response. Please try again.');
      draft = result;
      const preview = el('preview'); preview.className = 'ai-review';
      node('h3', draft.title || 'Suggested equipment', preview); node('p', draft.scope || '', preview);
      const table = node('table', '', preview), head = node('tr', '', node('thead', '', table));
      ['Equipment', 'Qty', 'Unit € ex IVA', 'Line € ex IVA'].forEach(t => node('th', t, head));
      const body = node('tbody', '', table);
      draft.lines.forEach(line => { const row = node('tr', '', body); [line.description, line.qty, eur(line.sell), eur(line.qty * line.sell)].forEach(t => node('td', t, row)); });
      const totals = quoteTotals(draft.lines);
      const summary = node('p', `Subtotal ${eur(totals.net)} · IVA 21% ${eur(totals.iva)} · Total ${eur(totals.total)}`, preview); summary.className = 'ai-totals';
      const warnings = node('ul', '', preview);
      [...(draft.warnings || []), ...(draft.missingItems || [])].forEach(t => node('li', t, warnings));
      node('p', 'Check the site survey, electrical design, product compatibility, labour and legalisation. Missing work is not included in this total. Adding lines does not save or send the quote.', preview);
      el('apply').hidden = !draft.lines.length;
      el('status').textContent = draft.lines.length ? 'Review the suggestions, then add them to your editable quote.' : 'No suitable priced products found. Update your price book or refine the description.';
    } catch (error) { if (token === generation && error.name !== 'AbortError') { el('error').textContent = error.message; el('status').textContent = ''; } }
    finally { if (token === generation) { busy = false; el('generate').disabled = false; } }
  };
  el('apply').onclick = async () => {
    if (!draft || busy) return;
    busy = true; el('apply').disabled = true;
    const token = generation, selected = draft;
    try {
      const { data: auth } = await sb.auth.getSession();
      if (token !== generation || !dialog.open) return;
      if (!auth.session || auth.session.user.id !== context.owner) throw new Error('Your sign-in changed. Close this draft and start again.');
      if (fingerprint() !== context.fingerprint) throw new Error('The quote changed. Close this draft and generate again for the current quote.');
      for (const line of selected.lines) {
        const product = data.products.find(p => p.id === line.productId);
        if (!product || productSell(product) !== line.sell || Number(product.cost || 0) !== line.cost) throw new Error('Product prices have changed or are not synced. Save/sync your price book and generate again.');
      }
      const before = rawLines();
      if (before.length === 1 && JSON.stringify(before[0]) === JSON.stringify(['', '', '1', '0', '0'])) document.getElementById('quoteLineBody').replaceChildren();
      selected.lines.forEach(addQuoteLine);
      if (!form.elements.scope.value.trim()) form.elements.scope.value = selected.scope || '';
      if (!form.elements.title.value.trim() || form.elements.title.value === 'Solar PV installation') form.elements.title.value = selected.title || form.elements.title.value;
      updateQuoteSummary(); close();
    } catch (error) { if (token === generation) el('error').textContent = error.message; }
    finally { busy = false; el('apply').disabled = false; }
  };
})();
