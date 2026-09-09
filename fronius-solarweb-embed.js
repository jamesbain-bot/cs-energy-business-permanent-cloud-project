(function(){
function ensureField(){
 const f=document.getElementById('systemForm'); if(!f||f.querySelector('[name="solarWebUrl"]'))return;
 const g=f.querySelector('.formgrid'); if(!g)return;
 const d=document.createElement('div'); d.className='field full';
 d.innerHTML='<label>Fronius Solar.web Public Display URL</label><input name="solarWebUrl" type="url" placeholder="https://www.solarweb.com/PublicDisplay?token=..."><div class="muted" style="font-size:11px">Paste the read-only Solar.web Public Display link.</div>';
 g.appendChild(d);
}

function show(id){
 const s=data.systems.find(x=>x.id===id); if(!s)return alert('System not found.');
 const url=(s.solarWebUrl||'').trim(); if(!url)return alert('No Solar.web Public Display URL has been added.');

 // Existing systems: open the stored Solar.web URL directly.
 // New systems created after this update can be flagged solarWebEmbed=true
 // and will use the in-app iframe.
 if(s.solarWebEmbed!==true){
   window.open(url,'_blank','noopener,noreferrer');
   return;
 }

 let m=document.getElementById('solarWebModal');
 if(!m){
   m=document.createElement('div');
   m.id='solarWebModal';
   m.className='modal';
   m.style.zIndex='1700';
   m.innerHTML=`<div class="modalbox wide" style="width:min(1400px,98vw);height:94vh;display:flex;flex-direction:column">
     <div class="modaltop">
       <h2>Live Monitoring · Fronius Solar.web</h2>
       <div>
         <a id="solarWebExternal" class="ghost" target="_blank" rel="noopener">Open Solar.web</a>
         <button class="close" onclick="closeModal('solarWebModal')">×</button>
       </div>
     </div>
     <div style="flex:1;min-height:0;border:1px solid #2b4054;border-radius:14px;overflow:hidden;background:white">
       <iframe id="solarWebFrame" style="width:100%;height:100%;border:0" allowfullscreen></iframe>
     </div>
   </div>`;
   document.body.appendChild(m);
 }
 document.getElementById('solarWebExternal').href=url;
 document.getElementById('solarWebFrame').src=url;
 m.classList.add('open');
}

const oldOpen=window.openSystemModal||(typeof openSystemModal==='function'?openSystemModal:null);
if(oldOpen)window.openSystemModal=function(id=null){
 ensureField();
 const r=oldOpen.apply(this,arguments);
 setTimeout(()=>{
   ensureField();
   if(id){
     const s=data.systems.find(x=>x.id===id),f=document.getElementById('systemForm');
     if(f?.elements.solarWebUrl)f.elements.solarWebUrl.value=s?.solarWebUrl||'';
   }
 },0);
 return r;
};

const oldCust=window.openCustomerDetail||(typeof openCustomerDetail==='function'?openCustomerDetail:null);
if(oldCust)window.openCustomerDetail=function(id){
 const r=oldCust.apply(this,arguments);
 setTimeout(()=>{
   const s=data.systems.find(x=>x.customerId===id),b=document.getElementById('customerDetailBody');
   if(!s?.solarWebUrl||!b||b.querySelector('.solarweb-btn'))return;
   const sec=[...b.querySelectorAll('.detail-section')].find(x=>/Installed system/i.test(x.textContent));
   if(!sec)return;
   const btn=document.createElement('button');
   btn.className='mini solarweb-btn';
   btn.textContent='Live Monitoring';
   btn.onclick=()=>show(s.id);
   sec.appendChild(btn);
 },0);
 return r;
};

document.addEventListener('submit',e=>{
 if(e.target?.id!=='systemForm')return;
 const f=e.target,v=f.elements.solarWebUrl?.value?.trim();
 if(!v)return;

 // Capture whether this was a brand-new system before the original form
 // handler clears editingSystemId.
 const wasNew=!editingSystemId;

 setTimeout(()=>{
   let s=editingSystemId?data.systems.find(x=>x.id===editingSystemId):data.systems[data.systems.length-1];
   if(s){
     s.solarWebUrl=v;
     s.monitorPlatform=s.monitorPlatform||'Fronius Solar.web';

     // Only brand-new systems get embedding enabled automatically.
     // Existing systems remain untouched and therefore open externally.
     if(wasNew && typeof s.solarWebEmbed==='undefined') s.solarWebEmbed=true;

     save();
     render();
   }
 },0);
},true);

ensureField();
new MutationObserver(ensureField).observe(document.body,{childList:true,subtree:true});
window.csShowSolarWeb=show;
})();