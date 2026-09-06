// CS Energy Engineer v6 - always show Live Monitoring section
(function(){
  function escx(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}

  function findSolarWebUrl(p){
    const direct=[
      p.solarWebUrl,p.publicDisplayUrl,p.solarWebPublicUrl,p.monitorUrl,
      p.monitoringUrl,p.publicUrl,p.solarwebUrl,p.solarWebLink
    ].find(v=>typeof v==='string' && /^https?:\/\//i.test(v) && /solarweb\.com/i.test(v));
    if(direct) return direct;

    // Fallback: inspect any string field in the synced payload for a Solar.web public link.
    for(const [k,v] of Object.entries(p||{})){
      if(typeof v==='string' && /^https?:\/\//i.test(v) && /solarweb\.com/i.test(v)) return v;
    }
    return '';
  }

  function monitoringBlock(related){
    const solarRows=related.filter(r=>r.kind==='solar');
    if(!solarRows.length) return '';

    return `<div class="card engineer-solarweb-section">
      <h3>📡 Live monitoring · Fronius Solar.web</h3>
      ${solarRows.map((r,i)=>{
        const p=r.payload||{},url=findSolarWebUrl(p);
        const title=solarRows.length>1
          ? `${escx(p.inverter||'Solar system')} · ${escx(p.serial||'')}`
          : '';
        if(!url){
          return `<div class="equipment">
            ${title?`<strong>${title}</strong>`:''}
            <p class="muted">Solar.web Public Display is not linked to this system yet.</p>
          </div>`;
        }
        return `<div class="equipment">
          ${title?`<strong>${title}</strong>`:''}
          <div style="display:flex;justify-content:flex-end;margin:8px 0">
            <button onclick="window.open('${escx(url)}','_blank','noopener')">Open Solar.web</button>
          </div>
          <div style="height:620px;min-height:420px;border:1px solid var(--line);border-radius:14px;overflow:hidden;background:#fff">
            <iframe src="${escx(url)}"
              style="width:100%;height:100%;border:0;display:block"
              referrerpolicy="strict-origin-when-cross-origin"
              allowfullscreen></iframe>
          </div>
        </div>`;
      }).join('')}
    </div>`;
  }

  // Wrap the current customer opener, preserving all v5 content.
  const previous=window.openEngineerCustomer;
  if(typeof previous!=='function') return;

  window.openEngineerCustomer=async function(customerId,ownerId){
    await previous.apply(this,arguments);

    setTimeout(()=>{
      const related=(window.systemRows||systemRows||[]).filter(r=>(r.payload||{}).customerId===customerId);
      const detailEl=document.getElementById('detail');
      if(!detailEl || detailEl.querySelector('.engineer-solarweb-section')) return;

      const html=monitoringBlock(related);
      if(!html) return;

      const history=[...detailEl.querySelectorAll('.card')].find(x=>/Service\s*&\s*job history/i.test(x.textContent));
      if(history) history.insertAdjacentHTML('beforebegin',html);
      else detailEl.insertAdjacentHTML('beforeend',html);
    },0);
  };
})();