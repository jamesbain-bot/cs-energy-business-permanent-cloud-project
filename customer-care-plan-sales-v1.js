// CS Energy Customer Care Plans - richer sales section v1
(function(){
  const oldRender=window.renderCustomerPortalHome;

  const benefits={
    Basic:[
      'Automated daily system health checks',
      'Instant fault alerts for production drops, inverter issues or system errors',
      'Monthly performance summary',
      'Annual performance report with estimated savings'
    ],
    Standard:[
      'Everything in Basic',
      'Annual on-site inspection',
      'Electrical safety checks',
      'Inverter diagnostics and firmware updates',
      'Mounting system and cabling inspection',
      'Performance vs expected yield analysis',
      'Cleaning condition assessment',
      'Priority support with target 48-hour response'
    ],
    Premium:[
      'Everything in Standard',
      'Priority response with target 24-hour turnaround',
      'Labour included for minor repairs',
      'Battery diagnostics and optimisation',
      'Full warranty handling with manufacturers',
      'System optimisation including tariff, export and performance settings'
    ]
  };

  function monthsSince(s){
    if(!s)return null;
    const d=new Date(s+'T12:00:00'),n=new Date();
    return Math.max(0,(n.getFullYear()-d.getFullYear())*12+n.getMonth()-d.getMonth());
  }
  function ageText(s){
    const m=monthsSince(s);if(m==null)return '';
    if(m<12)return `${m} month${m===1?'':'s'} old`;
    const y=Math.floor(m/12),r=m%12;
    return `${y} year${y===1?'':'s'}${r?` ${r} month${r===1?'':'s'}`:''} old`;
  }
  function priceFor(name,pricing){
    const x=(pricing.plans||[]).find(p=>p.name===name);
    return Number(x?.price||({Basic:15,Standard:25,Premium:45}[name]));
  }

  async function choosePlan(name,price){
    if(typeof window.requestCarePlan==='function')return window.requestCarePlan(name,price);
    const rec=window.customerPortalRecord;
    if(!rec||!cloudSession?.user?.id)return alert('Please sign in again.');
    const row={
      owner_user_id:rec.access.owner_user_id,
      customer_id:rec.access.customer_id,
      customer_email:rec.access.customer_email,
      customer_user_id:cloudSession.user.id,
      requested_plan:name,
      monthly_price:Number(price||0),
      status:'Requested'
    };
    const {error}=await sb.from('customer_care_plan_requests').insert(row);
    if(error)return alert(error.message);
    alert(`${name} Care request sent to CS Energy.`);
    if(typeof loadCustomerOwnRequests==='function')loadCustomerOwnRequests();
  }
  window.csChooseCarePlan=choosePlan;

  function bookAnnual(){
    const type=document.getElementById('customerServiceType');
    if(type){type.value='Annual service';type.dispatchEvent(new Event('change'));type.scrollIntoView({behavior:'smooth',block:'center'});}
    else alert('Open the Service section to book an annual system service.');
  }
  window.csBookAnnualService=bookAnnual;

  function card(name,pricing,current){
    const price=priceFor(name,pricing),isCurrent=current===name;
    const strap=name==='Basic'?'REMOTE MONITORING & ALERTS':name==='Standard'?'ANNUAL MAINTENANCE & PRIORITY SUPPORT':'FULL PROTECTION & MANAGED SYSTEM';
    const intro=name==='Basic'?'Simple peace of mind with proactive monitoring.':name==='Standard'?'Proper yearly servicing, expert checks and faster support.':'Complete hands-off ownership and maximum peace of mind.';
    const quote=name==='Basic'?'“We’ll tell you when something is wrong before you notice it.”':name==='Standard'?'“A full yearly health check, done properly, with priority support when you need it.”':'“We act as your system manager, not just your installer.”';
    return `<div class="cs-care-card ${name==='Standard'?'featured':''}">
      ${name==='Standard'?'<div class="cs-care-popular">MOST POPULAR</div>':''}
      <div class="cs-care-icon">${name==='Basic'?'⌁':name==='Standard'?'🛡':'⚙'}</div>
      <h3>${name.toUpperCase()} CARE PLAN</h3>
      <div class="cs-care-price">€${price}<span>/month</span></div>
      <div class="cs-care-strap">${strap}</div>
      <p class="cs-care-intro">${intro}</p>
      <ul>${benefits[name].map(x=>`<li>✓ ${esc(x)}</li>`).join('')}</ul>
      <p class="cs-care-quote">${quote}</p>
      <button class="${name==='Standard'?'primary':'ghost'}" ${isCurrent?'disabled':''} onclick="csChooseCarePlan('${name}',${price})">${isCurrent?'CURRENT PLAN':name==='Basic'?'GET STARTED':name==='Standard'?'CHOOSE STANDARD':'GO PREMIUM'}</button>
    </div>`;
  }

  function inject(rec){
    const home=document.getElementById('customerAppHome');
    if(!home||home.querySelector('#csCareSales'))return;
    const p=rec.payload||{},c=p.customer||{},systems=p.systems||[],s=systems[0],pricing=p.pricing||{};
    if((p.portalStage||'full')!=='full')return;

    const current=['Basic','Standard','Premium'].includes(c.plan)?c.plan:'';
    const age=s?.installed?ageText(s.installed):'';
    const servicePrice=Number(pricing.annualServicePrice||249);

    const wrap=document.createElement('div');
    wrap.id='csCareSales';
    wrap.className='customer-app-card';
    wrap.innerHTML=`
      <style>
      #csCareSales{margin-top:18px}
      .cs-care-hero{display:grid;grid-template-columns:1.4fr .6fr;gap:16px;align-items:center;background:linear-gradient(135deg,rgba(244,122,32,.12),rgba(86,168,255,.08));border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:18px;margin-bottom:18px}
      .cs-care-hero h2{font-size:24px;margin:0 0 8px}.cs-care-hero p{color:var(--muted);line-height:1.5;margin:6px 0}
      .cs-care-age{font-size:28px;font-weight:950;text-align:center}.cs-care-age small{display:block;font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:7px}
      .cs-care-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
      .cs-care-card{position:relative;background:#09131d;border:1px solid var(--line);border-radius:18px;padding:18px;display:flex;flex-direction:column;min-height:560px}
      .cs-care-card.featured{border-color:#4d8fff;box-shadow:0 0 0 1px #4d8fff}
      .cs-care-popular{position:absolute;top:-11px;left:50%;transform:translateX(-50%);background:#2468ff;border-radius:999px;padding:5px 10px;font-size:10px;font-weight:900;letter-spacing:.08em}
      .cs-care-icon{font-size:24px;margin:8px 0 12px}.cs-care-card h3{font-size:15px;margin:0}.cs-care-price{font-size:32px;font-weight:950;margin:10px 0}.cs-care-price span{font-size:13px;font-weight:600;color:var(--muted)}
      .cs-care-strap{font-size:12px;font-weight:900;color:var(--orange);min-height:34px}.cs-care-intro{color:var(--muted);font-size:13px;line-height:1.45}
      .cs-care-card ul{list-style:none;padding:0;margin:10px 0 16px}.cs-care-card li{font-size:12px;line-height:1.45;padding:7px 0;border-bottom:1px solid rgba(255,255,255,.05)}
      .cs-care-quote{margin-top:auto;color:var(--muted);font-style:italic;font-size:12px}.cs-care-card button{width:100%;margin-top:12px}
      @media(max-width:900px){.cs-care-grid{grid-template-columns:1fr}.cs-care-card{min-height:0}.cs-care-hero{grid-template-columns:1fr}.cs-care-age{text-align:left}}
      </style>
      ${current?`<div class="cs-care-hero"><div><h2>🛡 Your ${esc(current)} Care plan</h2><p>Your system is covered by CS Energy ${esc(current)} Care. Keep your system monitored, maintained and supported.</p></div><div class="cs-care-age"><small>Plan status</small>ACTIVE</div></div>`:
      `<div class="cs-care-hero"><div><h2>🛡 Protect your solar investment</h2><p>Your solar system is designed to work for many years, but regular monitoring and preventative maintenance help identify faults, reduced production, electrical issues and component problems before they become expensive.</p><p><strong>Plans start from €15/month.</strong> Or book a one-off annual service for ${eur(servicePrice)} + IVA.</p><div class="btnrow"><button class="primary" onclick="document.getElementById('csCarePlans').scrollIntoView({behavior:'smooth'})">Compare Care Plans</button><button class="ghost" onclick="csBookAnnualService()">Book one-off service</button></div></div><div class="cs-care-age"><small>${s?.installed?'Your system is':'System care'}</small>${age||'Protect it'}</div></div>`}
      <div id="csCarePlans" class="cs-care-grid">
        ${card('Basic',pricing,current)}
        ${card('Standard',pricing,current)}
        ${card('Premium',pricing,current)}
      </div>`;

    // Put the sales section near the top, after KPI cards/welcome.
    const target=home.querySelector('.customer-app-grid')||home.children[home.children.length-1];
    if(target)target.insertAdjacentElement('beforebegin',wrap); else home.appendChild(wrap);
  }

  if(typeof oldRender==='function'){
    window.renderCustomerPortalHome=function(rec){
      const r=oldRender.apply(this,arguments);
      setTimeout(()=>inject(rec),30);
      return r;
    };
  }
})();