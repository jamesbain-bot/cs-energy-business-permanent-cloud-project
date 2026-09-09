// CS Energy installer contract signature - Supabase v2
(function(){
const TABLE='installer_contract_signatures',cache={};

async function getSig(qid){
  if(cache[qid])return cache[qid];
  if(!window.sb||!window.cloudSession?.user?.id)return null;
  const {data,error}=await sb.from(TABLE).select('*')
    .eq('owner_user_id',cloudSession.user.id).eq('quote_id',qid).maybeSingle();
  if(error){console.warn(error);return null}
  if(data)cache[qid]=data;
  return data||null;
}

function workflowHost(){
  const root=document.getElementById('quoteDetailContent');
  if(!root)return null;
  const h=[...root.querySelectorAll('h2,h3,strong')].find(x=>(x.textContent||'').trim()==='Workflow');
  const box=h?.closest('.detail-section,.card')||h?.parentElement;
  return box?.querySelector('.card-actions,.btnrow')||box||root;
}

async function addButton(qid){
  const root=document.getElementById('quoteDetailContent');
  if(!root||root.querySelector('.cs-installer-sign-contract'))return;
  const sig=await getSig(qid);
  const b=document.createElement('button');
  b.className='mini cs-installer-sign-contract';
  b.textContent=sig?'✅ Signed by CS Energy':'✍ Sign contract for CS Energy';
  b.onclick=()=>openInstallerContractSignature(qid);
  workflowHost()?.appendChild(b);
}

const oldOpen=window.openQuoteDetail;
if(typeof oldOpen==='function')window.openQuoteDetail=function(id){
  const r=oldOpen.apply(this,arguments);setTimeout(()=>addButton(id),50);return r;
};

function ensureModal(){
  let m=document.getElementById('installerContractSigModal');
  if(m)return m;
  m=document.createElement('div');m.id='installerContractSigModal';m.className='modal';
  m.innerHTML=`<div class="modalbox"><div class="modaltop"><h2>Sign contract for CS Energy</h2><button class="close" onclick="closeModal('installerContractSigModal')">×</button></div>
  <p class="muted">This signature is stored permanently against this quotation.</p>
  <div class="field"><label>Signer name</label><input id="installerContractSigner" value="James Bain"></div>
  <div class="signature-light" style="margin-top:12px"><canvas id="installerContractCanvas" width="700" height="260"></canvas></div>
  <div class="signature-tools"><span>Sign above</span><button class="mini" onclick="clearInstallerContractSignature()">Clear</button></div>
  <div class="formactions"><button class="primary" onclick="saveInstallerContractSignature()">Save CS Energy signature</button></div></div>`;
  document.body.appendChild(m);return m;
}

function setupCanvas(existing){
  const c=document.getElementById('installerContractCanvas'),ctx=c.getContext('2d');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.lineWidth=3;ctx.lineCap='round';ctx.strokeStyle='#111';
  if(existing?.signature_data){const im=new Image();im.onload=()=>ctx.drawImage(im,0,0,c.width,c.height);im.src=existing.signature_data}
  let d=false;
  const p=e=>{const r=c.getBoundingClientRect(),t=e.touches?.[0]||e;return{x:(t.clientX-r.left)*c.width/r.width,y:(t.clientY-r.top)*c.height/r.height}};
  const dn=e=>{d=true;const q=p(e);ctx.beginPath();ctx.moveTo(q.x,q.y);e.preventDefault()};
  const mv=e=>{if(!d)return;const q=p(e);ctx.lineTo(q.x,q.y);ctx.stroke();e.preventDefault()};
  const up=()=>d=false;
  c.onpointerdown=dn;c.onpointermove=mv;c.onpointerup=c.onpointerleave=up;c.ontouchstart=dn;c.ontouchmove=mv;c.ontouchend=up;
}

window.openInstallerContractSignature=async function(qid){
  const q=(data.quotes||[]).find(x=>x.id===qid);if(!q)return alert('Quote not found.');
  const m=ensureModal();m.dataset.quoteId=qid;
  const s=await getSig(qid);document.getElementById('installerContractSigner').value=s?.signer_name||'James Bain';
  m.classList.add('open');setTimeout(()=>setupCanvas(s),20);
};
window.clearInstallerContractSignature=function(){const c=document.getElementById('installerContractCanvas');if(c){const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height)}};

window.saveInstallerContractSignature=async function(){
  const m=document.getElementById('installerContractSigModal'),qid=m?.dataset.quoteId;
  const q=(data.quotes||[]).find(x=>x.id===qid);if(!q)return alert('Quote not found.');
  const c=customer(q.customerId),name=document.getElementById('installerContractSigner')?.value.trim(),cv=document.getElementById('installerContractCanvas');
  if(!name||!cv)return alert('Enter your name and sign.');
  const row={owner_user_id:cloudSession.user.id,customer_id:c.id,quote_id:q.id,quote_ref:q.ref,signer_name:name,signature_data:cv.toDataURL('image/png'),signed_at:new Date().toISOString()};
  const {data:stored,error}=await sb.from(TABLE).upsert(row,{onConflict:'owner_user_id,quote_id'}).select().single();
  if(error)return alert('Could not save signature: '+error.message);
  cache[qid]=stored;closeModal('installerContractSigModal');
  const b=document.querySelector('.cs-installer-sign-contract');if(b)b.textContent='✅ Signed by CS Energy';
  alert('CS Energy signature saved. Open Contract to view both signatures.');
};

function applySig(sig){
  if(!sig)return;
  ['businessDocContent','reportPrintHost'].forEach(id=>{
    const root=document.getElementById(id);if(!root)return;
    const ps=[...root.querySelectorAll('p')],np=ps.find(p=>/^Name:\s*James/i.test((p.textContent||'').trim()));
    if(!np)return;
    np.innerHTML='Name: '+esc(sig.signer_name);
    const sp=np.nextElementSibling,dp=sp?.nextElementSibling;
    if(sp)sp.innerHTML=`Signature:<br><img src="${sig.signature_data}" style="max-width:280px;height:100px;object-fit:contain">`;
    if(dp)dp.innerHTML='Date: '+new Date(sig.signed_at).toLocaleString('en-GB');
  });
}
const oldDoc=window.showBusinessDoc;
if(typeof oldDoc==='function')window.showBusinessDoc=async function(id,type){
  const r=oldDoc.apply(this,arguments);
  if(type==='contract'){const s=await getSig(id);setTimeout(()=>applySig(s),60)}
  return r;
};
})();