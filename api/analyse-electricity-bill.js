export const config={api:{bodyParser:{sizeLimit:'20mb'}}};

const SUPABASE_URL='https://xhbftdpbowqpfnvsvybt.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_cEsokxhFCIbvq4YUl5SoEQ_KsGSfeXt';

async function verify(req){
 const auth=req.headers.authorization||'';
 if(!auth.startsWith('Bearer '))return false;
 const r=await fetch(`${SUPABASE_URL}/auth/v1/user`,{headers:{Authorization:auth,apikey:SUPABASE_PUBLISHABLE_KEY}});
 return r.ok;
}
function roundPanelKw(panels,w=510){return Math.round((panels*w/1000)*100)/100}
function nearestInv(pv){const sizes=[3,3.6,5,6,8,10,12,15];return sizes.find(x=>x>=pv*.8)||15}
function batteryFor(daily,mode,future){
 if(mode==='economy')return 0;
 if(daily<5)return mode==='maximum'&&future>0?5:0;
 if(daily<9)return mode==='maximum'?5:0;
 if(daily<15)return mode==='recommended'?5:10;
 if(daily<22)return mode==='recommended'?10:15;
 return mode==='recommended'?15:20;
}
function panelCount(targetKw,w=510){
 return Math.max(4,Math.ceil((targetKw*1000)/w));
}
function sizeOptions(annual,future){
 const yieldKwhPerKwp=1550; // conservative Málaga/Axarquía planning assumption; final design requires site-specific yield.
 const daily=annual/365;
 const make=(name,factor,mode)=>{
   const target=Math.max(2.0,(annual*factor)/yieldKwhPerKwp);
   const panels=panelCount(target,510),pv=roundPanelKw(panels,510),inv=nearestInv(pv),bat=batteryFor(daily,mode,future);
   return {name,pv_kw:pv,panels,panel_watts:510,inverter_kw:inv,battery_kwh:bat,
    reason: mode==='economy'
      ? 'Conservative self-consumption option. PV is based on estimated annual energy use, not contracted power; battery omitted unless consumption evidence supports it.'
      : mode==='recommended'
      ? 'Balanced option targeting a larger share of annual consumption while avoiding oversizing from contracted power alone. Battery is only added when daily consumption supports useful cycling.'
      : 'Higher self-sufficiency option sized from consumption and planned loads. It does not automatically match the contracted-power figure; backup storage is only added where the load profile justifies it.'};
 };
 return [make('Economy',0.55,'economy'),make('Recommended',0.80,'recommended'),make('Maximum saving / backup',1.00,'maximum')];
}

export default async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
 try{
  if(!await verify(req))return res.status(401).json({error:'Please sign in.'});
  const key=process.env.OPENAI_API_KEY;if(!key)throw Error('OPENAI_API_KEY not configured');
  const {base64,mimeType='application/pdf',futureLoads={}}=req.body||{};if(!base64)throw Error('No bill supplied');
  const schema={type:'object',properties:{
   supplier:{type:['string','null']},tariff:{type:['string','null']},contracted_power_kw:{type:['number','null']},
   billing_period_days:{type:['number','null']},period_consumption_kwh:{type:['number','null']},
   annual_consumption_kwh:{type:['number','null']},summary:{type:'string'}
  },required:['supplier','tariff','contracted_power_kw','billing_period_days','period_consumption_kwh','annual_consumption_kwh','summary'],additionalProperties:false};
  const prompt=`Extract electricity-consumption facts from this Spanish electricity bill. Do not size solar. Do not infer consumption from contracted power. annual_consumption_kwh must only be populated if the document itself shows a 12-month/annual consumption total or equivalent annual history. billing_period_days and period_consumption_kwh must come from the billed period if visible. Do not invent missing values.`;
  const rr=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({
    model:'gpt-5-mini',input:[{role:'user',content:[{type:'input_text',text:prompt},{type:'input_file',filename:'electricity-bill.pdf',file_data:`data:${mimeType};base64,${base64}`}]}],
    text:{format:{type:'json_schema',name:'bill_facts',strict:true,schema}}
  })});
  const j=await rr.json();if(!rr.ok)throw Error(j.error?.message||'AI request failed');
  const txt=j.output?.flatMap(x=>x.content||[]).find(x=>x.type==='output_text')?.text;if(!txt)throw Error('No analysis returned');
  const f=JSON.parse(txt);
  let baseAnnual=null,source='unknown',confidence='Low';
  if(Number(f.annual_consumption_kwh)>0){baseAnnual=Math.round(Number(f.annual_consumption_kwh));source='bill';confidence='High'}
  else if(Number(f.period_consumption_kwh)>0&&Number(f.billing_period_days)>=20){
    baseAnnual=Math.round(Number(f.period_consumption_kwh)/Number(f.billing_period_days)*365);
    source='annualised_period';confidence=Number(f.billing_period_days)>=60?'Medium':'Low';
  }
  const future=Object.values(futureLoads||{}).reduce((a,v)=>a+(Number(v)||0),0);
  const adjusted=baseAnnual!=null?Math.round(baseAnnual+future):null;
  const daily=f.period_consumption_kwh&&f.billing_period_days?Math.round((Number(f.period_consumption_kwh)/Number(f.billing_period_days))*100)/100:null;
  const options=adjusted!=null?sizeOptions(adjusted,future):[];
  const caveat=source==='bill'
    ? 'Sizing is indicative and should still be checked against roof orientation, shading, usable roof area, network/export limits, site survey and the customer’s actual daytime load profile.'
    : 'The bill does not provide confirmed 12-month consumption. The annual figure is an annualised estimate from the available billing period, so seasonal variation may be significant. Obtain 12 months of consumption or distributor interval data before final design.';
  return res.status(200).json({analysis:{
    supplier:f.supplier,tariff:f.tariff,contracted_power_kw:f.contracted_power_kw,
    billing_period_days:f.billing_period_days,period_consumption_kwh:f.period_consumption_kwh,daily_average_kwh:daily,
    annual_consumption_kwh:f.annual_consumption_kwh,estimated_annual_consumption_kwh:baseAnnual,annual_consumption_source:source,
    future_loads_total_kwh:Math.round(future),adjusted_annual_consumption_kwh:adjusted,confidence,
    summary:f.summary,system_options:options,caveat
  }});
 }catch(e){return res.status(500).json({error:e.message||'Bill analysis failed'})}
}