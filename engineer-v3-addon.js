// ENGINEER.HTML v3 ADD-ON
// Add this script immediately before </body>, AFTER the main engineer script.
(function(){
let customerMedia=[],activeCustomerId='',activeOwnerId='';

function monitorUrl(p){
 const raw=p.solarWebUrl||p.vrmUrl||p.solplanetUrl||'';
 if(raw && /^https?:\/\//i.test(raw)) return raw;
 const m=String(p.monitoring||'').toLowerCase();
 if(m.includes('fronius')||m.includes('solar.web')) return 'https://www.solarweb.com/';
 if(m.includes('victron')||m.includes('vrm')) return 'https://vrm.victronenergy.com/';
 if(m.includes('solplanet')) return 'https://www.solplanet.net/';
 return '';
}
window.openEngineerCustomer=async function(customerId,ownerId){
 activeCustomerId=customerId;activeOwnerId=ownerId;
 const related=systemRows.filter(r=>(r.payload||{}).customerId===customerId);
 const base=related[0]?.payload||{},c=base.customer||{},jobs=base.jobs||[];
 const {data:media}=await sb.from('cs_energy_engineer_customer_media').select('*').eq('owner_user_id',ownerId).eq('customer_id',customerId).order('created_at',{ascending:false});
 customerMedia=media||[];
 jobsView.classList.add('hidden');systemsView.classList.add('hidden');detail.classList.remove('hidden');
 detail.innerHTML=`<button onclick="showTab('systems')">← Systems</button>
 <div class="card"><div class="jobhead"><div><h2>${E(c.name||'Customer')}</h2><p>${E(c.address||c.location||'')}</p></div><span class="pill green">${E(c.plan||'No plan')}</span></div>
 <p>${E(c.phone||'')} ${c.email?'· '+E(c.email):''}</p><div class="kv"><span class="muted">Care plan</span><strong>${E(c.plan||'No plan')}</strong><span class="muted">Next service</span><span>${E(c.nextService||'—')}</span></div></div>
 <div class="card"><h3>Systems & installations</h3>${related.map(r=>{const p=r.payload||{};if(r.kind==='solar'){const u=monitorUrl(p);return `<div class="equipment"><strong>☀ ${E(p.inverter||'Solar system')} · ${E(p.pv||0)} kWp</strong><p>Serial: ${E(p.serial||'—')} · Panels: ${E(p.panels||'—')}</p><p>Battery: ${E(p.battery||'—')} ${p.batteryKwh?E(p.batteryKwh)+' kWh':''}</p>${u?`<button class="primary" onclick="window.open('${E(u)}','_blank','noopener')">📡 Live monitoring</button>`:'<span class="muted">Live monitoring not linked</span>'}</div>`}return `<div class="equipment"><strong>${E(p.type||'Installation')} · ${E([p.manufacturer,p.model].filter(Boolean).join(' ')||'Equipment')}</strong><p>Serial: ${E(p.serial||'—')} ${p.capacity?'· '+E(p.capacity):''}</p></div>`}).join('')}</div>
 <div class="card"><h3>Service & job history</h3>${jobs.length?jobs.map(j=>`<div class="equipment"><div class="jobhead"><strong>${E(j.date||'')} · ${E(j.type||'Job')}</strong><span class="pill">${E(j.status||'')}</span></div>${j.tech?`<p class="muted">Engineer: ${E(j.tech)}</p>`:''}${j.notes?`<p><strong>Reported:</strong> ${E(j.notes)}</p>`:''}${j.workDone?`<p><strong>Work carried out:</strong> ${E(j.workDone)}</p>`:''}${j.readings?`<p><strong>Readings:</strong> ${E(j.readings)}</p>`:''}${j.parts?`<p><strong>Parts:</strong> ${E(j.parts)}</p>`:''}</div>`).join(''):'<p class="muted">No previous job/service history.</p>'}</div>
 <div class="card"><h3>Customer / installation photos</h3><div class="field"><label>Photo category</label><select id="custPhotoCat"><option>Site photo</option><option>Installation</option><option>Serial number</option><option>Fault</option><option>Before work</option><option>After work</option><option>Other</option></select></div><div class="field"><label>Note</label><input id="custPhotoNote" placeholder="Optional note"></div><input type="file" accept="image/*" capture="environment" multiple onchange="uploadCustomerPhotos(event)"><div id="custMediaGrid" class="photos"></div></div>`;
 drawCustomerMedia();
};
window.uploadCustomerPhotos=async function(e){
 const files=[...e.target.files].slice(0,8),cat=custPhotoCat.value,note=custPhotoNote.value.trim(),{data:{user}}=await sb.auth.getUser();
 for(const f of files){
  const dataUrl=await new Promise(res=>{const r=new FileReader();r.onload=()=>{const im=new Image();im.onload=()=>{const max=1000,sc=Math.min(1,max/Math.max(im.width,im.height)),c=document.createElement('canvas');c.width=Math.round(im.width*sc);c.height=Math.round(im.height*sc);c.getContext('2d').drawImage(im,0,0,c.width,c.height);res(c.toDataURL('image/jpeg',.68))};im.src=r.result};r.readAsDataURL(f)});
  const {data,error}=await sb.from('cs_energy_engineer_customer_media').insert({owner_user_id:activeOwnerId,customer_id:activeCustomerId,staff_email:user.email,category:cat,note,photo_data:dataUrl}).select().single();if(error)return alert(error.message);customerMedia.unshift(data);
 }
 e.target.value='';custPhotoNote.value='';drawCustomerMedia();
};
function drawCustomerMedia(){const g=document.getElementById('custMediaGrid');if(!g)return;g.innerHTML=customerMedia.map(x=>`<div><img src="${x.photo_data}" title="${E(x.category)}"><small>${E(x.category)}${x.note?' · '+E(x.note):''}</small></div>`).join('')||'<p class="muted">No customer photos yet.</p>'}

// Replace systems renderer with clickable customer records.
const oldRS=window.renderSystems;
window.renderSystems=function(){
 const q=(systemSearch?.value||'').toLowerCase(),rows=systemRows.filter(r=>JSON.stringify(r.payload||{}).toLowerCase().includes(q));
 const seen=new Set(),groups=[];
 rows.forEach(r=>{const p=r.payload||{},id=p.customerId;if(!id||seen.has(id))return;seen.add(id);groups.push({id,owner:r.owner_user_id,c:p.customer||{},all:systemRows.filter(x=>(x.payload||{}).customerId===id)})});
 systems.innerHTML=groups.length?groups.map(g=>{const solar=g.all.find(x=>x.kind==='solar')?.payload||{},count=g.all.length;return `<div class="card" onclick="openEngineerCustomer('${g.id}','${g.owner}')"><div class="jobhead"><div><h3>${E(g.c.name||'Customer')}</h3><p>${E(g.c.location||g.c.address||'')}</p></div><span class="pill green">${E(g.c.plan||'No plan')}</span></div><p><strong>${E(solar.inverter||'Installation record')}</strong>${solar.pv?' · '+E(solar.pv)+' kWp':''}</p><p class="muted">${count} installation record${count===1?'':'s'} · ${(solar.jobs||[]).length} service/job record${(solar.jobs||[]).length===1?'':'s'}</p></div>`}).join(''):'<div class="card muted">No matching customer systems.</div>';
};
renderSystems();
})();