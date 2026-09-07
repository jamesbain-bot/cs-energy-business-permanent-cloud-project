// CS Energy owner customer-app preview
(function(){
  let previewing=false;
  const origService=window.submitCustomerServiceRequest;
  const origCare=window.requestCarePlan;

  function previewGuard(action){
    if(previewing){
      alert('Admin preview only — no customer action was submitted.');
      return true;
    }
    return false;
  }

  if(typeof origService==='function'){
    window.submitCustomerServiceRequest=async function(){
      if(previewGuard('service')) return;
      return origService.apply(this,arguments);
    };
  }
  if(typeof origCare==='function'){
    window.requestCarePlan=async function(){
      if(previewGuard('care')) return;
      return origCare.apply(this,arguments);
    };
  }

  function addPreviewBanner(c){
    const home=document.getElementById('customerAppHome');
    if(!home)return;
    const old=document.getElementById('csOwnerPreviewBanner');
    if(old)old.remove();
    const bar=document.createElement('div');
    bar.id='csOwnerPreviewBanner';
    bar.style.cssText='position:sticky;top:0;z-index:999;background:#f47a20;color:#111;padding:11px 14px;border-radius:12px;margin-bottom:14px;font-weight:850;display:flex;justify-content:space-between;align-items:center;gap:12px';
    bar.innerHTML=`<span>👁 Admin preview — viewing the customer app as ${esc(c.name||'customer')}</span><button style="border:1px solid rgba(0,0,0,.25);background:#111;color:#fff;border-radius:9px;padding:7px 10px;font-weight:800" onclick="closeCustomerAppPreview()">Return to Business</button>`;
    home.prepend(bar);
  }

  window.previewCustomerApp=async function(id){
    const c=customer(id);
    if(!c?.id)return alert('Customer not found.');
    if(!cloudSession?.user?.id)return alert('Please sign in to the Business app first.');

    previewing=true;
    const rec={
      access:{
        owner_user_id:cloudSession.user.id,
        customer_id:c.id,
        customer_email:(c.email||'').toLowerCase(),
        plan:c.plan||'No plan',
        plan_status:hasCarePlan(c)?'active':'none'
      },
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

    renderCustomerPortalHome(rec);
    addPreviewBanner(c);

    // Load the same live calendar availability and request history the customer sees.
    try{await Promise.all([loadCustomerOwnRequests(),loadCustomerAvailableDates()])}catch(e){console.warn('Preview extras',e)}
    window.scrollTo({top:0,behavior:'instant'});
  };

  window.closeCustomerAppPreview=function(){
    previewing=false;
    window.customerPortalRecord=null;
    document.getElementById('customerApp')?.classList.add('hidden');
    document.getElementById('customerAppHome')?.classList.add('hidden');
    document.getElementById('customerAppLogin')?.classList.remove('hidden');
    document.getElementById('app')?.classList.remove('hidden');
    document.getElementById('mobilebar')?.classList.remove('hidden');
    document.getElementById('fab')?.classList.remove('hidden');
    window.scrollTo({top:0,behavior:'instant'});
  };

  // Add a View as customer button to the Customer Portal preview.
  const oldRenderPortal=window.renderPortal;
  if(typeof oldRenderPortal==='function'){
    window.renderPortal=function(){
      const result=oldRenderPortal.apply(this,arguments);
      const sel=document.getElementById('portalCustomer');
      const host=document.getElementById('portalPreview');
      const id=sel?.value;
      if(host&&id&&!host.querySelector('.cs-view-as-customer')){
        const row=host.querySelector('.btnrow');
        if(row){
          const b=document.createElement('button');
          b.className='mini cs-view-as-customer';
          b.textContent='👁 View as customer';
          b.onclick=()=>previewCustomerApp(id);
          row.appendChild(b);
        }
      }
      return result;
    };
  }

  // Also add it whenever a customer detail modal is opened.
  const oldCustomerDetail=window.openCustomerDetail;
  if(typeof oldCustomerDetail==='function'){
    window.openCustomerDetail=function(id){
      const result=oldCustomerDetail.apply(this,arguments);
      setTimeout(()=>{
        const body=document.getElementById('customerDetailBody');
        if(!body||body.querySelector('.cs-detail-preview-btn'))return;
        const b=document.createElement('button');
        b.className='primary cs-detail-preview-btn';
        b.style.marginBottom='14px';
        b.textContent='👁 View customer app';
        b.onclick=()=>{closeModal('customerDetailModal');previewCustomerApp(id)};
        body.prepend(b);
      },0);
      return result;
    };
  }

  // Refresh portal screen so the button appears immediately if it is already open.
  setTimeout(()=>{try{if(document.getElementById('portalPreview'))renderPortal()}catch(e){}},300);
})();