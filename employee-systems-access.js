// CS Energy Engineer v2 — all systems/installations, no financial values
(function(){
const SYSTEMS_TABLE='cs_energy_engineer_systems';

async function csOwner(){
  const {data:{user}}=await sb.auth.getUser();
  if(!user) throw Error('Please sign in.');
  return user;
}
function cleanSystem(s,c){
  return {
    id:s.id, customerId:s.customerId,
    customer:{name:c.name||'',phone:c.phone||'',email:c.email||'',location:c.location||'',address:c.address||''},
    installed:s.installed||'', pv:s.pv||0, panels:s.panels||'', inverter:s.inverter||'', serial:s.serial||'',
    battery:s.battery||'', batteryKwh:s.batteryKwh||0, monitoring:s.monitoring||'',
    batteries:(s.batteries||[]).map(b=>({manufacturer:b.manufacturer||'',model:b.model||'',serial:b.serial||'',capacity:b.capacity||'',location:b.location||'',notes:b.notes||''})),
    evChargers:(s.evChargers||[]).map(x=>({manufacturer:x.manufacturer||'',model:x.model||'',serial:x.serial||'',capacity:x.capacity||'',location:x.location||'',notes:x.notes||''}))
  };
}
function cleanInstallation(a,c){
  return {
    id:a.id, customerId:a.customerId, type:a.type||'other',
    customer:{name:c.name||'',phone:c.phone||'',email:c.email||'',location:c.location||'',address:c.address||''},
    manufacturer:a.manufacturer||'',model:a.model||'',serial:a.serial||'',capacity:a.capacity||'',
    installed:a.installed||'',warrantyEnd:a.warrantyEnd||'',location:a.location||'',status:a.status||'',notes:a.notes||''
  };
}
window.csSyncEngineerSystems=async function(){
 try{
  const u=await csOwner();
  const payload=[];
  (data.systems||[]).forEach(s=>payload.push({owner_user_id:u.id,record_id:'system:'+s.id,kind:'solar',payload:cleanSystem(s,customer(s.customerId)),updated_at:new Date().toISOString()}));
  (data.assets||[]).forEach(a=>payload.push({owner_user_id:u.id,record_id:'installation:'+a.id,kind:'installation',payload:cleanInstallation(a,customer(a.customerId)),updated_at:new Date().toISOString()}));
  const {error:d}=await sb.from(SYSTEMS_TABLE).delete().eq('owner_user_id',u.id); if(d)throw d;
  if(payload.length){const {error}=await sb.from(SYSTEMS_TABLE).insert(payload);if(error)throw error}
  alert('Engineer systems synced. '+payload.length+' systems/installations available to employees. No prices or financial values are included.');
 }catch(e){alert(e.message)}
};
function addButton(){
 const card=document.getElementById('engineerAppSettingsCard');
 if(card&&!document.getElementById('syncEngineerSystemsBtn')){
  const b=document.createElement('button');b.id='syncEngineerSystemsBtn';b.className='ghost';b.style.marginTop='8px';b.textContent='Sync systems to Engineer app';b.onclick=csSyncEngineerSystems;card.appendChild(b);
 }
}
new MutationObserver(addButton).observe(document.body,{childList:true,subtree:true});addButton();
})();