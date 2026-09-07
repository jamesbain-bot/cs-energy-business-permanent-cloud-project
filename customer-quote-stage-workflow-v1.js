// CS Energy Customer Portal Stage Workflow v1
// Quote/contract first, then owner unlocks full customer app.
(function(){
  const originalPortalSnapshotPayload=window.portalSnapshotPayload;
  const originalRenderCustomerPortalHome=window.renderCustomerPortalHome;
  const originalOpenCustomerDetail=window.openCustomerDetail;
  const originalOpenQuoteDetail=window.openQuoteDetail;

  function latestQuoteForCustomer(id){
    return [...(data.quotes||[])].filter(q=>q.customerId===id).sort((a,b)=>(b.date||'').localeCompare(a.date||''))[0]||null;
  }

  function customerQuoteSnapshot(c){
    const q=latestQuoteForCustomer(c.id);
    if(!q)return null;
    const t=quoteTotals(q.lines||[]);
    return {
      id:q.id,ref:q.ref,date:q.date,title:q.title||'Solar PV installation',
      scope:q.scope||'',status:q.status||'Draft',depositPct:Number(q.depositPct||50),
      acceptedAt:q.acceptedAt||'',signerName:q.signerName||'',
      totalNet:Number(t.net||0),iva:Number(t.iva||0),total:Number(t.total||0),
      lines:(q.lines||[]).map(l=>({description:l.description,qty:l.qty})),
      contractTerms:data.settings.contractTerms||''
    };
  }

  window.portalSnapshotPayload=function(c){
    const base=originalPortalSnapshotPayload?originalPortalSnapshotPayload(c):{};
    return {
      ...base,
      portalStage:c.portalFullAccess?'full':'quote',
      quote:customerQuoteSnapshot(c)
    };
  };

  async function syncQuoteActionsToBusiness(){
    if(!cloudSession||CUSTOMER_APP_MODE)return;
    try{
      const {data:rows,error}=await sb.from('customer_quote_actions')
        .select('*').order('created_at',{ascending:true}).limit(200);
      if(error)throw error;
      let changed=false;
      (rows||[]).forEach(r=>{
        const q=(data.quotes||[]).find(x=>x.id===r.quote_id);
        if(!q)return;
        if(r.action==='accepted'&&!q.acceptedAt){
          q.status='Accepted'; q.acceptedAt=r.created_at; changed=true;
        }
        if(r.action==='contract_signed'){
          q.status='Accepted';
          q.acceptedAt=r.created_at;
          q.signerName=r.signer_name||q.signerName||'';
          q.signature=r.signature_data||q.signature||'';
          changed=true;
        }
      });
      if(changed){save(); renderQuotes?.();}
    }catch(e){console.warn('Quote action sync failed',e)}
  }
  window.syncCustomerQuoteActions=syncQuoteActionsToBusiness;

  window.toggleFullCustomerPortal=async function(id){
    const c=customer(id);
    if(!c?.id)return;
    c.portalFullAccess=!c.portalFullAccess;
    save();
    try{await syncPortalCustomer(c)}catch(e){console.error(e);return alert('Could not update customer app: '+(e.message||e))}
    openCustomerDetail(id);
    alert(c.portalFullAccess?'Full customer app unlocked.':'Customer app limited to quote + contract.');
  };

  function addStageButton(id){
    const body=document.getElementById('customerDetailBody');
    if(!body||body.querySelector('.cs-portal-stage-btn'))return;
    const c=customer(id);
    const b=document.createElement('button');
    b.className='mini cs-portal-stage-btn';
    b.style.margin='0 8px 14px 0';
    b.textContent=c.portalFullAccess?'🔒 Limit to quote + contract':'🔓 Unlock full customer app';
    b.onclick=()=>toggleFullCustomerPortal(id);
    body.prepend(b);
  }

  if(typeof originalOpenCustomerDetail==='function'){
    window.openCustomerDetail=function(id){
      const r=originalOpenCustomerDetail.apply(this,arguments);
      setTimeout(()=>addStageButton(id),0);
      return r;
    };
  }

  function eur2(v){return '€'+Number(v||0).toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2})}
  function qDate(s){return s?new Date(s+'T12:00:00').toLocaleDateString('en-GB'):'—'}

  function contractTerms(q,p){
    const c=p.customer||{};
    return `
      <div class="customer-app-card">
        <h2>Solar Installation Agreement</h2>
        <p class="customer-card-sub">Please read this agreement before signing.</p>
        <div class="kv"><span>Quotation</span><strong>${esc(q.ref||'')}</strong></div>
        <div class="kv"><span>Customer</span><strong>${esc(c.name||'')}</strong></div>
        <div class="kv"><span>Address</span><strong>${esc(c.address||c.location||'')}</strong></div>
        <div class="kv"><span>Total</span><strong>${eur2(q.total)} incl. IVA</strong></div>
        <h3 style="margin-top:20px">1. Contract works</h3><p>The Installer will supply, install, configure, test, commission and hand over the equipment and works listed in quotation ${esc(q.ref||'')}.</p>
        <h3>2. Contract price</h3><p>${eur2(q.totalNet)} excluding IVA, plus ${eur2(q.iva)} IVA, total ${eur2(q.total)} including IVA.</p>
        <h3>3. Payment terms</h3><p>${Number(q.depositPct||50)}% deposit on acceptance. Remaining balance due on completion and commissioning unless otherwise agreed in writing.</p>
        <h3>4. Installation and access</h3><p>The customer will provide reasonable property, roof and electrical access and disclose known hazards or restrictions.</p>
        <h3>5. Design and equipment</h3><p>Final layout and protective equipment are confirmed from site conditions and manufacturer requirements. Material substitutions will be equivalent or better and agreed with the customer.</p>
        <h3>6. Variations and unforeseen work</h3><p>Work outside the agreed scope or hidden defects will be discussed and priced separately before proceeding, except work required to make the installation immediately safe.</p>
        <h3>7. Existing electrical installation</h3><p>Rectification of pre-existing electrical faults or non-compliant wiring is excluded unless specifically stated.</p>
        <h3>8. Monitoring and internet</h3><p>Remote monitoring depends on a suitable internet connection and continued manufacturer platform availability.</p>
        <h3>9. Warranties</h3><p>Manufacturer warranties apply. CS Energy provides workmanship support subject to normal exclusions. Mandatory Spanish consumer rights are unaffected.</p>
        <h3>10. Ownership and risk</h3><p>Title to supplied equipment remains with the Installer until all sums due are paid in full, to the extent permitted by law.</p>
        <h3>11. Permissions and third-party charges</h3><p>Items not expressly included in the quotation, such as licences, taxes, structural engineering, utility charges or grid upgrades, are excluded unless agreed in writing.</p>
        <h3>12. Cancellation</h3><p>Mandatory Spanish consumer cancellation rights remain unaffected.</p>
        ${q.contractTerms?`<h3>13. Additional terms</h3><p>${esc(q.contractTerms).replace(/\n/g,'<br>')}</p>`:''}
      </div>`;
  }

  function setupCustomerSignature(){
    const canvas=document.getElementById('customerQuoteSignature');
    if(!canvas)return;
    const ctx=canvas.getContext('2d');
    ctx.lineWidth=2;ctx.lineCap='round';ctx.strokeStyle='#111';
    let drawing=false;
    function point(e){const r=canvas.getBoundingClientRect(),t=e.touches?.[0]||e;return {x:(t.clientX-r.left)*(canvas.width/r.width),y:(t.clientY-r.top)*(canvas.height/r.height)}}
    const down=e=>{drawing=true;const p=point(e);ctx.beginPath();ctx.moveTo(p.x,p.y);e.preventDefault()};
    const move=e=>{if(!drawing)return;const p=point(e);ctx.lineTo(p.x,p.y);ctx.stroke();e.preventDefault()};
    const up=()=>drawing=false;
    canvas.onpointerdown=down;canvas.onpointermove=move;canvas.onpointerup=canvas.onpointerleave=up;
    canvas.ontouchstart=down;canvas.ontouchmove=move;canvas.ontouchend=up;
  }

  window.clearCustomerQuoteSignature=function(){
    const c=document.getElementById('customerQuoteSignature'); if(c)c.getContext('2d').clearRect(0,0,c.width,c.height);
  };

  window.customerAcceptQuote=async function(){
    const rec=window.customerPortalRecord,q=rec?.payload?.quote;
    if(!rec||!q)return;
    const {error}=await sb.from('customer_quote_actions').insert({
      owner_user_id:rec.access.owner_user_id,customer_id:rec.access.customer_id,
      customer_email:rec.access.customer_email,customer_user_id:cloudSession.user.id,
      quote_id:q.id,quote_ref:q.ref,action:'accepted'
    });
    if(error)return alert(error.message);
    rec.payload.quote.acceptedAt=new Date().toISOString();
    renderQuoteStage(rec);
  };

  window.customerSignContract=async function(){
    const rec=window.customerPortalRecord,q=rec?.payload?.quote;
    const name=document.getElementById('customerQuoteSigner')?.value.trim();
    const canvas=document.getElementById('customerQuoteSignature');
    if(!name)return alert('Enter your full name.');
    if(!canvas)return;
    const sig=canvas.toDataURL('image/png');
    const {error}=await sb.from('customer_quote_actions').insert({
      owner_user_id:rec.access.owner_user_id,customer_id:rec.access.customer_id,
      customer_email:rec.access.customer_email,customer_user_id:cloudSession.user.id,
      quote_id:q.id,quote_ref:q.ref,action:'contract_signed',signer_name:name,signature_data:sig
    });
    if(error)return alert(error.message);
    rec.payload.quote.signerName=name;
    rec.payload.quote.acceptedAt=new Date().toISOString();
    document.getElementById('customerAppHome').innerHTML=`<div class="customer-app-head"><div class="brand"><div class="logo">CS</div><div><strong>CS Energy</strong><small>Customer Portal</small></div></div><button class="ghost" onclick="customerPortalLogout()">Sign out</button></div><div class="customer-app-card"><h1>Thank you, ${esc(name.split(' ')[0]||name)}</h1><p>Your quotation has been accepted and your contract has been signed.</p><p class="muted">CS Energy will now process your installation and contact you with the next steps.</p></div>`;
  };

  function renderQuoteStage(rec){
    const p=rec.payload||{},c=p.customer||{},q=p.quote;
    const home=document.getElementById('customerAppHome');
    if(!q){
      home.innerHTML=`<div class="customer-app-head"><div class="brand"><div class="logo">CS</div><div><strong>CS Energy</strong><small>Customer Portal</small></div></div><button class="ghost" onclick="customerPortalLogout()">Sign out</button></div><div class="customer-app-card"><h2>Hello ${esc((c.name||'').split(' ')[0]||'there')}</h2><p>Your quotation is being prepared. There is nothing you need to do yet.</p></div>`;
      return;
    }
    const accepted=!!q.acceptedAt;
    home.innerHTML=`<div class="customer-app-head"><div class="brand"><div class="logo">CS</div><div><strong>CS Energy</strong><small>Customer Portal</small></div></div><button class="ghost" onclick="customerPortalLogout()">Sign out</button></div>
    <div class="customer-welcome"><h1>Hello ${esc((c.name||'').split(' ')[0]||'there')}</h1><p>Your CS Energy quotation and installation agreement.</p></div>
    <div class="customer-app-card"><h2>${esc(q.title||'Solar PV installation')}</h2><div class="kv"><span>Quote</span><strong>${esc(q.ref)}</strong></div><div class="kv"><span>Date</span><strong>${qDate(q.date)}</strong></div><div class="kv"><span>Total</span><strong>${eur2(q.total)} incl. IVA</strong></div><h3 style="margin-top:18px">Equipment & scope</h3>${(q.lines||[]).map(l=>`<div class="portal-doc"><span>${esc(l.description)}</span><strong>${Number(l.qty||0)}</strong></div>`).join('')}<p>${esc(q.scope||'')}</p>${accepted?'<div class="customer-system-status"><span class="customer-system-dot"></span><strong>Quotation accepted</strong></div>':`<button class="primary" style="width:100%;margin-top:14px" onclick="customerAcceptQuote()">Accept quotation</button>`}</div>
    ${accepted?contractTerms(q,p)+`<div class="customer-app-card"><h2>Sign contract</h2><p class="customer-card-sub">Sign below to confirm your acceptance.</p><div class="signature-light"><canvas id="customerQuoteSignature" width="700" height="260" style="width:100%;height:180px;background:white;touch-action:none"></canvas></div><div class="customer-app-actions" style="margin-top:8px"><button class="mini" onclick="clearCustomerQuoteSignature()">Clear</button></div><div class="field" style="margin-top:14px"><label>Full name</label><input id="customerQuoteSigner" value="${esc(c.name||'')}"></div><button class="primary" style="width:100%;margin-top:12px" onclick="customerSignContract()">Sign contract</button></div>`:''}`;
    if(accepted)setTimeout(setupCustomerSignature,0);
  }

  window.renderCustomerPortalHome=function(rec){
    if((rec?.payload?.portalStage||'quote')!=='full'){
      renderQuoteStage(rec); return;
    }
    return originalRenderCustomerPortalHome.apply(this,arguments);
  };

  // Preview should also use the quote-stage/full-stage rule.
  const oldPreview=window.previewCustomerApp;
  if(typeof oldPreview==='function'){
    window.previewCustomerApp=async function(id){
      const c=customer(id);
      const rec={
        access:{owner_user_id:cloudSession.user.id,customer_id:c.id,customer_email:(c.email||'').toLowerCase(),plan:c.plan||'No plan',plan_status:hasCarePlan(c)?'active':'none'},
        payload:portalSnapshotPayload(c)
      };
      window.customerPortalRecord=rec;
      document.getElementById('login')?.classList.add('hidden');
      document.getElementById('app')?.classList.add('hidden');
      document.getElementById('mobilebar')?.classList.add('hidden');
      document.getElementById('fab')?.classList.add('hidden');
      document.getElementById('customerApp')?.classList.remove('hidden');
      document.getElementById('customerAppLogin')?.classList.add('hidden');
      document.getElementById('customerAppHome')?.classList.remove('hidden');
      window.renderCustomerPortalHome(rec);
      const home=document.getElementById('customerAppHome');
      const bar=document.createElement('div');
      bar.style.cssText='position:sticky;top:0;z-index:999;background:#f47a20;color:#111;padding:11px 14px;border-radius:12px;margin-bottom:14px;font-weight:850;display:flex;justify-content:space-between;align-items:center;gap:12px';
      bar.innerHTML=`<span>👁 Admin preview — ${esc(c.name||'customer')}</span><button style="background:#111;color:#fff;border:0;border-radius:8px;padding:7px 10px" onclick="closeCustomerAppPreview()">Return to Business</button>`;
      home.prepend(bar);
    };
  }

  // Pull customer accept/sign actions whenever the owner revisits the app.
  setTimeout(syncQuoteActionsToBusiness,1200);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)syncQuoteActionsToBusiness()});
})();