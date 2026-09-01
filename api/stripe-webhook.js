import crypto from 'node:crypto';

export const config={api:{bodyParser:false}};

const SUPABASE_URL='https://xhbftdpbowqpfnvsvybt.supabase.co';
const GOOGLE_SUBJECT='james.bain@competasolar.es';
const GOOGLE_EVENT_SCOPE='https://www.googleapis.com/auth/calendar.events';
const CARE_PLAN_FROM='CS Energy <info@competasolar.es>';
const CARE_PLAN_ALERT_EMAIL=process.env.CARE_PLAN_ALERT_EMAIL||'info@competasolar.es';

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

async function sendEmail(to,subject,html,text){
  const key=process.env.RESEND_API_KEY;
  if(!key){
    console.error('RESEND_API_KEY missing');
    return;
  }
  if(!to)return;
  const r=await fetch('https://api.resend.com/emails',{
    method:'POST',
    headers:{
      authorization:`Bearer ${key}`,
      'content-type':'application/json'
    },
    body:JSON.stringify({from:CARE_PLAN_FROM,to:[to],subject,html,text})
  });
  const body=await r.text();
  if(!r.ok)throw new Error(`Resend ${r.status}: ${body.slice(0,300)}`);
}

function carePlanDisplay(plan,status){
  if(status==='Active')return plan;
  if(status==='Payment Failed')return `${plan} - Payment Failed`;
  if(status==='Cancelled')return `${plan} - Cancelled`;
  return plan;
}

async function updateCarePlanState(r,status){
  const now=new Date().toISOString();
  const planStatus=status==='Active'?'active':status==='Payment Failed'?'payment_failed':'cancelled';
  const displayPlan=carePlanDisplay(r.requested_plan,status);

  await sb(
    `customer_care_plan_requests?id=eq.${encodeURIComponent(r.id)}`,
    'PATCH',
    {status,updated_at:now}
  );

  await sb(
    `customer_portal_access?owner_user_id=eq.${encodeURIComponent(r.owner_user_id)}&customer_id=eq.${encodeURIComponent(r.customer_id)}`,
    'PATCH',
    {plan:r.requested_plan,plan_status:planStatus,updated_at:now}
  );

  const stateRows=await sb(
    `cs_energy_app_state?user_id=eq.${encodeURIComponent(r.owner_user_id)}&select=user_id,data`
  );
  const stateRow=stateRows?.[0];
  if(stateRow?.data){
    const state=stateRow.data;
    const customers=Array.isArray(state.customers)?state.customers:[];
    const idx=customers.findIndex(c=>String(c?.id)===String(r.customer_id));
    if(idx>=0){
      customers[idx]={...customers[idx],plan:displayPlan,carePlanStatus:status};
      state.customers=customers;
      await sb(
        `cs_energy_app_state?user_id=eq.${encodeURIComponent(r.owner_user_id)}`,
        'PATCH',
        {data:state,updated_at:now}
      );
    }
  }

  const snapshotRows=await sb(
    `customer_portal_snapshots?owner_user_id=eq.${encodeURIComponent(r.owner_user_id)}&customer_id=eq.${encodeURIComponent(r.customer_id)}&select=payload`
  );
  const snapshotRow=snapshotRows?.[0];
  if(snapshotRow?.payload){
    const payload=snapshotRow.payload;
    payload.customer={...(payload.customer||{}),plan:displayPlan,carePlanStatus:status};
    await sb(
      `customer_portal_snapshots?owner_user_id=eq.${encodeURIComponent(r.owner_user_id)}&customer_id=eq.${encodeURIComponent(r.customer_id)}`,
      'PATCH',
      {payload,updated_at:now}
    );
  }
}

async function carePlanBySubscription(subscriptionId){
  if(!subscriptionId)return null;
  const rows=await sb(
    `customer_care_plan_requests?stripe_subscription_id=eq.${encodeURIComponent(subscriptionId)}&select=id,owner_user_id,customer_id,customer_email,requested_plan,status,stripe_subscription_id,stripe_customer_id&order=created_at.desc&limit=1`
  );
  return rows?.[0]||null;
}


