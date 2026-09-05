// CS Energy Installed System Workflow v1
(function(){
const B='customer-documents',E=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
let Q=null, pendingPhotos=[];

function infer(q){
 const text=(q.lines||[]).map(l=>`${l.qty||1} ${l.description||''}`).join(' | ');
 const pv=Number((text.match(/(\d+(?:\.\d+)?)\s*kWp/i)||[])[1]||0);
 const bat=Number((text.match(/(\d+(?:\.\d+)?)\s*kWh[^|]*(?:battery|batter)/i)||[])[1]||0);
 const inv=(text.match(/([^|]{0,60}(?:Fronius|Solplanet|Victron|GoodWe|Growatt|Huawei|Kostal|Deye)[^|]{0,70}(?:inverter|Quattro|MultiPlus|GEN24)?)/i)||[])[1]||'';
 const panelLine=(q.lines||[]).find(l=>/panel|module|solar/i.test(l.description||''));
 const panels=panelLine?`${panelLine.qty||''} × ${panelLine.description||''}`.trim():'';
 const batteryLine=(q.lines||[]).find(l=>/battery|batter/i.test(l.description||''));
 return {pv,inverter:inv.trim(),battery:batteryLine?.description||'',batteryKwh:bat,panels};
}
function modal(){
 let m=document.getElementById('csInstalledModal');if(m)return m;
 m=document.createElement('div');m.id='csInstalledModal';m.className='modal';m.style.zIndex='1500';
 m.innerHTML=`<div class="modalbox wide"><div class="modaltop"><h2>Confirm installed system</h2><button class="close" onclick="closeModal('csInstalledModal')">×</button></div>
 <form id="csInstalledForm"><div class="formgrid">
 <div class="field"><label>Installation date</label><input name="installed" type="date" required></div>
 <div class="field"><label>PV size kWp</label><input name="pv" type="number" step=".01"></div>
 <div class="field full"><label>Panels actually installed</label><input name="panels" placeholder="e.g. 12 × AIKO 510 W"></div>
 <div class="field"><label>Inverter</label><input name="inverter"></div>
 <div class="field"><label>Inverter serial number</label><input name="serial"></div>
 <div class="field"><label>Battery</label><input name="battery"></div>
 <div class="field"><label>Battery capacity kWh</label><input name="batteryKwh" type="number" step=".1"></div>
 <div class="field full"><label>Battery serial number(s)</label><textarea name="batterySerials" placeholder="One per line"></textarea></div>
 <div class="field"><label>Monitoring platform</label><input name="monitorPlatform"></div>
 <div class="field"><label>Plant / site ID</label><input name="monitoring"></div>
 <div class="field full"><label>Installation notes</label><textarea name="notes"></textarea></div></div>
 <div class="section-head"><h3>Installation photos</h3><span class="muted">Take photos on phone/tablet or choose existing images.</span></div>
 <div class="grid3">
 ${['Overall installation','Panels / roof','Inverter','Battery','Consumer unit / protection','Meter','Serial number label','Other'].map((t,i)=>`<label class="card" style="padding:12px"><b>${t}</b><input type="file" accept="image/*" capture="environment" data-photo-type="${t}" style="margin-top:8px"><small class="muted" id="csPhoto${i}"></small></label>`).join('')}
 </div><div class="formactions"><button type="button" class="ghost" onclick="closeModal('csInstalledModal')">Cancel</button><button class="primary">Save installed system</button></div></form></div>`;
 document.body.appendChild(m);
 m.querySelectorAll('input[data-photo-type]').forEach((x,i)=>x.addEventListener('change',()=>{if(x.files?.[0])document.getElementById('csPhoto'+i).textContent=x.files[0].name}));
 m.querySelector('#csInstalledForm').onsubmit=saveInstalled;
 return m;
}
function open(qid){
 const q=data.quotes.find(x=>x.id===qid);if(!q)return alert('Quote not found.');
 Q=q;pendingPhotos=[];const m=modal(),f=m.querySelector('form'),a=infer(q);f.reset();
 f.elements.installed.value=iso(new Date());f.elements.pv.value=a.pv||'';f.elements.panels.value=a.panels||'';
 f.elements.inverter.value=a.inverter||'';f.elements.battery.value=a.battery||'';f.elements.batteryKwh.value=a.batteryKwh||'';
 m.classList.add('open');
}
async function uploadPhotos(systemId,customerId,inputs){
 const {data:{user}}=await sb.auth.getUser();if(!user)throw Error('Please sign in.');
 for(const input of inputs){const file=input.files?.[0];if(!file)continue;
   const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'_'),path=`${user.id}/${customerId}/installations/${systemId}/${Date.now()}-${crypto.randomUUID()}-${safe}`;
   const {error}=await sb.storage.from(B).upload(path,file,{contentType:file.type||'image/jpeg'});if(error)throw error;
   const {error:db}=await sb.from('system_installation_photos').insert({owner_user_id:user.id,customer_id:customerId,system_id:systemId,photo_type:input.dataset.photoType,file_name:file.name,storage_path:path});
   if(db)throw db;
 }
}
async function saveInstalled(e){
 e.preventDefault();if(!Q)return;
 const f=e.target,v=Object.fromEntries(new FormData(f)),existing=data.systems.find(s=>s.customerId===Q.customerId);
 if(existing&&!confirm('This customer already has a system record. Update that system instead of creating a duplicate?'))return;
 const s=existing||{id:uid('s_'),customerId:Q.customerId};
 Object.assign(s,{installed:v.installed,pv:Number(v.pv||0),panels:v.panels,inverter:v.inverter,serial:v.serial,battery:v.battery,batteryKwh:Number(v.batteryKwh||0),batterySerials:v.batterySerials,monitorPlatform:v.monitorPlatform,monitoring:v.monitoring,notes:v.notes,sourceQuoteId:Q.id,sourceQuoteRef:Q.ref});
 if(!existing)data.systems.push(s);
 const c=data.customers.find(x=>x.id===Q.customerId);if(c){c.pipelineStatus='Completed';const d=new Date(v.installed+'T12:00:00');d.setFullYear(d.getFullYear()+1);c.nextService=iso(d)}
 Q.status='Complete';Q.completed=true;Q.installedAt=v.installed;Q.systemId=s.id;
 save();render();
 const btn=f.querySelector('button.primary');btn.disabled=true;btn.textContent='Uploading photos…';
 try{await uploadPhotos(s.id,Q.customerId,[...f.querySelectorAll('input[data-photo-type]')]);closeModal('csInstalledModal');closeModal('quoteDetailModal');render();switchView('systems');alert('Installed system created and installation photos saved.')}
 catch(err){alert('System was saved, but one or more photos could not upload: '+err.message)}
 finally{btn.disabled=false;btn.textContent='Save installed system'}
}
window.csInstallQuote=open;

// Intercept Complete so it opens confirmation instead of immediately completing.
const oldSet=window.setQuoteStatus||(typeof setQuoteStatus==='function'?setQuoteStatus:null);
if(oldSet)window.setQuoteStatus=function(id,status){if(status==='Complete'||status==='Installed')return open(id);return oldSet.apply(this,arguments)};
const oldToggle=window.toggleComplete||(typeof toggleComplete==='function'?toggleComplete:null);
if(oldToggle)window.toggleComplete=function(id){const q=data.quotes.find(x=>x.id===id);if(q&&!q.completed)return open(id);return oldToggle.apply(this,arguments)};

// Adds an explicit Installed button to quote detail if the current UI has only Complete.
const oldOpen=window.openQuoteDetail||(typeof openQuoteDetail==='function'?openQuoteDetail:null);
if(oldOpen)window.openQuoteDetail=function(id){const r=oldOpen.apply(this,arguments);setTimeout(()=>{const host=document.getElementById('quoteDetailModal');if(!host||host.querySelector('.cs-installed-btn'))return;const row=host.querySelector('.formactions');if(!row)return;const q=data.quotes.find(x=>x.id===id);if(!q||q.completed)return;const b=document.createElement('button');b.className='primary cs-installed-btn';b.textContent='Mark Installed';b.onclick=()=>open(id);row.insertBefore(b,row.firstChild)},0);return r};
})();