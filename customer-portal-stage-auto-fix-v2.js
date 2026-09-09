// CS Energy customer portal stage auto-fix v2
(function(){
  const prev=window.portalSnapshotPayload;
  function hasSystem(id){
    return (data.systems||[]).some(s=>s.customerId===id && (s.installed||s.inverter||s.serial||Number(s.pv||0)>0||s.battery||Number(s.batteryKwh||0)>0));
  }
  function stage(c){
    if(c.portalFullAccess===true)return 'full';
    if(c.portalFullAccess===false)return 'quote';
    return hasSystem(c.id)?'full':'quote';
  }
  window.portalSnapshotPayload=function(c){
    const base=prev?prev(c):{};
    return {...base,portalStage:stage(c)};
  };
  const old=window.openCustomerDetail;
  if(typeof old==='function')window.openCustomerDetail=function(id){
    const r=old.apply(this,arguments);
    setTimeout(()=>{
      const c=customer(id),b=document.getElementById('customerDetailBody')?.querySelector('.cs-portal-stage-btn');
      if(b)b.textContent=stage(c)==='full'?'🔒 Limit to quote + contract':'🔓 Unlock full customer app';
    },20);
    return r;
  };
  async function refresh(){
    if(CUSTOMER_APP_MODE||!cloudSession?.user?.id||typeof syncPortalCustomer!=='function')return;
    for(const c of (data.customers||[]).filter(x=>x.portalEnabled&&x.email)){
      try{await syncPortalCustomer(c)}catch(e){console.warn(e)}
    }
  }
  setTimeout(refresh,1500);
})();