async function logCarePlanHistory(r,{eventType,eventStatus,amount=null,currency=null,invoiceId=null,eventId=null,eventAt=null,details={}}={}){
  if(!r)return;
  const row={
    customer_id:r.customer_id,
    care_plan_request_id:r.id,
    customer_email:r.customer_email||null,
    requested_plan:r.requested_plan||null,
    event_type:eventType||'subscription_event',
    event_status:eventStatus||null,
    amount:amount==null?null:Number(amount),
    currency:currency?String(currency).toUpperCase():null,
    stripe_subscription_id:r.stripe_subscription_id||null,
    stripe_customer_id:r.stripe_customer_id||null,
    stripe_invoice_id:invoiceId||null,
    stripe_event_id:eventId||null,
    event_at:eventAt||new Date().toISOString(),
    details:details||{}
  };
  try{
    await sb('customer_care_plan_payment_history','POST',row);
  }catch(e){
    // A unique Stripe event ID may already exist if Stripe retries a webhook.
    if(!String(e?.message||'').includes('23505'))console.error('care-plan history:',e);
  }
}

async function handleInvoicePaid(invoice,event){
  const subscriptionId=typeof invoice.subscription==='string'?invoice.subscription:invoice.subscription?.id;
  const r=await carePlanBySubscription(subscriptionId);
  if(!r)return;
  if(r.status==='Cancelled')return;
  const wasFailed=r.status==='Payment Failed';
  await updateCarePlanState(r,'Active');
  await logCarePlanHistory(r,{eventType:wasFailed?'payment_recovered':'payment_succeeded',eventStatus:'Active',amount:invoice.amount_paid==null?null:Number(invoice.amount_paid)/100,currency:invoice.currency,invoiceId:invoice.id,eventId:event?.id,eventAt:event?.created?new Date(event.created*1000).toISOString():null,details:{billing_reason:invoice.billing_reason||null}});
  if(wasFailed){
    await sendEmail(
      r.customer_email,
      'Your CS Energy Care Plan payment has been received',
      `<p>Hello,</p><p>We've now received your care-plan payment and your <strong>${r.requested_plan} Care</strong> plan is active again.</p><p>Thank you,<br>CS Energy</p>`,
      `We've now received your care-plan payment and your ${r.requested_plan} Care plan is active again. Thank you, CS Energy.`
    );
  }
}

async function handleInvoiceFailed(invoice,event){
  const subscriptionId=typeof invoice.subscription==='string'?invoice.subscription:invoice.subscription?.id;
  const r=await carePlanBySubscription(subscriptionId);
  if(!r)return;
  if(r.status==='Cancelled')return;
  const alreadyFailed=r.status==='Payment Failed';
  await updateCarePlanState(r,'Payment Failed');
  await logCarePlanHistory(r,{eventType:'payment_failed',eventStatus:'Payment Failed',amount:invoice.amount_due==null?null:Number(invoice.amount_due)/100,currency:invoice.currency,invoiceId:invoice.id,eventId:event?.id,eventAt:event?.created?new Date(event.created*1000).toISOString():null,details:{attempt_count:invoice.attempt_count||null}});
  if(!alreadyFailed){
    await sendEmail(
      r.customer_email,
      'Action needed: CS Energy Care Plan payment failed',
      `<p>Hello,</p><p>Stripe was unable to collect your monthly <strong>${r.requested_plan} Care</strong> payment.</p><p>Your care-plan benefits are temporarily suspended while the payment is outstanding. Stripe may retry the payment automatically. If your card details have changed, please contact us at <a href="mailto:info@competasolar.es">info@competasolar.es</a>.</p><p>Thank you,<br>CS Energy</p>`,
      `Stripe was unable to collect your monthly ${r.requested_plan} Care payment. Your care-plan benefits are temporarily suspended while the payment is outstanding. Stripe may retry automatically. If your card details have changed, contact info@competasolar.es.`
    );
    await sendEmail(
      CARE_PLAN_ALERT_EMAIL,
      `Care Plan payment failed - ${r.customer_email||r.customer_id}`,
      `<p>A monthly <strong>${r.requested_plan} Care</strong> payment failed.</p><p>Customer: ${r.customer_email||r.customer_id}</p><p>The customer record has been marked Payment Failed.</p>`,
      `A monthly ${r.requested_plan} Care payment failed for ${r.customer_email||r.customer_id}. The customer record has been marked Payment Failed.`
    );
  }
}

