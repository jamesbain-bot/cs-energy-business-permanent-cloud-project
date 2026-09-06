(function(){
const KEY='csEnergySystemViewMode';
const E=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const old=window.renderSystems||(typeof renderSystems==='function'?renderSystems:null);
if(!old)return;
function getMode(){return localStorage.getItem(KEY)||'cards'}
window.csSetSystemView=v=>{localStorage.setItem(KEY,v);renderSystems()};
function install(){
 const systems=document.getElementById('systems'),tb=systems?.querySelector('.toolbar');
 if(!tb||document.getElementById('systemViewToggle'))return;
 const w=document.createElement('div');w.id='systemViewToggle';w.style.display='flex';w.style.gap='8px';
 w.innerHTML='<button class="mini" id="systemCardsBtn" onclick="csSetSystemView(\'cards\')">▦ Cards</button><button class="mini" id="systemListBtn" onclick="csSetSystemView(\'list\')">☷ List</button>';
 tb.appendChild(w);
}
function paint(){
 const m=getMode(),a=document.getElementById('systemCardsBtn'),b=document.getElementById('systemListBtn');
 if(a){a.style.background=m==='cards'?'var(--orange)':'';a.style.color=m==='cards'?'#111':''}
 if(b){b.style.background=m==='list'?'var(--orange)':'';b.style.color=m==='list'?'#111':''}
}
function batteryText(s){
 if(Array.isArray(s.batteries)&&s.batteries.length){
  const total=s.batteries.reduce((n,b)=>{const x=parseFloat(String(b.capacity||'').replace(',','.'));return n+(isNaN(x)?0:x)},0);
  return s.batteries.length+' '+(s.batteries.length===1?'battery':'batteries')+(total?' · '+total.toFixed(2).replace(/\.00$/,'')+' kWh':'');
 }
 return s.battery?String(s.battery)+(s.batteryKwh?' · '+s.batteryKwh+' kWh':''):'—';
}
function chargerText(s){
 return Array.isArray(s.evChargers)&&s.evChargers.length?s.evChargers.map(c=>[c.manufacturer,c.model,c.capacity].filter(Boolean).join(' ')).join(', '):'—';
}
function listView(){
 const h=document.getElementById('systemGrid');if(!h)return;
 const q=(document.getElementById('systemSearch')?.value||'').toLowerCase();
 const list=data.systems.filter(s=>[customer(s.customerId)?.name,customer(s.customerId)?.location,s.inverter,s.serial,s.panels,batteryText(s),chargerText(s)].join(' ').toLowerCase().includes(q));
 h.className='';
 h.innerHTML=list.length?'<div class="card table-wrap"><table class="table"><thead><tr><th>Customer</th><th>PV</th><th>Installed</th><th>Inverter</th><th>Serial</th><th>Batteries</th><th>Car charger</th><th>Panels</th><th></th></tr></thead><tbody>'+list.map(s=>{const c=customer(s.customerId);return '<tr><td><span class="name">'+E(c?.name||'—')+'</span><br><span class="muted">'+E(c?.location||'')+'</span></td><td><span class="pill green">'+Number(s.pv||0).toFixed(2).replace('.00','')+' kWp</span></td><td>'+(s.installed?prettyDate(s.installed):'—')+'</td><td>'+E(s.inverter||'—')+'</td><td>'+E(s.serial||'—')+'</td><td>'+E(batteryText(s))+'</td><td>'+E(chargerText(s))+'</td><td>'+E(s.panels||'—')+'</td><td class="actions">'+(s.solarWebUrl?'<button class="iconbtn" onclick="csShowSolarWeb(\''+s.id+'\')">Live</button>':'')+'<button class="iconbtn" onclick="openCustomerDetail(\''+s.customerId+'\')">Customer</button><button class="iconbtn" onclick="editSystem(\''+s.id+'\')">Edit</button><button class="iconbtn" onclick="newJobFor(\''+s.customerId+'\')">Job</button></td></tr>'}).join('')+'</tbody></table></div>':'<div class="empty">No system records found.</div>';
}
window.renderSystems=function(){
 install();
 if(getMode()==='list'){listView();paint();return}
 const h=document.getElementById('systemGrid');if(h)h.className='system-grid';
 const r=old.apply(this,arguments);setTimeout(()=>{install();paint()},0);return r;
};
install();renderSystems();
})();