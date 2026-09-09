// CS Energy Service & Care campaign dashboard v1
(function(){
  function yearsOld(installed){
    if(!installed)return 0;
    return (Date.now()-new Date(installed+'T12:00:00').getTime())/(365.25*86400000);
  }
  function lastService(customerId){
    return [...(data.jobs||[])].filter(j=>j.customerId===customerId&&j.status==='Complete'&&/annual service|service|maintenance/i.test(j.type||''))
      .sort((a,b)=>(b.date||'').localeCompare(a.date||''))[0]||null;
  }
  function monthsAgo(date){
    if(!date)return 999;
    return (Date.now()-new Date(date+'T12:00:00').getTime())/(30.44*86400000);
  }
  function rows(){
    return (data.systems||[]).map(s=>{
      const c=customer(s.customerId),ls=lastService(c.id),age=yearsOld(s.installed);
      const due=!ls?age>=1:monthsAgo(ls.date)>=11;
      return {s,c,ls,age,due,noPlan:!['Basic','Standard','Premium'].includes(c.plan)};
    }).filter(x=>x.c?.id);
  }
  function escAttr(s=''){return String(s).replace(/"/g,'&quot;')}

  function message(x){
    const years=Math.max(1,Math.floor(x.age));
    const ageText=x.s.installed?`Your CS Energy solar system is now ${years} year${years===1?'':'s'} old`:'Your CS Energy solar system';
    return `Hi ${x.c.name.split(' ')[0]}, ${ageText} and ${x.ls?`it has been around ${Math.max(1,Math.round(monthsAgo(x.ls.date)/12))} year(s) since its last recorded service`:'we do not have a recent system service recorded'}. We recommend a routine solar system service to check electrical safety, inverter performance, cabling, mounting, battery condition where fitted, and overall system performance. You can book a one-off service or choose a CS Energy Care Plan for ongoing monitoring and support. Customer portal: ${location.origin}/?customerapp=1 Kind regards, James — CS Energy`;
  }

  window.csServiceWhatsApp=function(id){
    const x=rows().find(r=>r.c.id===id);if(!x)return;
    const n=(x.c.phone||'').replace(/\D/g,'');if(!n)return alert('No WhatsApp number for this customer.');
    data.communications=data.communications||[];
    data.communications.push({id:uid('com_'),customerId:id,type:'WhatsApp',date:new Date().toISOString(),note:'System service / Care Plan reminder opened'});
    save();
    window.open(`https://wa.me/${n}?text=${encodeURIComponent(message(x))}`,'_blank');
  };
  window.csServiceEmail=function(id){
    const x=rows().find(r=>r.c.id===id);if(!x)return;
    if(!x.c.email)return alert('No email address for this customer.');
    data.communications=data.communications||[];
    data.communications.push({id:uid('com_'),customerId:id,type:'Email',date:new Date().toISOString(),note:'System service / Care Plan reminder opened'});
    save();
    location.href=`mailto:${encodeURIComponent(x.c.email)}?subject=${encodeURIComponent('Your CS Energy system service')}&body=${encodeURIComponent(message(x))}`;
  };

  function render(){
    const host=document.getElementById('csServiceCareHost');if(!host)return;
    const filter=document.getElementById('csServiceCareFilter')?.value||'due';
    let list=rows();
    if(filter==='due')list=list.filter(x=>x.due);
    if(filter==='never')list=list.filter(x=>!x.ls&&x.age>=1);
    if(filter==='noplans')list=list.filter(x=>x.noPlan);
    if(filter==='over2')list=list.filter(x=>x.age>=2);
    list.sort((a,b)=>b.age-a.age);
    host.innerHTML=list.length?`<div class="table-wrap"><table class="table"><thead><tr><th>Customer</th><th>System age</th><th>Last service</th><th>Care plan</th><th>Next service</th><th></th></tr></thead><tbody>${list.map(x=>`<tr><td><strong>${esc(x.c.name)}</strong><br><span class="muted">${esc(x.c.location||'')}</span></td><td>${x.s.installed?x.age.toFixed(1)+' yrs':'—'}</td><td>${x.ls?prettyDate(x.ls.date):'<span class="pill red">Never recorded</span>'}</td><td>${esc(x.c.plan||'No plan')}</td><td>${prettyDate(x.c.nextService)}</td><td><div class="btnrow"><button class="mini whatsapp" onclick="csServiceWhatsApp('${x.c.id}')">WhatsApp</button><button class="mini" onclick="csServiceEmail('${x.c.id}')">Email</button><button class="mini" onclick="newJobFor('${x.c.id}')">Book service</button></div></td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">No customers match this filter.</div>';
    const count=document.getElementById('csServiceCareCount');if(count)count.textContent=`${list.length} customers`;
  }
  window.renderServiceCareCampaign=render;

  function install(){
    const section=document.getElementById('maintenance');if(!section||document.getElementById('csServiceCareCampaign'))return;
    const card=document.createElement('div');card.id='csServiceCareCampaign';card.className='section card';
    card.innerHTML=`<div class="section-head"><div><h2>Service & Care campaigns</h2><p class="muted" style="margin:5px 0 0">Contact installed-system customers for routine servicing and Care Plans.</p></div><span id="csServiceCareCount" class="meta"></span></div>
    <div class="toolbar"><select id="csServiceCareFilter" class="filter" onchange="renderServiceCareCampaign()"><option value="due">Due / overdue service</option><option value="never">1+ year old & never serviced</option><option value="noplans">No Care Plan</option><option value="over2">System 2+ years old</option><option value="all">All installed systems</option></select></div><div id="csServiceCareHost"></div>`;
    const table=section.querySelector('.card.table-wrap');
    if(table)table.insertAdjacentElement('beforebegin',card);else section.appendChild(card);
    render();
  }

  const oldMaintenance=window.renderMaintenance;
  if(typeof oldMaintenance==='function')window.renderMaintenance=function(){const r=oldMaintenance.apply(this,arguments);setTimeout(()=>{install();render()},20);return r};
  setTimeout(install,800);
})();