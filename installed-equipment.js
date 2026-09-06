// CS Energy Installed Equipment v2
// Batteries + EV chargers belong to the Solar System.
// Air-con, pool heaters, water heaters, heat pumps, generators and other equipment
// live in a separate "Other installations" category.
(function(){
  const OTHER_TYPES=[
    ['aircon','❄️ Air conditioning'],
    ['pool_heater','🏊 Pool heater'],
    ['water_heater','🚿 Water heater / boiler'],
    ['heat_pump','♨️ Heat pump'],
    ['generator','🔌 Generator'],
    ['other','➕ Other installation']
  ];
  const E=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const U=()=>crypto?.randomUUID?.()||('id_'+Date.now()+'_'+Math.random().toString(36).slice(2));
  let systemBatteries=[], systemChargers=[], editingOtherId=null, otherPhotos=[];

  function ensure(){
    if(!Array.isArray(data.assets)) data.assets=[];
    data.systems.forEach(s=>{
      if(!Array.isArray(s.batteries)) s.batteries=[];
      if(!Array.isArray(s.evChargers)) s.evChargers=[];
    });
  }
  function cname(id){return data.customers.find(c=>c.id===id)?.name||'Unknown customer'}
  function tlabel(t){return OTHER_TYPES.find(x=>x[0]===t)?.[1]||'➕ Other installation'}

  // One-time migration from v1 if any battery/EV assets were already entered there.
  function migrateV1(){
    ensure();
    const move=(data.assets||[]).filter(a=>['battery','ev_charger'].includes(a.type));
    if(!move.length)return;
    move.forEach(a=>{
      const s=data.systems.find(x=>x.customerId===a.customerId);
      if(!s)return;
      if(a.type==='battery' && !s.batteries.some(x=>x.serial&&x.serial===a.serial)){
        s.batteries.push({id:U(),manufacturer:a.manufacturer||'',model:a.model||'',serial:a.serial||'',capacity:a.capacity||'',location:a.location||'',notes:a.notes||''});
      }
      if(a.type==='ev_charger' && !s.evChargers.some(x=>x.serial&&x.serial===a.serial)){
        s.evChargers.push({id:U(),manufacturer:a.manufacturer||'',model:a.model||'',serial:a.serial||'',capacity:a.capacity||'',location:a.location||'',notes:a.notes||''});
      }
    });
    data.assets=data.assets.filter(a=>!['battery','ev_charger'].includes(a.type));
    save();
  }

  function ensureSolarExtrasUI(){
    const form=document.getElementById('systemForm');
    if(!form || document.getElementById('solarExtrasBlock')) return;
    const actions=form.querySelector('.formactions')||form.lastElementChild;
    const block=document.createElement('div');
    block.id='solarExtrasBlock';
    block.innerHTML=`
      <div class="detail-section" style="margin-top:18px">
        <div class="section-head"><div><h3>🔋 Batteries</h3><span class="meta">Add each physical battery/module separately so every serial number is recorded.</span></div>
        <button type="button" class="mini" onclick="csAddSystemBattery()">+ Add battery</button></div>
        <div id="systemBatteryList"></div>
      </div>
      <div class="detail-section" style="margin-top:18px">
        <div class="section-head"><div><h3>🚗 Car chargers</h3><span class="meta">EV chargers installed as part of this solar system.</span></div>
        <button type="button" class="mini" onclick="csAddSystemCharger()">+ Add car charger</button></div>
        <div id="systemChargerList"></div>
      </div>`;
    form.insertBefore(block,actions);
  }

  function batteryRow(b,i){
    return `<div class="card" style="padding:12px;margin:10px 0">
      <div class="formgrid">
        <div class="field"><label>Manufacturer</label><input value="${E(b.manufacturer||'')}" oninput="csUpdateBattery(${i},'manufacturer',this.value)"></div>
        <div class="field"><label>Model</label><input value="${E(b.model||'')}" oninput="csUpdateBattery(${i},'model',this.value)"></div>
        <div class="field"><label>Serial number</label><input value="${E(b.serial||'')}" oninput="csUpdateBattery(${i},'serial',this.value)"></div>
        <div class="field"><label>Capacity</label><input value="${E(b.capacity||'')}" placeholder="e.g. 2.76 kWh" oninput="csUpdateBattery(${i},'capacity',this.value)"></div>
        <div class="field"><label>Location</label><input value="${E(b.location||'')}" oninput="csUpdateBattery(${i},'location',this.value)"></div>
        <div class="field"><label>Notes</label><input value="${E(b.notes||'')}" oninput="csUpdateBattery(${i},'notes',this.value)"></div>
      </div>
      <div class="formactions"><button type="button" class="danger" onclick="csRemoveSystemBattery(${i})">Remove battery</button></div>
    </div>`;
  }
  function chargerRow(c,i){
    return `<div class="card" style="padding:12px;margin:10px 0">
      <div class="formgrid">
        <div class="field"><label>Manufacturer</label><input value="${E(c.manufacturer||'')}" oninput="csUpdateCharger(${i},'manufacturer',this.value)"></div>
        <div class="field"><label>Model</label><input value="${E(c.model||'')}" oninput="csUpdateCharger(${i},'model',this.value)"></div>
        <div class="field"><label>Serial number</label><input value="${E(c.serial||'')}" oninput="csUpdateCharger(${i},'serial',this.value)"></div>
        <div class="field"><label>Power</label><input value="${E(c.capacity||'')}" placeholder="e.g. 7.4 kW / 11 kW / 22 kW" oninput="csUpdateCharger(${i},'capacity',this.value)"></div>
        <div class="field"><label>Location</label><input value="${E(c.location||'')}" oninput="csUpdateCharger(${i},'location',this.value)"></div>
        <div class="field"><label>Notes</label><input value="${E(c.notes||'')}" oninput="csUpdateCharger(${i},'notes',this.value)"></div>
      </div>
      <div class="formactions"><button type="button" class="danger" onclick="csRemoveSystemCharger(${i})">Remove car charger</button></div>
    </div>`;
  }
  function drawSolarExtras(){
    ensureSolarExtrasUI();
    const b=document.getElementById('systemBatteryList'),c=document.getElementById('systemChargerList');
    if(b)b.innerHTML=systemBatteries.length?systemBatteries.map(batteryRow).join(''):'<div class="empty">No individual battery serials added.</div>';
    if(c)c.innerHTML=systemChargers.length?systemChargers.map(chargerRow).join(''):'<div class="empty">No car charger recorded.</div>';
  }
  window.csAddSystemBattery=()=>{systemBatteries.push({id:U(),manufacturer:'',model:'',serial:'',capacity:'',location:'',notes:''});drawSolarExtras()};
  window.csRemoveSystemBattery=i=>{systemBatteries.splice(i,1);drawSolarExtras()};
  window.csUpdateBattery=(i,k,v)=>{if(systemBatteries[i])systemBatteries[i][k]=v};
  window.csAddSystemCharger=()=>{systemChargers.push({id:U(),manufacturer:'',model:'',serial:'',capacity:'',location:'',notes:''});drawSolarExtras()};
  window.csRemoveSystemCharger=i=>{systemChargers.splice(i,1);drawSolarExtras()};
  window.csUpdateCharger=(i,k,v)=>{if(systemChargers[i])systemChargers[i][k]=v};

  // Load nested equipment whenever a solar system is opened.
  const oldOpenSystem=window.openSystemModal||(typeof openSystemModal==='function'?openSystemModal:null);
  if(oldOpenSystem){
    window.openSystemModal=function(id=null){
      ensureSolarExtrasUI();
      const s=id?data.systems.find(x=>x.id===id):null;
      systemBatteries=s?.batteries?structuredClone(s.batteries):[];
      systemChargers=s?.evChargers?structuredClone(s.evChargers):[];
      const r=oldOpenSystem.apply(this,arguments);
      setTimeout(drawSolarExtras,0);
      return r;
    };
  }

  // Preserve existing system save, then attach batteries/chargers to that same system.
  const sysForm=document.getElementById('systemForm');
  if(sysForm && sysForm.onsubmit && !sysForm.dataset.csSolarExtrasWrapped){
    const oldSubmit=sysForm.onsubmit;
    sysForm.onsubmit=function(e){
      const editingId=typeof editingSystemId!=='undefined'?editingSystemId:null;
      const beforeIds=new Set(data.systems.map(s=>s.id));
      const r=oldSubmit.call(this,e);
      setTimeout(()=>{
        let s=editingId?data.systems.find(x=>x.id===editingId):data.systems.find(x=>!beforeIds.has(x.id));
        if(!s)s=data.systems[data.systems.length-1];
        if(s){
          s.batteries=structuredClone(systemBatteries);
          s.evChargers=structuredClone(systemChargers);
          // Keep old summary fields useful elsewhere in the app.
          if(s.batteries.length){
            const first=s.batteries[0];
            s.battery=[first.manufacturer,first.model].filter(Boolean).join(' ')||s.battery||'Battery';
            const total=s.batteries.reduce((sum,b)=>{
              const n=parseFloat(String(b.capacity||'').replace(',','.')); return sum+(isNaN(n)?0:n);
            },0);
            if(total)s.batteryKwh=Number(total.toFixed(2));
          }
          save();render();
        }
      },0);
      return r;
    };
    sysForm.dataset.csSolarExtrasWrapped='1';
  }

  // ---------- OTHER INSTALLATIONS ----------
  function otherPhotosDraw(){
    const g=document.getElementById('otherInstallPhotoGrid');if(!g)return;
    g.innerHTML=otherPhotos.map((p,i)=>`<div style="position:relative"><img src="${p}" style="width:100%;height:120px;object-fit:cover;border-radius:10px"><button type="button" class="mini" style="position:absolute;right:5px;top:5px" onclick="csRemoveOtherPhoto(${i})">×</button></div>`).join('');
  }
  window.csRemoveOtherPhoto=i=>{otherPhotos.splice(i,1);otherPhotosDraw()};

  function installOtherUI(){
    const systems=document.getElementById('systems');if(!systems)return;
    if(!document.getElementById('otherInstallationsSection')){
      const sec=document.createElement('div');sec.id='otherInstallationsSection';sec.className='section';
      sec.innerHTML=`<div class="section-head"><div><h2>Other installations</h2><span class="meta">Air conditioning, pool heating, water heating, heat pumps, generators and other installed equipment.</span></div><button class="primary" onclick="csOpenOtherInstallation()">+ Add installation</button></div>
      <div class="toolbar" style="margin-top:14px"><input id="otherInstallSearch" class="search" placeholder="Search customer, model, serial…"><select id="otherInstallType" class="filter"><option value="">All categories</option>${OTHER_TYPES.map(x=>`<option value="${x[0]}">${x[1]}</option>`).join('')}</select></div>
      <div id="otherInstallGrid" class="system-grid"></div>`;
      systems.appendChild(sec);
      document.getElementById('otherInstallSearch').oninput=renderOther;
      document.getElementById('otherInstallType').onchange=renderOther;
    }
    if(!document.getElementById('otherInstallModal')){
      const m=document.createElement('div');m.id='otherInstallModal';m.className='modal';m.style.zIndex='1900';
      m.innerHTML=`<div class="modalbox wide"><div class="modaltop"><div><h2 id="otherInstallTitle">Add installation</h2><div class="muted">Non-solar equipment installed for this customer.</div></div><button type="button" class="close" onclick="closeModal('otherInstallModal')">×</button></div>
      <form id="otherInstallForm"><div class="formgrid">
      <div class="field"><label>Customer</label><select name="customerId" required></select></div>
      <div class="field"><label>Category</label><select name="type">${OTHER_TYPES.map(x=>`<option value="${x[0]}">${x[1]}</option>`).join('')}</select></div>
      <div class="field"><label>Manufacturer</label><input name="manufacturer"></div><div class="field"><label>Model</label><input name="model"></div>
      <div class="field"><label>Serial number</label><input name="serial"></div><div class="field"><label>Capacity / size</label><input name="capacity" placeholder="e.g. 12,000 BTU, 9 kW, 200 L"></div>
      <div class="field"><label>Installation date</label><input name="installed" type="date"></div><div class="field"><label>Warranty expiry</label><input name="warrantyEnd" type="date"></div>
      <div class="field"><label>Location</label><input name="location" placeholder="Bedroom 1, pool house…"></div><div class="field"><label>Status</label><select name="status"><option>Installed</option><option>In service</option><option>Fault</option><option>Replaced</option><option>Removed</option></select></div>
      <div class="field full"><label>Notes</label><textarea name="notes" placeholder="For air-con: indoor/outdoor details, refrigerant etc."></textarea></div></div>
      <div class="detail-section" style="margin-top:14px"><h3>Photos / serial label</h3><label class="upload">📷 Take photo / choose photos<input id="otherInstallPhotos" type="file" accept="image/*" capture="environment" multiple></label><div id="otherInstallPhotoGrid" class="photo-grid" style="margin-top:10px"></div></div>
      <div class="formactions"><button type="button" class="ghost" onclick="closeModal('otherInstallModal')">Cancel</button><button class="primary">Save installation</button></div></form></div>`;
      document.body.appendChild(m);
      document.getElementById('otherInstallPhotos').onchange=e=>{[...e.target.files].forEach(file=>{const r=new FileReader();r.onload=()=>{otherPhotos.push(r.result);otherPhotosDraw()};r.readAsDataURL(file)});e.target.value=''};
      document.getElementById('otherInstallForm').onsubmit=e=>{
        e.preventDefault();const f=e.target,fd=new FormData(f);
        const a=editingOtherId?data.assets.find(x=>x.id===editingOtherId):{id:U(),createdAt:new Date().toISOString()};
        ['customerId','type','manufacturer','model','serial','capacity','installed','warrantyEnd','location','status','notes'].forEach(k=>a[k]=String(fd.get(k)||'').trim());
        a.photos=structuredClone(otherPhotos);a.updatedAt=new Date().toISOString();
        if(!editingOtherId)data.assets.push(a);editingOtherId=null;save();closeModal('otherInstallModal');render();renderOther();
      };
    }
  }
  window.csOpenOtherInstallation=function(id=null,cid=null,type=null){
    installOtherUI();editingOtherId=id;otherPhotos=[];const f=document.getElementById('otherInstallForm');f.reset();
    f.elements.customerId.innerHTML=data.customers.map(c=>`<option value="${c.id}">${E(c.name)} — ${E(c.location||'')}</option>`).join('');
    const a=id?data.assets.find(x=>x.id===id):null;document.getElementById('otherInstallTitle').textContent=a?'Edit installation':'Add installation';
    if(a){Object.keys(a).forEach(k=>{if(f.elements[k])f.elements[k].value=a[k]??''});otherPhotos=[...(a.photos||[])]}
    else{if(cid)f.elements.customerId.value=cid;if(type)f.elements.type.value=type;f.elements.installed.value=new Date().toISOString().slice(0,10)}
    otherPhotosDraw();document.getElementById('otherInstallModal').classList.add('open');
  };
  window.csDeleteOtherInstallation=id=>{if(confirm('Delete this installation record?')){data.assets=data.assets.filter(x=>x.id!==id);save();render();renderOther()}};

  function renderOther(){
    ensure();const g=document.getElementById('otherInstallGrid');if(!g)return;
    const q=(document.getElementById('otherInstallSearch')?.value||'').toLowerCase(),t=document.getElementById('otherInstallType')?.value||'';
    const list=data.assets.filter(a=>OTHER_TYPES.some(x=>x[0]===a.type)&&(!t||a.type===t)&&[cname(a.customerId),tlabel(a.type),a.manufacturer,a.model,a.serial,a.capacity,a.location].join(' ').toLowerCase().includes(q));
    g.innerHTML=list.length?list.map(a=>`<div class="system-card"><div class="system-top"><span class="pill green">${tlabel(a.type)}</span><span class="muted">${E(a.status||'Installed')}</span></div>
    <h3>${E(cname(a.customerId))}</h3><p><strong>${E([a.manufacturer,a.model].filter(Boolean).join(' ')||'Equipment')}</strong></p><p>Serial: ${E(a.serial||'—')}${a.capacity?` · ${E(a.capacity)}`:''}</p>
    <div class="btnrow"><button class="mini" onclick="openCustomerDetail('${a.customerId}')">Customer record</button><button class="mini" onclick="csOpenOtherInstallation('${a.id}')">Edit</button><button class="mini" onclick="csDeleteOtherInstallation('${a.id}')">Delete</button></div></div>`).join(''):'<div class="empty">No other installations recorded.</div>';
  }

  // Add both groups into the customer record.
  const oldCustomer=window.openCustomerDetail||(typeof openCustomerDetail==='function'?openCustomerDetail:null);
  if(oldCustomer){
    window.openCustomerDetail=function(id){
      const r=oldCustomer.apply(this,arguments);
      setTimeout(()=>{
        ensure();const body=document.getElementById('customerDetailBody');if(!body)return;
        const s=data.systems.find(x=>x.customerId===id);
        if(s&&!body.querySelector('.cs-solar-extras-detail')){
          const d=document.createElement('div');d.className='section detail-section cs-solar-extras-detail';
          d.innerHTML=`<div class="section-head"><h3>Solar system equipment</h3><button class="mini" onclick="editSystem('${s.id}')">Edit system equipment</button></div>
          <div class="kv"><span>Batteries</span><strong>${(s.batteries||[]).length}</strong></div>
          ${(s.batteries||[]).map((b,i)=>`<div class="job"><div><strong>🔋 Battery ${i+1} · ${E([b.manufacturer,b.model].filter(Boolean).join(' ')||'Battery')}</strong><p>Serial: ${E(b.serial||'—')}${b.capacity?` · ${E(b.capacity)}`:''}</p></div></div>`).join('')}
          <div class="kv"><span>Car chargers</span><strong>${(s.evChargers||[]).length}</strong></div>
          ${(s.evChargers||[]).map((c,i)=>`<div class="job"><div><strong>🚗 Charger ${i+1} · ${E([c.manufacturer,c.model].filter(Boolean).join(' ')||'EV charger')}</strong><p>Serial: ${E(c.serial||'—')}${c.capacity?` · ${E(c.capacity)}`:''}</p></div></div>`).join('')}`;
          body.appendChild(d);
        }
        if(!body.querySelector('.cs-other-install-detail')){
          const a=data.assets.filter(x=>x.customerId===id&&OTHER_TYPES.some(t=>t[0]===x.type));
          const d=document.createElement('div');d.className='section detail-section cs-other-install-detail';
          d.innerHTML=`<div class="section-head"><div><h3>Other installations</h3><span class="meta">${a.length} items</span></div><button class="mini" onclick="csOpenOtherInstallation(null,'${id}')">+ Add installation</button></div>
          <div class="btnrow" style="margin:10px 0"><button class="mini" onclick="csOpenOtherInstallation(null,'${id}','aircon')">+ Air con</button><button class="mini" onclick="csOpenOtherInstallation(null,'${id}','pool_heater')">+ Pool heater</button><button class="mini" onclick="csOpenOtherInstallation(null,'${id}','water_heater')">+ Water heater</button></div>
          ${a.length?a.map(x=>`<div class="job"><div><strong>${tlabel(x.type)} · ${E([x.manufacturer,x.model].filter(Boolean).join(' ')||'Equipment')}</strong><p>Serial: ${E(x.serial||'—')}${x.capacity?` · ${E(x.capacity)}`:''}</p></div><button class="mini" onclick="csOpenOtherInstallation('${x.id}')">Edit</button></div>`).join(''):'<div class="empty">No other installations recorded.</div>'}`;
          body.appendChild(d);
        }
      },0);return r;
    };
  }

  // Clean up v1 UI if that script is still present.
  document.getElementById('assetRegisterSection')?.remove();
  document.getElementById('assetModal')?.remove();

  migrateV1();
  ensureSolarExtrasUI();
  installOtherUI();
  renderOther();
})();