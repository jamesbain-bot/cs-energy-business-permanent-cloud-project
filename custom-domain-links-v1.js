(function(){
if(location.hostname==='my.csenergy.solar'&&new URLSearchParams(location.search).get('customerapp')==='1'){
  try{history.replaceState({},document.title,'/')}catch(e){}
}
window.copyCustomerAppLink=function(){
  const link='https://my.csenergy.solar/';
  navigator.clipboard?.writeText(link);
  alert('Customer app link copied: '+link);
};
window.copyPortalLink=window.copyCustomerAppLink;
})();

/* CS Energy standalone facturas, v1.2, 6 October 2026.
 * Additive extension: preserves the existing domain links above and uses the
 * existing customerInvoices store and save()/cloud-sync path. No schema change.
 * This file is already included twice by index.html, so installation is guarded.
 */
(function () {
  'use strict';
  if (window.CSStandaloneInvoices) return;
  const $ = id => document.getElementById(id);
  const h = value => esc(value == null ? '' : value);
  const normal = value => String(value || '').trim().replace(/\s+/g, ' ').toUpperCase();
  const cents = n => Math.round((Number(n) + Number.EPSILON) * 100);
  const money = n => eur(Number.isFinite(Number(n)) ? Number(n) : 0);
  let submitting = false, submitted = false, returnFocus = null;
  const invoices = () => data.customerInvoices || [];
  function today() {
    const parts = new Intl.DateTimeFormat('en-GB', {timeZone:'Europe/Madrid', year:'numeric', month:'2-digit', day:'2-digit'}).formatToParts(new Date());
    const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}`;
  }
  function invoiceNumbers() {
    return invoices().map(x => x.invoiceNumber).concat((data.quotes || []).map(x => x.invoiceNo)).filter(Boolean);
  }
  function nextNumber() {
    const year = today().slice(0, 4), pattern = new RegExp('^' + year + '-(\\d+)$');
    const max = invoiceNumbers().reduce((n, ref) => {
      const match = String(ref).trim().match(pattern);
      return match ? Math.max(n, Number(match[1])) : n;
    }, 0);
    return `${year}-${String(max + 1).padStart(4, '0')}`;
  }
  function button(text, action, cls = 'ghost') {
    const b = document.createElement('button');
    b.type = 'button'; b.className = cls; b.textContent = text; b.onclick = action;
    return b;
  }
  function field(id, label, type = 'text', attributes = '') {
    return `<div class="field"><label for="${id}">${label}</label><input id="${id}" type="${type}" ${attributes}></div>`;
  }
  function error(message) { $('sfError').textContent = message; $('sfError').hidden = !message; }
  // Use the same billing fields for existing customers and new customers.
  // Older imports sometimes used nie/nif rather than the canonical taxId.
  const customerFields = {
    name:'sfNewName', taxId:'sfNewTax', address:'sfNewAddress', location:'sfNewLocation',
    postalCode:'sfNewPostcode', province:'sfNewProvince', country:'sfNewCountry',
    email:'sfNewEmail', phone:'sfNewPhone'
  };
  function customerDetails(record = {}) {
    const value = (...keys) => {
      for (const key of keys) {
        const v = record?.[key];
        if ((typeof v === 'string' || typeof v === 'number') && String(v).trim()) return String(v).trim();
      }
      return '';
    };
    return {
      name:value('name','customerName','customer_name','companyName'),
      taxId:value('taxId','nie','NIE','nif','NIF','cif','CIF','tax_id','customer_tax_id','vatNumber'),
      address:value('address','billingAddress','billing_address','streetAddress','customer_address'),
      location:value('location','town','city','municipality'),
      postalCode:value('postalCode','postcode','postCode','postal_code','zipCode','zip'),
      province:value('province','region','state'), country:value('country'),
      email:value('email','customer_email'), phone:value('phone','telephone','mobile','customer_phone')
    };
  }
  function readCustomerDetails() {
    return Object.fromEntries(Object.entries(customerFields).map(([key,id]) => [key,$(id).value.trim()]));
  }
  function setCustomerMode() {
    const selected = $('sfCustomer').value, isNew = selected === '__new__';
    const c = data.customers.find(x => x.id === selected), details = customerDetails(c);
    $('sfNewCustomer').hidden = !selected;
    for (const [key,id] of Object.entries(customerFields)) {
      $(id).disabled = !selected;
      $(id).value = details[key];
    }
    $('sfCustomerDetails').textContent = selected ? (isNew
      ? 'Enter the customer details below. Name, NIE / NIF / CIF and full billing address are required.'
      : 'Check the details below. They will appear on this factura. Name, NIE / NIF / CIF and full billing address are required.') : '';
    $('sfUpdateCustomerRow').hidden = !c;
    $('sfUpdateCustomer').disabled = !c;
    $('sfUpdateCustomer').checked = false;
    error('');
  }
  function customerForInvoice(inv) {
    const stored = inv.customerSnapshot;
    const current = customerDetails(data.customers.find(x => x.id === inv.customerId));
    if (!stored) return current;
    const snapshot = customerDetails(stored);
    // New invoices freeze all customer fields. Old incomplete snapshots may use
    // current data only for fields that were empty, never replacing stored details.
    if (inv.customerDetailsVersion >= 2) return snapshot;
    return Object.fromEntries(Object.keys(snapshot).map(key => [key,snapshot[key] || current[key]]));
  }
  function customerBlock(record) {
    const c = customerDetails(record);
    const detailsRow = (label,value,required = false) => value || required
      ? `<tr><th scope="row" style="width:150px;text-align:left;vertical-align:top;padding:5px 12px 5px 0;border:0;font-weight:600">${label}</th><td style="padding:5px 0;border:0;white-space:pre-wrap;overflow-wrap:anywhere">${h(value || 'Not recorded')}</td></tr>` : '';
    return `<section class="sf-billing-details" style="break-inside:avoid;margin:18px 0"><h2>Customer details / Datos del cliente</h2><table aria-label="Customer billing details" style="width:100%;border-collapse:collapse;margin:0">${detailsRow('Name / Nombre',c.name,true)}${detailsRow('NIE / NIF / CIF',c.taxId,true)}${detailsRow('Address / Dirección',c.address,true)}${detailsRow('Postcode / C. postal',c.postalCode)}${detailsRow('Town / Localidad',c.location)}${detailsRow('Province / Provincia',c.province)}${detailsRow('Country / País',c.country)}${detailsRow('Email',c.email)}${detailsRow('Phone / Teléfono',c.phone)}</table></section>`;
  }
  function addLine(line = {}) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><input class="sf-desc" aria-label="Description" maxlength="2000" required placeholder="Work, equipment or service" value="${h(line.description)}"></td>
      <td><input class="sf-qty" aria-label="Quantity" type="number" min="0.01" max="1000000" step="0.01" required value="${Number(line.quantity ?? 1)}"></td>
      <td><input class="sf-unit" aria-label="Unit price excluding IVA" type="number" min="0" max="100000000" step="0.01" required value="${Number(line.unitPriceNet ?? 0)}"></td>
      <td><input class="sf-tax" aria-label="IVA percentage" type="number" min="0" max="100" step="0.01" required value="${Number(line.taxRate ?? 21)}"></td>
      <td class="sf-total money"></td><td></td>`;
    tr.lastElementChild.appendChild(button('×', () => { tr.remove(); updateTotals(); }, 'iconbtn'));
    tr.lastElementChild.firstChild.setAttribute('aria-label', 'Remove invoice item');
    tr.querySelectorAll('input').forEach(x => x.addEventListener('input', updateTotals));
    $('sfLines').appendChild(tr); updateTotals();
  }
  function readLines() {
    return [...$('sfLines').rows].map(tr => {
      const quantity = Number(tr.querySelector('.sf-qty').value), unitPriceNet = Number(tr.querySelector('.sf-unit').value), taxRate = Number(tr.querySelector('.sf-tax').value);
      const lineTotalNet = cents(quantity * unitPriceNet) / 100;
      return {description:tr.querySelector('.sf-desc').value.trim(), quantity, unitPriceNet, taxRate, lineTotalNet, ivaAmount:cents(lineTotalNet * taxRate / 100) / 100};
    });
  }
  function totals(lines) {
    const net = lines.reduce((n, x) => n + cents(x.lineTotalNet), 0), vat = lines.reduce((n, x) => n + cents(x.ivaAmount), 0);
    return {subtotalNet:net / 100, ivaAmount:vat / 100, totalGross:(net + vat) / 100};
  }
  function updateTotals() {
    const lines = readLines(), t = totals(lines);
    [...$('sfLines').rows].forEach((tr, i) => { tr.querySelector('.sf-total').textContent = money(lines[i].lineTotalNet); });
    $('sfTotals').innerHTML = `<div class="sum"><small>Base imponible</small><strong>${money(t.subtotalNet)}</strong></div><div class="sum"><small>IVA</small><strong>${money(t.ivaAmount)}</strong></div><div class="sum"><small>Total incl. IVA</small><strong>${money(t.totalGross)}</strong></div>`;
  }
  function open(customerId) {
    if (!cloudSession?.user || $('app')?.classList.contains('hidden')) return alert('Please sign in to the back office first.');
    returnFocus = document.activeElement;
    $('sfForm').reset(); submitting = false; submitted = false; $('sfSave').disabled = false; error('');
    const select = $('sfCustomer');
    select.innerHTML = '<option value="">Choose customer…</option><option value="__new__">+ New customer — enter details below</option>';
    [...data.customers].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))).forEach(c => select.add(new Option(c.name + (c.location ? ' — ' + c.location : ''), c.id)));
    if (customerId && data.customers.some(c => c.id === customerId)) select.value = customerId;
    setCustomerMode(); $('sfNumber').value = nextNumber(); $('sfDate').value = today();
    $('sfLines').innerHTML = ''; addLine();
    $('standaloneFacturaModal').classList.add('open'); select.focus();
  }
  function close() { $('standaloneFacturaModal').classList.remove('open'); returnFocus?.focus?.(); }
  function snapshotCustomer(c) { return customerDetails(c); }
  function snapshotCompany() {
    return Object.fromEntries(['companyName','companyAddress','companyTaxId','companyWeb','companyPhone','companyBank','bankAccountHolder','bankIban','bankBic','bankIban2','bankBic2','bankPaymentNote','invoiceFooter'].map(k => [k, data.settings[k] || '']));
  }
  function saveInvoice(event) {
    event.preventDefault(); if (submitting || submitted) return;
    error('');
    if (!cloudSession?.user || $('app')?.classList.contains('hidden')) return error('Please sign in before saving.');
    if (!$('sfForm').reportValidity()) return;
    const invoiceNumber = $('sfNumber').value.trim(), invoiceDate = $('sfDate').value, dueDate = $('sfDue').value, lines = readLines();
    if (!invoiceNumber) return error('Enter a factura number.');
    if (invoiceNumbers().some(x => normal(x) === normal(invoiceNumber))) return error(`Factura number ${invoiceNumber} is already in use. Enter a different number.`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(invoiceDate)) return error('Choose an invoice date.');
    if (dueDate && dueDate < invoiceDate) return error('Payment due date cannot be before the invoice date.');
    if (!lines.length || lines.some(x => !x.description || ![x.quantity,x.unitPriceNet,x.taxRate,x.lineTotalNet,x.ivaAmount].every(Number.isFinite) || x.quantity <= 0 || x.unitPriceNet < 0 || x.taxRate < 0 || x.taxRate > 100)) return error('Add at least one complete invoice item with a positive quantity and valid price and IVA.');
    const selectedId = $('sfCustomer').value, details = readCustomerDetails();
    if (!details.name) return error('Enter the customer / business name.');
    if (!details.taxId) return error('Enter the customer NIE / NIF / CIF.');
    if (!details.address) return error('Enter the full customer billing address.');
    let c = data.customers.find(x => x.id === selectedId), newCustomer = null, updatedCustomer = null;
    if (selectedId === '__new__') {
      const match = data.customers.find(x => {
        const existing = customerDetails(x);
        return (details.taxId && normal(existing.taxId) === normal(details.taxId)) || (details.email && normal(existing.email) === normal(details.email));
      });
      if (match) { $('sfCustomer').value = match.id; setCustomerMode(); return error(`An existing customer matches those details: ${match.name}. They are now selected. Check and save again.`); }
      newCustomer = c = {id:uid('c_'),...details,plan:'No care plan',nextService:'',notes:'',portalEnabled:false,createdAt:new Date().toISOString()};
    } else if (c && $('sfUpdateCustomer').checked) {
      updatedCustomer = {...c,...details,updatedAt:new Date().toISOString()};
    }
    if (!c) return error('Choose or add a customer.');
    const t = totals(lines);
    if (!Object.values(t).every(Number.isFinite) || cents(t.totalGross) > Number.MAX_SAFE_INTEGER) return error('Invoice total is too large.');
    const inv = {id:uid('cinv_'),source:'standalone',customerId:c.id,customerSnapshot:snapshotCustomer(details),customerDetailsVersion:2,companySnapshot:snapshotCompany(),invoiceNumber,invoiceDate,dueDate,currency:'EUR',lines,...t,ivaRate:new Set(lines.map(x => x.taxRate)).size === 1 ? lines[0].taxRate : null,paymentStatus:$('sfStatus').value,notes:$('sfNotes').value.trim(),showLinePrices:$('sfShowPrices').checked,createdAt:new Date().toISOString()};
    submitting = true; $('sfSave').disabled = true;
    const oldInvoices = data.customerInvoices, oldCustomers = data.customers;
    try {
      data.customerInvoices = [...invoices(), inv];
      if (newCustomer) data.customers = [...data.customers, newCustomer];
      else if (updatedCustomer) data.customers = data.customers.map(x => x.id === updatedCustomer.id ? updatedCustomer : x);
      save(); // Existing local persistence and automatic cloud synchronization.
    } catch (e) {
      data.customerInvoices = oldInvoices; data.customers = oldCustomers;
      submitting = false; $('sfSave').disabled = false;
      return error('The factura could not be saved: ' + (e.message || 'Please try again.'));
    }
    submitted = true; submitting = false; close();
    try { render(); } catch (e) { console.error('Factura saved, but the display could not refresh.', e); }
    closeModal('customerDetailModal'); switchView('facturas'); view(inv.id);
  }
  function banks(co, ref) {
    const account = (label, iban, bic) => iban ? `<p><strong>${label}</strong><br>IBAN: ${h(iban)}${bic ? '<br>BIC / SWIFT: ' + h(bic) : ''}</p>` : '';
    const accounts = account('Option 1',co.bankIban,co.bankBic) + account('Option 2',co.bankIban2,co.bankBic2);
    if (!accounts && !co.companyBank) return '';
    return `<h2>Payment details</h2>${co.bankAccountHolder ? '<p>Account holder: <strong>' + h(co.bankAccountHolder) + '</strong></p>' : ''}${accounts || '<p>' + h(co.companyBank).replace(/\n/g,'<br>') + '</p>'}<p><strong>Payment reference:</strong> ${h(ref)}</p>${co.bankPaymentNote ? '<p>' + h(co.bankPaymentNote).replace(/\n/g,'<br>') + '</p>' : ''}`;
  }
  function invoiceHtml(inv) {
    const c = customerForInvoice(inv), co = inv.companySnapshot || data.settings;
    const logo = data.settings.companyLogo || (typeof DEFAULT_COMPANY_LOGO !== 'undefined' ? DEFAULT_COMPANY_LOGO : '');
    const groups = new Map();
    (inv.lines || []).forEach(l => { const rate = Number(l.taxRate), g = groups.get(rate) || {net:0,vat:0}; g.net += cents(l.lineTotalNet); g.vat += cents(l.ivaAmount); groups.set(rate,g); });
    const rows = (inv.lines || []).map(l => `<tr><td style="white-space:pre-wrap;overflow-wrap:anywhere">${h(l.description)}</td><td>${Number(l.quantity)}</td>${inv.showLinePrices ? `<td>${money(l.unitPriceNet)}</td><td>${Number(l.taxRate)}%</td><td>${money(l.lineTotalNet)}</td>` : ''}</tr>`).join('');
    return `<div class="doc-report sf-document"><div style="display:flex;justify-content:space-between;gap:28px;align-items:flex-start"><div>${logo ? `<img src="${h(logo)}" alt="${h(co.companyName || 'CS Energy')}" style="width:300px;max-width:100%;max-height:125px;object-fit:contain;object-position:left center;margin-bottom:14px">` : '<h1>' + h(co.companyName || 'CS Energy') + '</h1>'}<p>${h(co.companyAddress).replace(/\n/g,'<br>')}<br>${h(co.companyTaxId)}<br>${h(co.companyWeb)} ${h(co.companyPhone)}</p></div><div style="text-align:right;padding-top:8px"><strong>FACTURA</strong><br>${h(inv.invoiceNumber)}<br>${prettyDate(inv.invoiceDate)}${inv.dueDate ? '<br>Due: ' + prettyDate(inv.dueDate) : ''}</div></div>
      ${customerBlock(c)}
      <table><thead><tr><th>Description</th><th>Qty</th>${inv.showLinePrices ? '<th>Unit ex IVA</th><th>IVA</th><th>Total ex IVA</th>' : ''}</tr></thead><tbody>${rows}</tbody></table>
      <p style="text-align:right">Base imponible ${money(inv.subtotalNet)}${[...groups.entries()].map(([rate,g]) => `<br>IVA ${rate}%${groups.size > 1 ? ' on ' + money(g.net / 100) : ''}: ${money(g.vat / 100)}`).join('')}<br><span class="total">TOTAL ${money(inv.totalGross)}</span></p>
      <p><strong>Payment status:</strong> ${h(inv.paymentStatus || 'Unpaid')}</p>${inv.notes ? '<p style="white-space:pre-wrap">' + h(inv.notes) + '</p>' : ''}${banks(co,inv.invoiceNumber)}${co.invoiceFooter ? '<p>' + h(co.invoiceFooter).replace(/\n/g,'<br>') + '</p>' : ''}</div>`;
  }
  function view(id) {
    const inv = invoices().find(x => x.id === id); if (!inv) return;
    if (inv.source !== 'standalone') {
      if (inv.source === 'job' && typeof viewJobInvoice === 'function') { viewJobInvoice(id); $('reportPrintHost').innerHTML = $('businessDocContent').innerHTML; }
      else viewImportedCustomerInvoice(id);
      return;
    }
    const html = invoiceHtml(inv);
    $('businessDocTitle').textContent = 'Factura ' + inv.invoiceNumber;
    $('businessDocContent').innerHTML = html; $('reportPrintHost').innerHTML = html;
    $('businessDocModal').classList.add('open');
  }
  function renderList() {
    const host = $('sfInvoiceList'); if (!host) return;
    const query = $('sfSearch').value.trim().toLowerCase(), filter = $('sfFilter').value;
    const list = [...invoices()].filter(inv => (filter === 'all' || (inv.paymentStatus || 'Unknown') === filter) && [inv.invoiceNumber,inv.customerSnapshot?.name || customer(inv.customerId).name,inv.notes].join(' ').toLowerCase().includes(query)).sort((a,b) => String(b.invoiceDate || '').localeCompare(String(a.invoiceDate || '')) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    host.innerHTML = '';
    if (!list.length) { host.innerHTML = '<tr><td colspan="7" class="empty">No facturas found. Create one directly without a quote or job.</td></tr>'; return; }
    list.forEach(inv => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td class="name">${h(inv.invoiceNumber || 'Invoice')}</td><td>${h(inv.customerSnapshot?.name || customer(inv.customerId).name)}</td><td>${prettyDate(inv.invoiceDate)}</td><td>${money(inv.totalGross)}</td><td>${h(inv.paymentStatus || 'Not recorded')}</td><td>${inv.source === 'standalone' ? 'Standalone' : inv.source === 'job' ? 'Job' : 'Imported PDF'}</td><td class="actions"></td>`;
      tr.lastElementChild.appendChild(button('Open / PDF', () => view(inv.id), 'iconbtn')); host.appendChild(tr);
    });
  }
  function install() {
    if ((typeof CUSTOMER_APP_MODE !== 'undefined' && CUSTOMER_APP_MODE) || /^(my|engineer)\.csenergy\.solar$/.test(location.hostname) || !document.querySelector('#app main')) return;
    const style = document.createElement('style');
    style.textContent = `#standaloneFacturaModal{z-index:65}#standaloneFacturaModal [hidden]{display:none!important}#sfNewCustomer{margin:14px 0}#sfCustomerDetails{margin-bottom:12px}#sfError{padding:12px;border:1px solid var(--red);border-radius:10px;color:var(--red);margin-top:12px}#standaloneFacturaModal .quote-lines{min-width:680px}#sfLines .sf-desc{min-width:200px}#sfLines .sf-total{white-space:nowrap}#facturas{min-width:0}#sfSearch{min-width:0;flex:1 1 210px}#facturas .table-wrap{max-width:100%}.sf-create{display:inline-block!important}.sf-document tr{break-inside:avoid}.sf-document thead{display:table-header-group}@media print{html,body{background:#fff!important}}@media(max-width:640px){#facturas .top{flex-wrap:wrap}#facturas .toolbar{flex-wrap:wrap}#standaloneFacturaModal .quote-lines{min-width:0}#standaloneFacturaModal .quote-lines thead{display:none}#sfLines,#sfLines tr,#sfLines td{display:block}#sfLines tr{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:12px 0;border-bottom:1px solid var(--line)}#sfLines td{padding:0;border:0;min-width:0}#sfLines td:first-child{grid-column:1/-1}#sfLines input{min-width:0;width:100%}#sfLines td:before{display:block;color:var(--muted);font-size:12px;margin-bottom:5px}#sfLines td:nth-child(1):before{content:'Description'}#sfLines td:nth-child(2):before{content:'Quantity'}#sfLines td:nth-child(3):before{content:'Unit ex IVA €'}#sfLines td:nth-child(4):before{content:'IVA %'}#sfLines td:nth-child(5):before{content:'Total ex IVA'}#sfLines td:last-child{grid-column:1/-1;text-align:right}#standaloneFacturaModal .formactions{flex-wrap:wrap}}`;
    document.head.appendChild(style);
    const section = document.createElement('section'); section.id = 'facturas'; section.className = 'view';
    section.innerHTML = '<div class="top"><div><div class="eyebrow">Customer invoices</div><h1>Facturas</h1><p>Create a factura directly — no quote, job or installation required.</p></div></div><div class="toolbar"><input id="sfSearch" class="search" aria-label="Search facturas" placeholder="Search factura or customer…"><select id="sfFilter" class="filter" aria-label="Payment status"><option value="all">All payment statuses</option><option>Unpaid</option><option>Part Paid</option><option>Paid</option></select></div><div class="card table-wrap"><table class="table"><thead><tr><th>Factura</th><th>Customer</th><th>Date</th><th>Total incl. IVA</th><th>Payment</th><th>Source</th><th></th></tr></thead><tbody id="sfInvoiceList"></tbody></table></div>';
    section.querySelector('.top').appendChild(button('+ Create factura', () => open(), 'primary sf-create'));
    document.querySelector('#app main').appendChild(section);
    const nav = document.querySelector('.side nav');
    if (nav) { const b = button('🧾 Facturas', () => switchView('facturas'), 'navbtn'); b.dataset.view = 'facturas'; const quote = nav.querySelector('[data-view="quotes"]'); quote ? quote.after(b) : nav.appendChild(b); }
    const quoteTop = document.querySelector('#quotes .top');
    if (quoteTop) { let actions = quoteTop.querySelector('.btnrow'); if (!actions) { actions = document.createElement('div'); actions.className = 'btnrow'; const old = quoteTop.querySelector('button.primary'); if (old) actions.appendChild(old); quoteTop.appendChild(actions); } actions.appendChild(button('+ Create factura', () => open(), 'ghost sf-create')); actions.appendChild(button('View facturas', () => switchView('facturas'), 'ghost sf-create')); }
    document.querySelector('#customers .top .btnrow')?.appendChild(button('+ Create factura', () => open(), 'ghost sf-create'));
    const modal = document.createElement('div'); modal.id = 'standaloneFacturaModal'; modal.className = 'modal'; modal.setAttribute('role','dialog'); modal.setAttribute('aria-modal','true'); modal.setAttribute('aria-labelledby','sfTitle');
    modal.innerHTML = `<div class="modalbox wide"><div class="modaltop"><h2 id="sfTitle">Create factura</h2><button type="button" class="close" id="sfClose" aria-label="Close factura form">×</button></div><p class="muted">This creates an invoice only — not a quote, job or system.</p><form id="sfForm"><div class="formgrid"><div class="field full"><label for="sfCustomer">Customer</label><select id="sfCustomer" required></select><small class="muted" id="sfCustomerDetails"></small></div></div><div id="sfNewCustomer" hidden><h3>Customer billing details</h3><div class="formgrid">${field('sfNewName','Customer / business name *','text','required maxlength="200" autocomplete="organization"')}${field('sfNewTax','NIE / NIF / CIF *','text','required maxlength="50"')}<div class="field full"><label for="sfNewAddress">Full billing address *</label><textarea id="sfNewAddress" required maxlength="1000" autocomplete="street-address" placeholder="Street, building / house number, apartment or rural address"></textarea></div>${field('sfNewPostcode','Postcode','text','maxlength="30" autocomplete="postal-code"')}${field('sfNewLocation','Town / location','text','maxlength="200" autocomplete="address-level2"')}${field('sfNewProvince','Province / region','text','maxlength="200" autocomplete="address-level1"')}${field('sfNewCountry','Country','text','maxlength="100" autocomplete="country-name"')}${field('sfNewEmail','Email','email','maxlength="254" autocomplete="email"')}${field('sfNewPhone','Phone','tel','maxlength="50" autocomplete="tel"')}</div><label id="sfUpdateCustomerRow" style="display:flex;gap:8px;align-items:center;margin:12px 0"><input id="sfUpdateCustomer" type="checkbox">Also update the saved customer record with these details</label><p class="meta">All entered details appear on the factura. Changes apply to this factura only unless the box above is ticked.</p></div><div class="formgrid">${field('sfNumber','Factura number','text','required maxlength="100"')}${field('sfDate','Invoice date','date','required')}${field('sfDue','Payment due date (optional)','date')}<div class="field"><label for="sfStatus">Payment status</label><select id="sfStatus"><option>Unpaid</option><option>Part Paid</option><option>Paid</option></select></div></div><div class="section-head" style="margin-top:18px"><h2>Invoice items</h2><button type="button" class="ghost" id="sfAddLine">+ Add line</button></div><div class="table-wrap"><table class="quote-lines"><thead><tr><th>Description</th><th>Qty</th><th>Unit ex IVA €</th><th>IVA %</th><th>Total ex IVA</th><th></th></tr></thead><tbody id="sfLines"></tbody></table></div><div id="sfTotals" class="quote-summary" aria-live="polite"></div><div class="field" style="margin-top:14px"><label for="sfNotes">Notes (shown on factura)</label><textarea id="sfNotes" maxlength="6000"></textarea></div><label style="display:flex;gap:8px;align-items:center;margin-top:12px"><input id="sfShowPrices" type="checkbox">Show individual item prices on PDF</label><p class="meta">Unticked: show descriptions, quantities and invoice totals only. Bank details come from Settings.</p><div id="sfError" role="alert" hidden></div><div class="formactions"><button type="button" class="ghost" id="sfCancel">Cancel</button><button type="submit" class="primary" id="sfSave">Save factura & open document</button></div></form></div>`;
    document.body.appendChild(modal);
    $('sfClose').onclick = close; $('sfCancel').onclick = close; $('sfCustomer').onchange = setCustomerMode; $('sfAddLine').onclick = () => addLine(); $('sfForm').onsubmit = saveInvoice; $('sfSearch').oninput = renderList; $('sfFilter').onchange = renderList;
    modal.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      if (event.key === 'Tab') { const items = [...modal.querySelectorAll('button,input,select,textarea')].filter(x => !x.disabled && x.getClientRects().length), first = items[0], last = items[items.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } }
    });
    const oldRender = window.render;
    window.render = function () { const r = oldRender.apply(this,arguments); renderList(); return r; };
    const oldSwitch = window.switchView;
    window.switchView = function (id) { const r = oldSwitch.apply(this,arguments); if (id === 'facturas') renderList(); return r; };
    const oldFab = window.openContextFab;
    window.openContextFab = function () { if (document.querySelector('.view.active')?.id === 'facturas') return open(); return oldFab.apply(this,arguments); };
    const oldFabView = window.updateFabForView;
    window.updateFabForView = function (id) { const r = oldFabView.apply(this,arguments); if (id === 'facturas') $('fab')?.classList.remove('hidden'); return r; };
    const oldCustomer = window.openCustomerDetail;
    window.openCustomerDetail = function (id) { const r = oldCustomer.apply(this,arguments), host = $('customerDetailBody'); if (host && !host.querySelector('.sf-customer-create')) { const actions = document.createElement('div'); actions.className = 'btnrow sf-customer-create'; actions.style.marginBottom = '14px'; actions.appendChild(button('+ Create factura', () => open(id), 'primary')); host.prepend(actions); } return r; };
    // Keep the existing job-invoice route from reusing a standalone number.
    const oldJobOpen = window.openJobInvoice, oldJobSave = window.saveJobInvoice;
    if (typeof oldJobOpen === 'function') window.openJobInvoice = function (jobId) {
      const existing = invoices().some(x => x.jobId === jobId && x.source === 'job');
      const result = oldJobOpen.apply(this, arguments);
      if (!existing && $('jobInvoiceModal')?.classList.contains('open') && $('jobInvNumber')) $('jobInvNumber').value = nextNumber();
      return result;
    };
    if (typeof oldJobSave === 'function') window.saveJobInvoice = function () {
      const number = $('jobInvNumber')?.value.trim();
      if (number && invoiceNumbers().some(x => normal(x) === normal(number))) return alert('Factura number ' + number + ' is already in use. Enter a different number.');
      return oldJobSave.apply(this, arguments);
    };
    // Existing job/quote-generated facturas also use the explicit billing block.
    // Never rewrite imported original PDF files, only the in-app invoice preview.
    const oldDocHeader = window.docHeader;
    if (typeof oldDocHeader === 'function') window.docHeader = function (type,q,c,docRef) {
      const html = oldDocHeader.apply(this,arguments);
      if (!/factura|invoice/i.test(String(type))) return html;
      const holder = document.createElement('div'); holder.innerHTML = html;
      const heading = [...holder.querySelectorAll('h2')].find(x => /^customer$/i.test(x.textContent.trim()));
      if (!heading || heading.nextElementSibling?.tagName !== 'P') return html;
      heading.nextElementSibling.remove();
      const fragment = document.createElement('div'); fragment.innerHTML = customerBlock(c);
      heading.replaceWith(fragment.firstElementChild);
      return holder.innerHTML;
    };
    const oldImported = window.viewImportedCustomerInvoice;
    window.viewImportedCustomerInvoice = function (id) {
      const inv = invoices().find(x => x.id === id);
      if (inv?.source === 'standalone') return view(id);
      const result = oldImported.apply(this,arguments);
      if (inv && $('businessDocContent')) {
        const heading = [...$('businessDocContent').querySelectorAll('h2')].find(x => /^customer$/i.test(x.textContent.trim()));
        if (heading && heading.nextElementSibling?.tagName === 'P') {
          heading.nextElementSibling.remove();
          const fragment = document.createElement('div'); fragment.innerHTML = customerBlock(customerForInvoice(inv));
          heading.replaceWith(fragment.firstElementChild);
          $('reportPrintHost').innerHTML = $('businessDocContent').innerHTML;
        }
      }
      return result;
    };
    const oldJobView = window.viewJobInvoice;
    if (typeof oldJobView === 'function') window.viewJobInvoice = function (id) {
      const result = oldJobView.apply(this,arguments);
      if (invoices().some(x => x.id === id) && $('businessDocContent') && $('reportPrintHost')) $('reportPrintHost').innerHTML = $('businessDocContent').innerHTML;
      return result;
    };
    renderList();
  }
  window.CSStandaloneInvoices = {version:'1.2.0',open,view,render:renderList};
  window.openStandaloneInvoice = open;
  window.viewStandaloneInvoice = view;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',install,{once:true}); else install();
})();