async function handleSubscription(subscription,event){
  const r=await carePlanBySubscription(subscription?.id);
  if(!r)return;
  if(subscription.status==='active' || subscription.status==='trialing'){
    if(r.status!=='Active')await updateCarePlanState(r,'Active');
    return;
  }
  if(['past_due','unpaid','incomplete_expired'].includes(subscription.status)){
    await handleInvoiceFailed({subscription:subscription.id},event);
    return;
  }
  if(subscription.status==='canceled'){
    await handleSubscriptionDeleted(subscription,event);
  }
}

async function handleSubscriptionDeleted(subscription,event){
  const r=await carePlanBySubscription(subscription?.id);
  if(!r)return;
  const alreadyCancelled=r.status==='Cancelled';
  await updateCarePlanState(r,'Cancelled');
  await logCarePlanHistory(r,{eventType:'subscription_cancelled',eventStatus:'Cancelled',eventId:event?.id,eventAt:event?.created?new Date(event.created*1000).toISOString():null,details:{stripe_status:subscription.status||'canceled'}});
  if(!alreadyCancelled){
    await sendEmail(
      r.customer_email,
      'Your CS Energy Care Plan has been cancelled',
      `<p>Hello,</p><p>Your <strong>${r.requested_plan} Care</strong> subscription has been cancelled and the care-plan benefits are no longer active.</p><p>If you believe this is a mistake, please contact us at <a href="mailto:info@competasolar.es">info@competasolar.es</a>.</p><p>Thank you,<br>CS Energy</p>`,
      `Your ${r.requested_plan} Care subscription has been cancelled and the care-plan benefits are no longer active. If this is a mistake, contact info@competasolar.es.`
    );
    await sendEmail(
      CARE_PLAN_ALERT_EMAIL,
      `Care Plan cancelled - ${r.customer_email||r.customer_id}`,
      `<p>A <strong>${r.requested_plan} Care</strong> subscription was cancelled.</p><p>Customer: ${r.customer_email||r.customer_id}</p><p>The customer record has been marked Cancelled.</p>`,
      `A ${r.requested_plan} Care subscription was cancelled for ${r.customer_email||r.customer_id}. The customer record has been marked Cancelled.`
    );
  }
}

async function fulfil(session,event){
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
      `customer_care_plan_requests?id=eq.${encodeURIComponent(id)}&select=id,owner_user_id,customer_id,customer_email,requested_plan,status,stripe_subscription_id,stripe_customer_id`
    );
    const r=rows?.[0];
    if(!r)return;

    const subscriptionId=typeof session.subscription==='string'?session.subscription:session.subscription?.id;
    const stripeCustomerId=typeof session.customer==='string'?session.customer:session.customer?.id;

    await sb(
      `customer_care_plan_requests?id=eq.${encodeURIComponent(id)}`,
      'PATCH',
      {
        stripe_subscription_id:subscriptionId||r.stripe_subscription_id||null,
        stripe_customer_id:stripeCustomerId||r.stripe_customer_id||null,
        updated_at:new Date().toISOString()
      }
    );

    const linked={...r,stripe_subscription_id:subscriptionId||r.stripe_subscription_id,stripe_customer_id:stripeCustomerId||r.stripe_customer_id};
    await updateCarePlanState(linked,'Active');
    await logCarePlanHistory(linked,{eventType:'subscription_activated',eventStatus:'Active',amount:session.amount_total==null?null:Number(session.amount_total)/100,currency:session.currency,eventId:event?.id,eventAt:event?.created?new Date(event.created*1000).toISOString():null,details:{checkout_session_id:session.id||null}});
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
    if(event.type==='checkout.session.completed')await fulfil(event.data.object,event);
    else if(event.type==='invoice.paid')await handleInvoicePaid(event.data.object,event);
    else if(event.type==='invoice.payment_failed')await handleInvoiceFailed(event.data.object,event);
    else if(event.type==='customer.subscription.updated')await handleSubscription(event.data.object,event);
    else if(event.type==='customer.subscription.deleted')await handleSubscriptionDeleted(event.data.object,event);

    return res.status(200).json({received:true});
  }catch(e){
    console.error('stripe-webhook:',e);
    return res.status(500).json({error:'Webhook processing failed'});
  }
}
