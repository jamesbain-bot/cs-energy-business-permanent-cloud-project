// CS Energy maintenance filter: only customers with recorded systems
(function(){
  const originalRenderMaintenance = window.renderMaintenance || (typeof renderMaintenance==='function' ? renderMaintenance : null);
  if(!originalRenderMaintenance) return;

  window.renderMaintenance=function(){
    const systemCustomerIds=new Set((data.systems||[]).map(s=>s.customerId));
    const list=[...(data.customers||[])]
      .filter(c=>systemCustomerIds.has(c.id))
      .sort((a,b)=>(a.nextService||'9999').localeCompare(b.nextService||'9999'));

    const table=document.getElementById('maintenanceTable');
    if(!table) return;

    table.innerHTML=list.length
      ? list.map(c=>{
          const s=systemFor(c.id), d=daysUntil(c.nextService);
          return `<tr>
            <td><span class="pill ${d<0?'red':d<=14?'orange':'green'}">${prettyDate(c.nextService)}</span></td>
            <td class="name">${esc(c.name)}</td>
            <td>${esc(c.location)}</td>
            <td>${s?prettyDate(s.installed):'—'}</td>
            <td>${esc(c.plan||'Standard')}</td>
            <td class="actions"><button class="iconbtn" onclick="bookMaintenance('${c.id}')">Book</button></td>
          </tr>`;
        }).join('')
      : '<tr><td colspan="6" class="empty">No customers with installed systems yet.</td></tr>';
  };

  // Also correct the dashboard "Services due" count so it only counts customers with systems.
  const originalRenderStats = window.renderStats || (typeof renderStats==='function' ? renderStats : null);
  if(originalRenderStats){
    window.renderStats=function(){
      const open=data.jobs.filter(j=>j.status!=='Complete').length;
      const urgent=data.jobs.filter(j=>j.priority==='Urgent'&&j.status!=='Complete').length;
      const systemCustomerIds=new Set((data.systems||[]).map(s=>s.customerId));
      const due=data.customers.filter(c=>systemCustomerIds.has(c.id)&&daysUntil(c.nextService)<=14).length;
      const done=data.jobs.filter(j=>j.status==='Complete').length;
      const el=document.getElementById('stats');
      if(el)el.innerHTML=`<div class="card stat"><div class="label">Open jobs</div><div class="num">${open}</div><div class="sub ${urgent?'bad':'good'}">${urgent} urgent</div></div><div class="card stat"><div class="label">Services due</div><div class="num">${due}</div><div class="sub warn">Next 14 days / overdue</div></div><div class="card stat"><div class="label">Installed systems</div><div class="num">${data.systems.length}</div><div class="sub good">Asset records</div></div><div class="card stat"><div class="label">Completed jobs</div><div class="num">${done}</div><div class="sub good">Full history</div></div>`;
    };
  }

  renderMaintenance();
  if(originalRenderStats) renderStats();
})();
