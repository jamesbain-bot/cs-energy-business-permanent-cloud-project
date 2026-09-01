import crypto from 'node:crypto';

export const config={api:{bodyParser:false}};
const SUPABASE_URL='https://xhbftdpbowqpfnvsvybt.supabase.co';

async function rawBody(req){
  if(Buffer.isBuffer(req.body)) return req.body;
  if(typeof req.body==='string') return Buffer.from(req.body);
  const chunks=[]; for await(const chunk of req) chunks.push(Buffer.from(chunk)); return Buffer.concat(chunks);
}
function validStripeSignature(raw,header,secret){
  if(!header||!secret)return false;
  const parts=Object.fromEntries(header.split(',').map(x=>x.split('=')));
  const t=parts.t, v1=header.split(',').filter(x=>x.startsWith('v1=')).map(x=>x.slice(3));
  if(!t||!v1.length||Math.abs(Date.now()/1000-Number(t))>300)return false;
  const expected=crypto.createHmac('sha256',secret).update(`${t}.${raw.toString('utf8')}`).digest('hex');
  return v1.some(sig=>sig.length===expected.length&&crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected)));
}
async function sb(path,method='GET',body){
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!key)throw new Error('SUPABASE_SERVICE_ROLE_KEY missing');
  const r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{method,headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',Prefer:'return=representation'},body:body?JSON.stringify(body):undefined});
  const txt=await r.text(); if(!r.ok)throw new Error(`Supabase ${r.status}: ${txt}`); return txt?JSON.parse(txt):null;
}
async function fulfil(session){
  if(session.payment_status!=='paid')return;
  const ref=String(session.client_reference_id||'');
  if(ref.startsWith('svc_')){
    const id=ref.slice(4);
    await sb(`customer_service_requests?id=eq.${encodeURIComponent(id)}&status=eq.Payment%20pending`,'PATCH',{status:'Paid',updated_at:new Date().toISOString()});
    return;
  }
  if(ref.startsWith('care_')){
    const id=ref.slice(5);
    const rows=await sb(`customer_care_plan_requests?id=eq.${encodeURIComponent(id)}&select=owner_user_id,customer_id,requested_plan`);
    const r=rows?.[0]; if(!r)return;
    await sb(`customer_care_plan_requests?id=eq.${encodeURIComponent(id)}`,'PATCH',{status:'Paid',updated_at:new Date().toISOString()});
    await sb(`customer_portal_access?owner_user_id=eq.${encodeURIComponent(r.owner_user_id)}&customer_id=eq.${encodeURIComponent(r.customer_id)}`,'PATCH',{plan:r.requested_plan,plan_status:'active',updated_at:new Date().toISOString()});
  }
}
export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  try{
    const raw=await rawBody(req), secret=process.env.STRIPE_WEBHOOK_SECRET;
    if(!validStripeSignature(raw,req.headers['stripe-signature'],secret))return res.status(400).json({error:'Invalid Stripe signature'});
    const event=JSON.parse(raw.toString('utf8'));
    if(event.type==='checkout.session.completed'||event.type==='checkout.session.async_payment_succeeded')await fulfil(event.data.object);
    return res.status(200).json({received:true});
  }catch(e){console.error(e);return res.status(500).json({error:'Webhook processing failed'});}
}
