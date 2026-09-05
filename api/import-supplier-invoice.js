// CS Energy - AI supplier invoice extraction
const SUPABASE_URL='https://xhbftdpbowqpfnvsvybt.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_cEsokxhFCIbvq4YUl5SoEQ_KsGSfeXt';
const send=(res,status,body)=>res.status(status).json(body);
async function verify(req){
 const auth=req.headers.authorization||'';
 if(!auth.startsWith('Bearer '))return false;
 const r=await fetch(`${SUPABASE_URL}/auth/v1/user`,{headers:{Authorization:auth,apikey:SUPABASE_PUBLISHABLE_KEY}});
 return r.ok;
}
function clean(v){if(typeof v!=='string')return'';const i=v.indexOf(',');return v.startsWith('data:')&&i>=0?v.slice(i+1):v}
function outputText(j){if(j?.output_text?.trim())return j.output_text.trim();let a=[];for(const it of j?.output||[])for(const c of it?.content||[])if(typeof c?.text==='string')a.push(c.text);return a.join('\n').trim()}
const schema={type:'object',properties:{
 supplier_name:{type:['string','null']},supplier_tax_id:{type:['string','null']},supplier_email:{type:['string','null']},supplier_phone:{type:['string','null']},supplier_address:{type:['string','null']},
 invoice_number:{type:['string','null']},invoice_date:{type:['string','null']},due_date:{type:['string','null']},currency:{type:['string','null']},
 subtotal_net:{type:['number','null']},iva_rate:{type:['number','null']},iva_amount:{type:['number','null']},total_gross:{type:['number','null']},
 line_items:{type:'array',items:{type:'object',properties:{
  description:{type:'string'},quantity:{type:['number','null']},unit_price_net:{type:['number','null']},line_total_net:{type:['number','null']},tax_rate:{type:['number','null']},
  sku:{type:['string','null']},manufacturer:{type:['string','null']},model:{type:['string','null']}
 },required:['description','quantity','unit_price_net','line_total_net','tax_rate','sku','manufacturer','model'],additionalProperties:false}},
 notes:{type:['string','null']},confidence:{type:'number',minimum:0,maximum:1}
},required:['supplier_name','supplier_tax_id','supplier_email','supplier_phone','supplier_address','invoice_number','invoice_date','due_date','currency','subtotal_net','iva_rate','iva_amount','total_gross','line_items','notes','confidence'],additionalProperties:false};

module.exports=async function handler(req,res){
 if(req.method!=='POST'){res.setHeader('Allow','POST');return send(res,405,{error:'POST only'})}
 try{
  if(!await verify(req))return send(res,401,{error:'Please sign in before importing a supplier invoice.'});
  if(!process.env.OPENAI_API_KEY)return send(res,500,{error:'OPENAI_API_KEY is not configured on Vercel.'});
  const {filename,mimeType,base64}=req.body||{},name=String(filename||'invoice.pdf').slice(0,180),type=String(mimeType||'application/pdf').toLowerCase(),raw=clean(base64);
  if(type!=='application/pdf'&&!name.toLowerCase().endsWith('.pdf'))return send(res,400,{error:'Please upload a PDF invoice.'});
  if(!raw)return send(res,400,{error:'No PDF data was received.'});
  if(Math.floor(raw.length*3/4)>2.5*1024*1024)return send(res,413,{error:'Please use a PDF under 2.5 MB.'});
  const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({
   model:'gpt-5.6-terra',reasoning:{effort:'low'},
   input:[
    {role:'system',content:'You extract supplier invoices RECEIVED by CS Energy / Competa Solar. Identify the company issuing the invoice as supplier. Extract supplier details, invoice metadata, totals, IVA and every genuine purchased line item. Preserve supplier SKUs/references, manufacturer and model numbers where shown. Do not invent values. Ignore subtotal/IVA/total rows as product lines. Delivery, freight, discounts and admin charges may remain as line items if genuinely billed.'},
    {role:'user',content:[{type:'input_file',filename:name,file_data:`data:application/pdf;base64,${raw}`},{type:'input_text',text:'Extract this supplier invoice into the required schema. Pay special attention to supplier name, supplier SKU/reference, manufacturer, model, quantities, unit prices, due date and totals.'}]}
   ],
   text:{format:{type:'json_schema',name:'cs_energy_supplier_invoice',strict:true,schema}},store:false
  })});
  const j=await r.json();if(!r.ok)return send(res,502,{error:j?.error?.message||'Could not read supplier invoice.'});
  const t=outputText(j);if(!t)return send(res,502,{error:'No supplier invoice data was returned.'});
  let invoice;try{invoice=JSON.parse(t)}catch(e){return send(res,502,{error:'The extracted supplier invoice data could not be parsed.'})}
  return send(res,200,{ok:true,invoice,source_filename:name});
 }catch(e){console.error(e);return send(res,500,{error:e?.message||'Supplier invoice import failed.'})}
};
