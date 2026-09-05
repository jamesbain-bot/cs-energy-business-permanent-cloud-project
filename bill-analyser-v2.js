// CS Energy Electricity Bill Analyser v2
(function(){
const B='customer-documents';
const E=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

function loadForm(documentId,path,customerId){
 const o=document.getElementById('csBillResult');
 if(!o)return;
 o.innerHTML=`<div class="card" style="padding:16px">
   <h3>Electricity bill sizing</h3>
   <p class="muted">Add any future electrical loads the bill cannot show. Leave them at 0 if not relevant.</p>
   <div class="formgrid">
     <div class="field"><label>Pool pump kWh/year</label><input id="csLoadPoolPump" type="number" min="0" step="50" value="0"></div>
     <div class="field"><label>Pool heater kWh/year</label><input id="csLoadPoolHeat" type="number" min="0" step="100" value="0"></div>
     <div class="field"><label>Air-conditioning kWh/year</label><input id="csLoadAircon" type="number" min="0" step="100" value="0"></div>
     <div class="field"><label>EV charging kWh/year</label><input id="csLoadEV" type="number" min="0" step="100" value="0"></div>
     <div class="field"><label>Electric water heating kWh/year</label><input id="csLoadWater" type="number" min="0" step="100" value="0"></div>
     <div class="field"><label>Other planned loads kWh/year</label><input id="csLoadOther" type="number" min="0" step="100" value="0"></div>
   </div>
   <div class="formactions">
     <button class="primary" onclick="csRunBillAnalysis('${documentId}','${path}','${customerId}')">Analyse & size system</button>
   </div>
 </div>`;
}

async function run(documentId,path,customerId){
 const o=document.getElementById('csBillResult');
 const loads={
   pool_pump_kwh:Number(document.getElementById('csLoadPoolPump')?.value||0),
   pool_heater_kwh:Number(document.getElementById('csLoadPoolHeat')?.value||0),
   aircon_kwh:Number(document.getElementById('csLoadAircon')?.value||0),
   ev_kwh:Number(document.getElementById('csLoadEV')?.value||0),
   water_heating_kwh:Number(document.getElementById('csLoadWater')?.value||0),
   other_kwh:Number(document.getElementById('csLoadOther')?.value||0)
 };
 o.innerHTML='<div class="banner">Analysing electricity bill and sizing options…</div>';
 try{
   const {data,error}=await sb.storage.from(B).download(path); if(error)throw error;
   const b64=await new Promise((r,j)=>{const f=new FileReader();f.onload=()=>r(String(f.result).split(',')[1]);f.onerror=j;f.readAsDataURL(data)});
   const s=(await sb.auth.getSession()).data.session;if(!s)throw Error('Please sign in.');
   const q=await fetch('/api/analyse-electricity-bill',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+s.access_token},body:JSON.stringify({base64:b64,mimeType:data.type||'application/pdf',futureLoads:loads})});
   const z=await q.json();if(!q.ok)throw Error(z.error||'Bill analysis failed.');
   const a=z.analysis;
   const u=(await sb.auth.getUser()).data.user;
   if(u)await sb.from('customer_bill_analyses').insert({owner_user_id:u.id,customer_id:customerId,document_id:documentId,analysis:a});
   const opts=a.system_options||[];
   o.innerHTML=`<div class="card" style="padding:16px">
     <div class="section-head"><h3>Electricity bill analysis</h3><span class="pill ${a.confidence==='High'?'green':a.confidence==='Medium'?'orange':'red'}">${E(a.confidence)} confidence</span></div>
     <div class="grid3">
       <div class="card stat"><div class="label">Bill consumption</div><div class="num">${E(a.period_consumption_kwh??'—')} kWh</div><div class="sub">${E(a.billing_period_days??'—')} days</div></div>
       <div class="card stat"><div class="label">Daily average</div><div class="num">${E(a.daily_average_kwh??'—')} kWh</div><div class="sub">From available bill data</div></div>
       <div class="card stat"><div class="label">Sizing consumption</div><div class="num">${E(a.adjusted_annual_consumption_kwh??'—')} kWh</div><div class="sub">Including planned loads</div></div>
     </div>
     <p><b>Tariff:</b> ${E(a.tariff||'—')} · <b>Contracted power:</b> ${E(a.contracted_power_kw??'—')} kW</p>
     <p>${E(a.summary||'')}</p>
     ${a.estimated_annual_consumption_kwh!=null?`<p><b>Estimated annual consumption:</b> ${E(a.estimated_annual_consumption_kwh)} kWh ${a.annual_consumption_source==='bill'?'(from bill annual history)':'(annualised estimate from available period)'}</p>`:''}
     ${a.future_loads_total_kwh?`<p><b>Future loads added:</b> ${E(a.future_loads_total_kwh)} kWh/year</p>`:''}
     <div class="grid3">${opts.map((v,i)=>`<div class="card" style="padding:14px">
       <b>${E(v.name)}</b><h3>${E(v.pv_kw)} kWp</h3>
       <p>${E(v.panels)} × ${E(v.panel_watts)} W · ${E(v.inverter_kw)} kW inverter · ${E(v.battery_kwh)} kWh battery</p>
       <p>${E(v.reason)}</p>
       <button class="primary" onclick='csCreateQuoteFromBill(${JSON.stringify(customerId)},${JSON.stringify(v)})'>Create quote</button>
     </div>`).join('')}</div>
     <p class="muted">${E(a.caveat||'')}</p>
     <button class="ghost" onclick="csBillAnalyse('${documentId}','${path}','${customerId}')">Change future loads / re-analyse</button>
   </div>`;
 }catch(e){o.innerHTML='<div class="bad">Could not analyse bill: '+E(e.message)+'</div>'}
}

function createQuote(customerId,opt){
 if(typeof openQuoteModal!=='function')return alert('Quote builder is not available.');
 openQuoteModal();
 const form=document.getElementById('quoteForm');
 if(form?.elements.customerId)form.elements.customerId.value=customerId;
 if(form?.elements.title)form.elements.title.value=`Solar PV proposal — ${opt.name}`;
 if(form?.elements.scope)form.elements.scope.value=`Preliminary proposal based on electricity-bill analysis: ${opt.pv_kw} kWp PV, ${opt.inverter_kw} kW inverter${Number(opt.battery_kwh)>0?`, ${opt.battery_kwh} kWh battery`:''}. Final sizing subject to site survey, roof/structure, shading, network limits and confirmed annual consumption.`;
 const body=document.getElementById('quoteLineBody');if(body)body.innerHTML='';
 addQuoteLine({description:`${opt.panels} × ${opt.panel_watts} W solar panels (${opt.pv_kw} kWp)`,qty:Number(opt.panels)||1,cost:0,sell:0});
 addQuoteLine({description:`${opt.inverter_kw} kW hybrid inverter`,qty:1,cost:0,sell:0});
 if(Number(opt.battery_kwh)>0)addQuoteLine({description:`${opt.battery_kwh} kWh battery storage`,qty:1,cost:0,sell:0});
 addQuoteLine({description:'Installation, protection, commissioning and legalisation',qty:1,cost:0,sell:0});
 updateQuoteSummary();
 closeModal('csDocsModal');
}

window.csBillAnalyse=loadForm;
window.csRunBillAnalysis=run;
window.csCreateQuoteFromBill=createQuote;
})();