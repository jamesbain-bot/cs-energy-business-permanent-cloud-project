// Engineer customer records v3 — extends employee-systems-access.js
(function(){
const T='cs_energy_engineer_systems';
function cJobs(id){return (data.jobs||[]).filter(j=>j.customerId===id).sort((a,b)=>(b.date||'').localeCompare(a.date||''))}
function cleanJobs(id){return cJobs(id).map(j=>({id:j.id,date:j.date||'',type:j.type||'',status:j.status||'',tech:j.tech||'',notes:j.notes||'',workDone:j.workDone||'',readings:j.readings||'',parts:j.parts||''}))}
function cleanSystemV3(s,c){
 return {id:s.id,customerId:s.customerId,customer:{name:c.name||'',phone:c.phone||'',email:c.email||'',location:c.location||'',address:c.address||'',plan:c.plan||'No plan',nextService:c.nextService||''},
 installed:s.installed||'',pv:s.pv||0,panels:s.panels||'',inverter:s.inverter||'',serial:s.serial||'',battery:s.battery||'',batteryKwh:s.batteryKwh||0,
 monitoring:s.monitoring||s.monitorPlatform||'',solarWebUrl:s.solarWebUrl||'',vrmUrl:s.vrmUrl||s.victronUrl||'',solplanetUrl:s.solplanetUrl||'',
 notes:s.notes||'',jobs:cleanJobs(s.customerId),
 batteries:(s.batteries||[]).map(b=>({manufacturer:b.manufacturer||'',model:b.model||'',serial:b.serial||'',capacity:b.capacity||'',location:b.location||'',notes:b.notes||''})),
 evChargers:(s.evChargers||[]).map(x=>({manufacturer:x.manufacturer||'',model:x.model||'',serial:x.serial||'',capacity:x.capacity||'',location:x.location||'',notes:x.notes||''}))
 };
}
function cleanAssetV3(a,c){
 return {id:a.id,customerId:a.customerId,type:a.type||'other',customer:{name:c.name||'',phone:c.phone||'',email:c.email||'',location:c.location||'',address:c.address||'',plan:c.plan||'No plan',nextService:c.nextService||''},
 manufacturer:a.manufacturer||'',model:a.model||'',serial:a.serial||'',capacity:a.capacity||'',installed:a.installed||'',warrantyEnd:a.warrantyEnd||'',location:a.location||'',status:a.status||'',notes:a.notes||'',jobs:cleanJobs(a.customerId)};
}
window.csSyncEngineerSystems=async function(){
 try{
  const {data:{user}}=await sb.auth.getUser();if(!user)throw Error('Please sign in.');
  const rows=[];
  (data.systems||[]).forEach(s=>rows.push({owner_user_id:user.id,record_id:'system:'+s.id,kind:'solar',payload:cleanSystemV3(s,customer(s.customerId)),updated_at:new Date().toISOString()}));
  (data.assets||[]).forEach(a=>rows.push({owner_user_id:user.id,record_id:'installation:'+a.id,kind:'installation',payload:cleanAssetV3(a,customer(a.customerId)),updated_at:new Date().toISOString()}));
  const {error:d}=await sb.from(T).delete().eq('owner_user_id',user.id);if(d)throw d;
  if(rows.length){const {error}=await sb.from(T).insert(rows);if(error)throw error}
  alert('Engineer records synced: systems, installations, care plans and service/job history. Financial values are excluded.');
 }catch(e){alert(e.message)}
};
})();