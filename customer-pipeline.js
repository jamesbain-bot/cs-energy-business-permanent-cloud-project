
(function(){
  const STAGES = [
    'New lead',
    'Survey / visit booked',
    'Quoted',
    'Accepted / bought',
    'Installation booked',
    'In progress',
    'Completed',
    'Aftercare / active customer',
    'Lost / not proceeding'
  ];

  let pipelineFilter = 'all';

  function stageOf(c){
    return c?.stage || 'New lead';
  }

  function stageClass(stage){
    if(stage==='Completed' || stage==='Aftercare / active customer') return 'green';
    if(stage==='Lost / not proceeding') return 'red';
    if(stage==='Quoted' || stage==='Survey / visit booked') return 'blue';
    return 'orange';
  }

  function setCustomerStage(customerId, stage, rerender=true){
    const c = data.customers.find(x=>x.id===customerId);
    if(!c || !STAGES.includes(stage)) return;
    c.stage = stage;
    c.stageUpdatedAt = new Date().toISOString();
    save();
    if(rerender){
      renderCustomers();
      try{ renderRecent(); }catch(e){}
    }
  }
  window.setCustomerStage = setCustomerStage;

  function ensureCustomerFormStage(){
    const form = document.getElementById('customerForm');
    if(!form || form.elements.stage) return;
    const notes = form.elements.notes?.closest('.field');
    const field = document.createElement('div');
    field.className = 'field';
    field.innerHTML = `<label>Customer stage</label>
      <select name="stage">${STAGES.map(s=>`<option>${s}</option>`).join('')}</select>`;
    if(notes) notes.parentNode.insertBefore(field, notes);
    else form.querySelector('.formgrid')?.appendChild(field);
  }

  function ensurePipelineTabs(){
    const toolbar = document.querySelector('#customers .toolbar');
    if(!toolbar || document.getElementById('customerPipelineTabs')) return;
    const wrap = document.createElement('div');
    wrap.id = 'customerPipelineTabs';
    wrap.className = 'btnrow';
    wrap.style.margin = '0 0 16px';
    toolbar.insertAdjacentElement('afterend', wrap);
  }

  function renderPipelineTabs(){
    ensurePipelineTabs();
    const wrap = document.getElementById('customerPipelineTabs');
    if(!wrap) return;
    const counts = Object.fromEntries(STAGES.map(s=>[s,data.customers.filter(c=>stageOf(c)===s).length]));
    const short = [
      ['all','All'],
      ['New lead','Leads'],
      ['Survey / visit booked','Survey'],
      ['Quoted','Quoted'],
      ['Accepted / bought','Bought'],
      ['Installation booked','Install booked'],
      ['In progress','In progress'],
      ['Completed','Completed'],
      ['Aftercare / active customer','Aftercare'],
      ['Lost / not proceeding','Lost']
    ];
    wrap.innerHTML = short.map(([value,label])=>{
      const n = value==='all' ? data.customers.length : (counts[value]||0);
      const active = pipelineFilter===value;
      return `<button type="button" class="${active?'primary':'ghost'}" style="padding:8px 11px" onclick="customerPipelineFilter('${String(value).replace(/'/g,"\\'")}')">${label} <span style="opacity:.7">${n}</span></button>`;
    }).join('');
  }

  window.customerPipelineFilter = function(stage){
    pipelineFilter = stage;
    renderCustomers();
  };

  const originalRenderCustomers = window.renderCustomers || renderCustomers;
  window.renderCustomers = function(){
    const q=(document.getElementById('customerSearch')?.value||'').toLowerCase();
    const f=document.getElementById('customerFilter')?.value||'all';
    let list=data.customers.filter(c=>
      `${c.name||''} ${c.location||''} ${c.phone||''} ${c.email||''} ${stageOf(c)}`.toLowerCase().includes(q)
    );
    if(f==='due') list=list.filter(c=>daysUntil(c.nextService)<=14);
    if(f==='fault') list=list.filter(c=>data.jobs.some(j=>j.customerId===c.id&&j.type==='Fault call'&&j.status!=='Complete'));
    if(pipelineFilter!=='all') list=list.filter(c=>stageOf(c)===pipelineFilter);

    const host=document.getElementById('customerGrid');
    if(!host) return;
    host.innerHTML=list.length?list.map(c=>{
      const s=systemFor(c.id);
      const open=data.jobs.filter(j=>j.customerId===c.id&&j.status!=='Complete').length;
      const d=daysUntil(c.nextService);
      const stage=stageOf(c);
      return `<div class="card customer-card">
        <div class="section-head">
          <span class="pill ${stageClass(stage)}">${esc(stage)}</span>
          <span class="pill ${d<0?'red':d<=14?'orange':'green'}">${d<0?'Service overdue':d<=14?'Service due':'Service OK'}</span>
        </div>
        <h3>${esc(c.name||'')}</h3>
        <p>${esc(c.location||'')} · ${esc(c.phone||'')}</p>
        <p>${esc(c.email||'')}</p>
        <div class="equipment">
          ${s?`<span class="equip">${esc(s.inverter||`${Number(s.pv||0)} kWp`)}</span>`:'<span class="equip">No system recorded</span>'}
          ${open?`<span class="equip">${open} open job${open===1?'':'s'}</span>`:''}
          ${c.plan&&c.plan!=='No plan'?`<span class="equip">${esc(c.plan)} Care</span>`:''}
        </div>
        <div class="field" style="margin-top:13px">
          <label>Stage</label>
          <select onchange="setCustomerStage('${c.id}',this.value)" style="background:#08111a;border:1px solid var(--line);border-radius:10px;padding:8px;color:#fff">
            ${STAGES.map(x=>`<option ${x===stage?'selected':''}>${esc(x)}</option>`).join('')}
          </select>
        </div>
        <div class="card-actions">
          <button class="mini" onclick="openCustomerDetail('${c.id}')">Open</button>
          <a class="mini whatsapp" target="_blank" href="https://wa.me/${(c.phone||'').replace(/\D/g,'')}">WhatsApp</a>
          <button class="mini" onclick="newJobFor('${c.id}')">New job</button>
        </div>
      </div>`;
    }).join(''):'<div class="empty">No customers in this group.</div>';

    renderPipelineTabs();
  };

  const originalOpenCustomerModal = window.openCustomerModal || openCustomerModal;
  window.openCustomerModal = function(id=null){
    ensureCustomerFormStage();
    const r = originalOpenCustomerModal(id);
    const form=document.getElementById('customerForm');
    if(form?.elements.stage){
      const c=id?data.customers.find(x=>x.id===id):null;
      form.elements.stage.value=stageOf(c);
    }
    return r;
  };

  const originalOpenCustomerDetail = window.openCustomerDetail || openCustomerDetail;
  window.openCustomerDetail = function(id){
    const r=originalOpenCustomerDetail(id);
    setTimeout(()=>{
      const body=document.getElementById('customerDetailBody');
      const first=body?.querySelector('.detail-section');
      const c=data.customers.find(x=>x.id===id);
      if(!first||!c||first.querySelector('.pipeline-stage-row')) return;
      const row=document.createElement('div');
      row.className='kv pipeline-stage-row';
      row.innerHTML=`<span>Stage</span><strong>
        <select onchange="setCustomerStage('${id}',this.value,false);openCustomerDetail('${id}')" style="max-width:220px;background:#08111a;border:1px solid var(--line);border-radius:9px;padding:7px;color:#fff">
          ${STAGES.map(s=>`<option ${s===stageOf(c)?'selected':''}>${esc(s)}</option>`).join('')}
        </select>
      </strong>`;
      const firstKv=first.querySelector('.kv');
      if(firstKv) firstKv.parentNode.insertBefore(row,firstKv);
      else first.appendChild(row);
    },0);
    return r;
  };

  function advanceQuoteCustomer(quoteId,status){
    const q=data.quotes.find(x=>x.id===quoteId);
    if(!q) return;
    const map={
      'Sent':'Quoted',
      'Accepted':'Accepted / bought',
      'Deposit':'Accepted / bought',
      'Complete':'Completed'
    };
    if(map[status]) setCustomerStage(q.customerId,map[status],false);
  }

  if(typeof emailCustomerQuote==='function'){
    const fn=emailCustomerQuote;
    window.emailCustomerQuote=function(id){
      advanceQuoteCustomer(id,'Sent');
      const r=fn(id);
      try{renderCustomers()}catch(e){}
      return r;
    };
  }
  if(typeof whatsappCustomerQuote==='function'){
    const fn=whatsappCustomerQuote;
    window.whatsappCustomerQuote=function(id){
      advanceQuoteCustomer(id,'Sent');
      const r=fn(id);
      try{renderCustomers()}catch(e){}
      return r;
    };
  }
  if(typeof setQuoteStatus==='function'){
    const fn=setQuoteStatus;
    window.setQuoteStatus=function(id,status){
      const r=fn(id,status);
      advanceQuoteCustomer(id,status);
      try{renderCustomers()}catch(e){}
      return r;
    };
  }
  if(typeof toggleDeposit==='function'){
    const fn=toggleDeposit;
    window.toggleDeposit=function(id){
      const r=fn(id);
      const q=data.quotes.find(x=>x.id===id);
      if(q?.depositPaid) advanceQuoteCustomer(id,'Deposit');
      try{renderCustomers()}catch(e){}
      return r;
    };
  }
  if(typeof toggleComplete==='function'){
    const fn=toggleComplete;
    window.toggleComplete=function(id){
      const r=fn(id);
      const q=data.quotes.find(x=>x.id===id);
      if(q?.completed) advanceQuoteCustomer(id,'Complete');
      try{renderCustomers()}catch(e){}
      return r;
    };
  }
  if(typeof saveContractSignature==='function'){
    const fn=saveContractSignature;
    window.saveContractSignature=function(){
      const id=window.currentQuoteId;
      const r=fn.apply(this,arguments);
      if(id) advanceQuoteCustomer(id,'Accepted');
      try{renderCustomers()}catch(e){}
      return r;
    };
  }

  // Set sensible defaults for existing records without overwriting any stage already chosen.
  data.customers.forEach(c=>{
    if(c.stage) return;
    const quotes=data.quotes.filter(q=>q.customerId===c.id);
    if(quotes.some(q=>q.status==='Complete'||q.completed)) c.stage='Completed';
    else if(quotes.some(q=>q.status==='Deposit'||q.status==='Accepted')) c.stage='Accepted / bought';
    else if(quotes.some(q=>q.status==='Sent')) c.stage='Quoted';
    else c.stage='New lead';
  });
  save();

  ensureCustomerFormStage();
  ensurePipelineTabs();
  renderCustomers();
})();
