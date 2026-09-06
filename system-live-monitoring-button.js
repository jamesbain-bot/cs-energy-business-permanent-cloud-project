// CS Energy - add Live Monitoring button directly to System cards
(function(){
  const oldRenderSystems =
    window.renderSystems ||
    (typeof renderSystems==='function' ? renderSystems : null);

  if(!oldRenderSystems) return;

  window.renderSystems=function(){
    const result=oldRenderSystems.apply(this,arguments);

    setTimeout(()=>{
      const q=(document.getElementById('systemSearch')?.value||'').toLowerCase();
      const visibleSystems=data.systems.filter(s=>
        (customer(s.customerId).name+s.inverter+s.battery+s.serial+s.panels)
          .toLowerCase().includes(q)
      );

      const cards=[...document.querySelectorAll('#systemGrid .system-card')];

      cards.forEach((card,index)=>{
        if(card.querySelector('.system-live-monitoring-btn')) return;

        const s=visibleSystems[index];
        if(!s?.solarWebUrl) return;

        const row=card.querySelector('.card-actions');
        if(!row) return;

        const btn=document.createElement('button');
        btn.type='button';
        btn.className='mini system-live-monitoring-btn';
        btn.textContent='Live Monitoring';
        btn.onclick=()=>window.csShowSolarWeb(s.id);

        // Put it first so it is easy to find.
        row.insertBefore(btn,row.firstChild);
      });
    },0);

    return result;
  };

  // Refresh immediately so existing cards gain the button.
  renderSystems();
})();