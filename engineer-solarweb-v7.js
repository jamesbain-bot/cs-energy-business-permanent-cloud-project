// CS Energy Engineer Solar.web v7
// Definitive renderer: exactly ONE monitoring section per customer page.
(function(){
  const E2=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

  function findUrl(p){
    const vals=[
      p.solarWebUrl,p.publicDisplayUrl,p.monitorUrl,p.monitoringUrl,
      p.solarWebPublicUrl,p.solarwebUrl,p.solarWebLink
    ];
    for(const v of vals){
      if(typeof v==='string' && /^https?:\/\//i.test(v) && /solarweb\.com/i.test(v)) return v.trim();
    }
    for(const v of Object.values(p||{})){
      if(typeof v==='string' && /^https?:\/\//i.test(v) && /solarweb\.com/i.test(v)) return v.trim();
    }
    return '';
  }

  function buildMonitoring(related){
    const solar=related.filter(r=>r.kind==='solar');
    if(!solar.length)return '';

    return `<div class="card engineer-solarweb-section">
      <h3>📡 Live monitoring · Fronius Solar.web</h3>
      ${solar.map((r,i)=>{
        const p=r.payload||{},url=findUrl(p);
        const heading=solar.length>1
          ? `<strong>${E2(p.inverter||'Solar system')} · ${E2(p.serial||'')}</strong>`
          : '';
        if(!url){
          return `<div class="equipment">${heading}<p class="muted">Solar.web Public Display is not linked to this system yet.</p></div>`;
        }
        return `<div class="equipment">
          ${heading}
          <div style="display:flex;justify-content:flex-end;margin:8px 0">
            <button onclick="window.open('${E2(url)}','_blank','noopener')">Open Solar.web</button>
          </div>
          <div style="height:620px;min-height:420px;border:1px solid var(--line);border-radius:14px;overflow:hidden;background:#fff">
            <iframe src="${E2(url)}"
              style="width:100%;height:100%;border:0;display:block"
              referrerpolicy="strict-origin-when-cross-origin"
              allowfullscreen></iframe>
          </div>
        </div>`;
      }).join('')}
    </div>`;
  }

  function installExactlyOnce(customerId){
    const detail=document.getElementById('detail');
    if(!detail)return;

    // Remove ANY older monitoring renderer before adding the definitive one.
    detail.querySelectorAll(
      '.engineer-solarweb-section,.engineer-monitor-card,[data-cs-solarweb="1"]'
    ).forEach(x=>x.remove());

    const rows=(window.systemRows||[]).filter(r=>(r.payload||{}).customerId===customerId);
    const html=buildMonitoring(rows);
    if(!html)return;

    // Put monitoring between Systems & installations and Service & job history.
    const cards=[...detail.querySelectorAll('.card')];
    const history=cards.find(x=>/Service\s*&\s*job history/i.test(x.textContent||''));
    if(history) history.insertAdjacentHTML('beforebegin',html);
    else detail.insertAdjacentHTML('beforeend',html);
  }

  const previous=window.openEngineerCustomer;
  if(typeof previous!=='function')return;

  window.openEngineerCustomer=async function(customerId,ownerId){
    const r=await previous.apply(this,arguments);
    // Run after the main customer page has rendered.
    setTimeout(()=>installExactlyOnce(customerId),20);
    return r;
  };
})();