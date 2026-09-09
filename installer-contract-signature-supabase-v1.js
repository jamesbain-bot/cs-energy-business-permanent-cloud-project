// CS Energy installer contract signature - Supabase v1
(function(){
let installerContractSigCache={};

async function loadInstallerContractSignature(qid){
  if(installerContractSigCache[qid])return installerContractSigCache[qid];
  if(!sb||!cloudSession)return null;
  const {data:r,error}=await sb.from('installer_contract_signatures').select('*').eq('owner_user_id',cloudSession.user.id).eq('quote_id',qid).maybeSingle();
  if(error){console.warn(error);return null}
  if(r)installerContractSigCache[qid]=r;
  return r||null;
}

window.openInstallerContractSignature=async function(qid){
  const q=(data.quotes||[]).find(x=>x.id===qid);if(!q)return;
  let modal=document.getElementById('installerContractSigModal');
  if(!modal){
    modal=document.createElement('div');modal.id='installerContractSigModal';modal.className='modal';
    modal.innerHTML=`<div class="modalbox" style="max-width:720px"><div class="modalhead"><div><strong>Sign contract for CS Energy</strong><div class="muted">Installer signature</div></div><button class="x" onclick="closeModal('installerContractSigModal')">×</button></div><div class="modalbody"><p>This signature will be stored against this quotation in Supabase.</p><div class="field"><label>Signer name</label><input id="installerContractSigner" value="James Bain"></div><div class="signature-light"><canvas id="installerContractCanvas" width="700" height="260" style="width:100%;height:190px;background:white;touch-action:none"></canvas></div><div class="btnrow" style="margin-top:10px"><button class="mini" onclick="clearInstallerContractSignature()">Clear</button><button class="primary" onclick="saveInstallerContractSignature()">Save CS Energy signature</button></div></div></div>`;
    document.body.appendChild(modal);
  }
  modal.dataset.quoteId=qid;
  const existing=await loadInstallerContractSignature(qid);
  document.getElementById('installerContractSigner').value=existing?.signer_name||'James Bain';
  modal.classList.add('open');
  setTimeout(()=>{
    const c=document.getElementById('installerContractCanvas'),ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);
    if(existing?.signature_data){const im=new Image();im.onload=()=>ctx.drawImage(im,0,0,c.width,c.height);im.src=existing.signature_data}
    ctx.lineWidth=2;ctx.lineCap='round';ctx.strokeStyle='#111';let drawing=false;
    const pt=e=>{const r=c.getBoundingClientRect(),t=e.touches?.[0]||e;return{x:(t.clientX-r.left)*(c.width/r.width),y:(t.clientY-r.top)*(c.height/r.height)}};
    const down=e=>{drawing=true;const p=pt(e);ctx.beginPath();ctx.moveTo(p.x,p.y);e.preventDefault()};
    const move=e=>{if(!drawing)return;const p=pt(e);ctx.lineTo(p.x,p.y);ctx.stroke();e.preventDefault()};
    const up=()=>drawing=false;
    c.onpointerdown=down;c.onpointermove=move;c.onpointerup=c.onpointerleave=up;c.ontouchstart=down;c.ontouchmove=move;c.ontouchend=up;
  },0);
};

window.clearInstallerContractSignature=function(){const c=document.getElementById('installerContractCanvas');if(c)c.getContext('2d').clearRect(0,0,c.width,c.height)};

window.saveInstallerContractSignature=async function(){
  const modal=document.getElementById('installerContractSigModal'),qid=modal?.dataset.quoteId;
  const q=(data.quotes||[]).find(x=>x.id===qid),c=q?customer(q.customerId):null;
  const name=document.getElementById('installerContractSigner')?.value.trim(),canvas=document.getElementById('installerContractCanvas');
  if(!q||!c||!name||!canvas)return alert('Enter your name and sign.');
  const row={owner_user_id:cloudSession.user.id,customer_id:c.id,quote_id:q.id,quote_ref:q.ref,signer_name:name,signature_data:canvas.toDataURL('image/png'),signed_at:new Date().toISOString()};
  const {data:r,error}=await sb.from('installer_contract_signatures').upsert(row,{onConflict:'owner_user_id,quote_id'}).select().single();
  if(error)return alert('Could not save signature: '+error.message);
  installerContractSigCache[qid]=r;closeModal('installerContractSigModal');alert('CS Energy signature saved permanently.');
};

function addButton(qid){
  const body=document.getElementById('quoteDetailBody');if(!body||body.querySelector('.cs-installer-contract-btn'))return;
  const b=document.createElement('button');b.className='primary cs-installer-contract-btn';b.style.margin='0 8px 12px 0';b.textContent='✍ Sign contract for CS Energy';b.onclick=()=>openInstallerContractSignature(qid);body.prepend(b);
}
const oldOpen=window.openQuoteDetail;
if(typeof oldOpen==='function')window.openQuoteDetail=function(id){const r=oldOpen.apply(this,arguments);setTimeout(()=>addButton(id),0);return r};

const oldDoc=window.showBusinessDoc;
if(typeof oldDoc==='function')window.showBusinessDoc=async function(id,type){
  const r=oldDoc.apply(this,arguments);
  if(type!=='contract')return r;
  const sig=await loadInstallerContractSignature(id);if(!sig)return r;
  setTimeout(()=>{
    ['businessDocContent','businessDocPrintHost'].forEach(hid=>{
      const h=document.getElementById(hid);if(!h)return;
      const ps=[...h.querySelectorAll('p')],np=ps.find(p=>/^Name:\s*James/i.test((p.textContent||'').trim()));
      if(!np)return;np.innerHTML='Name: '+esc(sig.signer_name);
      const sp=np.nextElementSibling,dp=sp?.nextElementSibling;
      if(sp)sp.innerHTML=`Signature:<br><img src="${sig.signature_data}" style="max-width:280px;height:100px;object-fit:contain">`;
      if(dp)dp.innerHTML='Date: '+new Date(sig.signed_at).toLocaleString('en-GB');
    });
  },30);return r;
};
})();