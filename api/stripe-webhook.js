import crypto from 'node:crypto';

export const config={api:{bodyParser:false}};

const SUPABASE_URL='https://xhbftdpbowqpfnvsvybt.supabase.co';
const GOOGLE_SUBJECT='james.bain@competasolar.es';
const GOOGLE_EVENT_SCOPE='https://www.googleapis.com/auth/calendar.events';

async function rawBody(req){
  if(Buffer.isBuffer(req.body)) return req.body;
  if(typeof req.body==='string') return Buffer.from(req.body);
  const chunks=[];
  for await(const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function validStripeSignature(raw,header,secret){
  if(!header||!secret)return false;
  const parts=header.split(',');
  const t=parts.find(x=>x.startsWith('t='))?.slice(2);
  const signatures=parts.filter(x=>x.startsWith('v1=')).map(x=>x.slice(3));
  if(!t||!signatures.length||Math.abs(Date.now()/1000-Number(t))>300)return false;
  const expected=crypto.createHmac('sha256',secret).update(`${t}.${raw.toString('utf8')}`).digest('hex');
  return signatures.some(sig=>{
    if(sig.length!==expected.length)return false;
    return crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected));
  });
}

async function sb(path,method='GET',body){
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!key)throw new Error('SUPABASE_SERVICE_ROLE_KEY missing');
  const r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{
    method,
    headers:{
      apikey:key,
      Authorization:`Bearer ${key}`,
      'Content-Type':'application/json',
      Prefer:'return=representation'
    },
    body:body?JSON.stringify(body):undefined
  });
  const txt=await r.text();
  if(!r.ok)throw new Error(`Supabase ${r.status}: ${txt}`);
  return txt?JSON.parse(txt):null;
}

function b64url(input){
  return Buffer.from(input).toString('base64')
    .replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
}

async function googleAccessToken(){
  const raw=process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if(!raw)throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON missing');
  const credentials=JSON.parse(raw);
  const now=Math.floor(Date.now()/1000);
  const header=b64url(JSON.stringify({alg:'RS256',typ:'JWT'}));
  const claim=b64url(JSON.stringify({
    iss:credentials.client_email,
    sub:GOOGLE_SUBJECT,
    scope:GOOGLE_EVENT_SCOPE,
    aud:'https://oauth2.googleapis.com/token',
    iat:now,
    exp:now+3600
  }));
  const unsigned=`${header}.${claim}`;
  const signer=crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const signature=signer.sign(credentials.private_key).toString('base64')
    .replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');

  const r=await fetch('https://oauth2.googleapis.com/token',{
    method:'POST',
    headers:{'content-type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({
      grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion:`${unsigned}.${signature}`
    })
  });
  const txt=await r.text();
  if(!r.ok)throw new Error(`Google token request failed (${r.status}): ${txt.slice(0,300)}`);
  return JSON.parse(txt).access_token;
}

async function addGoogleCalendarEvent(row){
  const calendarId=process.env.GOOGLE_CALENDAR_ID;
  if(!calendarId)throw new Error('GOOGLE_CALENDAR_ID missing');

  const token=await googleAccessToken();
  const summary=`CS Energy - ${row.request_type || 'Service call'}`;
  const description=[
    row.description || '',
    row.customer_email ? `Customer: ${row.customer_email}` : '',
    `CS Energy request: ${row.id}`
  ].filter(Boolean).join('\n');

  const event={
    summary,
    description,
    start:{date:row.preferred_date},
    end:{date:new Date(new Date(`${row.preferred_date}T12:00:00Z`).getTime()+86400000).toISOString().slice(0,10)},
    extendedProperties:{private:{csEnergyRequestId:String(row.id)}}
  };

  const r=await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,{
    method:'POST',
    headers:{
      authorization:`Bearer ${token}`,
      'content-type':'application/json'
    },
    body:JSON.stringify(event)
  });
  const txt=await r.text();
  if(!r.ok)throw new Error(`Google Calendar event create failed (${r.status}): ${txt.slice(0,300)}`);
}

async function fulfil(session){
  if(session.payment_status!=='paid')return;

  const ref=String(session.client_reference_id||'');

  if(ref.startsWith('svc_')){
    const id=ref.slice(4);
    const rows=await sb(
      `customer_service_requests?id=eq.${encodeURIComponent(id)}&select=id,request_type,preferred_date,description,customer_email,status`
    );
    const row=rows?.[0];
    if(!row)return;

    const updated=await sb(
      `customer_service_requests?id=eq.${encodeURIComponent(id)}&status=eq.Payment%20pending`,
      'PATCH',
      {status:'Booked'}
    );

    if(updated?.length){
      try{
        await addGoogleCalendarEvent(row);
      }catch(e){
        console.error('stripe-webhook calendar:',e);
        // Payment stays Booked even if Calendar has a temporary issue.
      }
    }
    return;
  }

  if(ref.startsWith('care_')){
    const id=ref.slice(5);
    const rows=await sb(
      `customer_care_plan_requests?id=eq.${encodeURIComponent(id)}&select=owner_user_id,customer_id,requested_plan,status`
    );
    const r=rows?.[0];
    if(!r)return;

    await sb(
      `customer_care_plan_requests?id=eq.${encodeURIComponent(id)}&status=eq.Payment%20pending`,
      'PATCH',
      {status:'Active'}
    );

    await sb(
      `customer_portal_access?owner_user_id=eq.${encodeURIComponent(r.owner_user_id)}&customer_id=eq.${encodeURIComponent(r.customer_id)}`,
      'PATCH',
      {plan:r.requested_plan,plan_status:'active',updated_at:new Date().toISOString()}
    );

    // Keep the staff/customer master record in sync with the paid care plan.
    // The business app stores all customer records inside cs_energy_app_state.data.
    const stateRows=await sb(
      `cs_energy_app_state?user_id=eq.${encodeURIComponent(r.owner_user_id)}&select=user_id,data`
    );
    const stateRow=stateRows?.[0];
    if(stateRow?.data){
      const state=stateRow.data;
      const customers=Array.isArray(state.customers)?state.customers:[];
      const idx=customers.findIndex(c=>String(c?.id)===String(r.customer_id));
      if(idx>=0){
        customers[idx]={...customers[idx],plan:r.requested_plan};
        state.customers=customers;
        await sb(
          `cs_energy_app_state?user_id=eq.${encodeURIComponent(r.owner_user_id)}`,
          'PATCH',
          {data:state,updated_at:new Date().toISOString()}
        );
      }
    }

    // Also update the portal snapshot so both customer and staff views agree immediately.
    const snapshotRows=await sb(
      `customer_portal_snapshots?owner_user_id=eq.${encodeURIComponent(r.owner_user_id)}&customer_id=eq.${encodeURIComponent(r.customer_id)}&select=payload`
    );
    const snapshotRow=snapshotRows?.[0];
    if(snapshotRow?.payload){
      const payload=snapshotRow.payload;
      payload.customer={...(payload.customer||{}),plan:r.requested_plan};
      await sb(
        `customer_portal_snapshots?owner_user_id=eq.${encodeURIComponent(r.owner_user_id)}&customer_id=eq.${encodeURIComponent(r.customer_id)}`,
        'PATCH',
        {payload,updated_at:new Date().toISOString()}
      );
    }
  }
}

export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});

  try{
    const raw=await rawBody(req);
    const secret=process.env.STRIPE_WEBHOOK_SECRET;
    if(!validStripeSignature(raw,req.headers['stripe-signature'],secret)){
      return res.status(400).json({error:'Invalid Stripe signature'});
    }

    const event=JSON.parse(raw.toString('utf8'));
    if(event.type==='checkout.session.completed'){
      await fulfil(event.data.object);
    }

    return res.status(200).json({received:true});
  }catch(e){
    console.error('stripe-webhook:',e);
    return res.status(500).json({error:'Webhook processing failed'});
  }
}
