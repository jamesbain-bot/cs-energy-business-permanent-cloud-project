
(function(){
  const LABELS = {
    quote: ['Quote', 'quotation'],
    deposit: ['Deposit request', 'deposit request'],
    balance: ['Final balance', 'final balance request'],
    invoice: ['Official factura', 'invoice'],
    contract: ['Contract', 'contract']
  };

  function loadHtml2Pdf(){
    return new Promise((resolve,reject)=>{
      if(window.html2pdf) return resolve();
      const s=document.createElement('script');
      s.src='https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
      s.onload=resolve; s.onerror=()=>reject(new Error('Could not load PDF generator'));
      document.head.appendChild(s);
    });
  }

  function normaliseWhatsAppNumber(raw){
    let n=String(raw||'').replace(/\D/g,'');
    if(!n) return '';
    // CS Energy customers are mainly Spain; convert a normal Spanish 9-digit mobile/landline to +34.
    if(n.length===9 && /^[6789]/.test(n)) n='34'+n;
    return n;
  }

  function safeName(v){return String(v||'document').replace(/[^\w.-]+/g,'-').replace(/-+/g,'-');}

  async function buildPdf(quoteId,type){
    if(typeof showBusinessDoc!=='function') throw new Error('Paperwork generator not found');
    showBusinessDoc(quoteId,type);
    await new Promise(r=>setTimeout(r,120));
    const host=document.querySelector('#businessDocContent .doc-report');
    if(!host) throw new Error('Could not build document');
    await loadHtml2Pdf();
    const q=(window.data?.quotes||[]).find(x=>x.id===quoteId);
    const label=LABELS[type]?.[0]||'Document';
    const filename=safeName(`CS-Energy-${q?.ref||''}-${label}.pdf`);
    const worker=html2pdf().set({
      margin:[8,8,8,8],
      filename,
      image:{type:'jpeg',quality:0.98},
      html2canvas:{scale:2,useCORS:true,backgroundColor:'#ffffff'},
      jsPDF:{unit:'mm',format:'a4',orientation:'portrait'},
      pagebreak:{mode:['css','legacy']}
    }).from(host).toPdf();
    const pdf=await worker.get('pdf');
    const blob=pdf.output('blob');
    return {blob,filename,q};
  }

  async function whatsappPaperwork(quoteId,type){
    try{
      const q=(window.data?.quotes||[]).find(x=>x.id===quoteId);
      if(!q) return alert('Quote not found.');
      const c=typeof customer==='function'?customer(q.customerId):(window.data?.customers||[]).find(x=>x.id===q.customerId);
      const number=normaliseWhatsAppNumber(c?.phone);
      if(!number) return alert('Add a WhatsApp number to this customer first.');

      const {blob,filename}=await buildPdf(quoteId,type);
      const file=new File([blob],filename,{type:'application/pdf'});
      const label=LABELS[type]?.[1]||'document';
      const message=`Hi ${c.name}, please find your CS Energy ${label} ${q.ref||''}. Kind regards, James`;

      // On phones/tablets and supported desktop browsers this opens the native share sheet
      // with the actual PDF attached; WhatsApp can then be selected.
      if(navigator.canShare && navigator.canShare({files:[file]}) && navigator.share){
        await navigator.share({files:[file],text:message,title:filename});
      } else {
        // Desktop fallback: download the PDF, then open the correct WhatsApp chat with the message ready.
        const a=document.createElement('a');
        a.href=URL.createObjectURL(blob); a.download=filename;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(()=>URL.revokeObjectURL(a.href),30000);
        window.open(`https://wa.me/${number}?text=${encodeURIComponent(message+'\n\nThe PDF has been downloaded ready to attach.')}`,'_blank');
      }

      try{
        if(window.data?.communications){
          window.data.communications.push({id:typeof uid==='function'?uid('com_'):'com_'+Date.now(),customerId:c.id,quoteId:q.id,type:'WhatsApp',date:new Date().toISOString(),note:`${LABELS[type]?.[0]||'Document'} prepared for WhatsApp`});
          if(typeof save==='function') save();
        }
      }catch(e){}
    }catch(err){
      console.error(err);
      alert('Could not prepare the paperwork for WhatsApp: '+(err?.message||err));
    }
  }

  window.whatsappPaperwork=whatsappPaperwork;

  async function emailPaperwork(quoteId,type){
    try{
      const q=(window.data?.quotes||[]).find(x=>x.id===quoteId);
      if(!q) return alert('Quote not found.');
      const c=typeof customer==='function'?customer(q.customerId):(window.data?.customers||[]).find(x=>x.id===q.customerId);
      if(!c?.email) return alert('Add an email address to this customer first.');

      const {blob,filename}=await buildPdf(quoteId,type);
      const file=new File([blob],filename,{type:'application/pdf'});
      const label=LABELS[type]?.[1]||'document';
      const subject=`CS Energy ${label} ${q.ref||''}`.trim();
      const message=`Hi ${c.name},\n\nPlease find your CS Energy ${label} ${q.ref||''}.\n\nKind regards,\nJames`;

      // Where the device/browser supports sharing a file, use the native share sheet
      // so the PDF can be passed to Mail/Outlook/Gmail as an attachment.
      if(navigator.canShare && navigator.canShare({files:[file]}) && navigator.share){
        await navigator.share({files:[file],title:subject,text:message});
      } else {
        // Desktop fallback: download PDF and open the default mail client addressed to customer.
        const a=document.createElement('a');
        a.href=URL.createObjectURL(blob); a.download=filename;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(()=>URL.revokeObjectURL(a.href),30000);
        location.href=`mailto:${encodeURIComponent(c.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message+'\n\nThe PDF has been downloaded ready to attach.')}`;
      }

      try{
        if(window.data?.communications){
          window.data.communications.push({id:typeof uid==='function'?uid('com_'):'com_'+Date.now(),customerId:c.id,quoteId:q.id,type:'Email',date:new Date().toISOString(),note:`${LABELS[type]?.[0]||'Document'} prepared for email`});
          if(typeof save==='function') save();
        }
      }catch(e){}
    }catch(err){
      console.error(err);
      alert('Could not prepare the paperwork for email: '+(err?.message||err));
    }
  }

  window.emailPaperwork=emailPaperwork;

  function addButtons(){
    const grid=document.querySelector('#quoteDetailContent .paper-grid');
    if(!grid || grid.dataset.whatsappAdded==='1') return;
    grid.dataset.whatsappAdded='1';
    const quoteId=window.currentQuoteId;
    [...grid.querySelectorAll('.paper')].forEach(btn=>{
      const onclick=btn.getAttribute('onclick')||'';
      const m=onclick.match(/showBusinessDoc\('([^']+)','([^']+)'\)/);
      if(!m) return;
      const [_,qid,type]=m;
      const wrap=document.createElement('div');
      wrap.style.display='grid';
      wrap.style.gap='6px';
      btn.parentNode.insertBefore(wrap,btn);
      wrap.appendChild(btn);
      const wa=document.createElement('button');
      wa.type='button';
      wa.className='mini whatsapp';
      wa.textContent='WhatsApp';
      wa.style.width='100%';
      wa.onclick=(e)=>{e.preventDefault();e.stopPropagation();whatsappPaperwork(qid,type)};
      wrap.appendChild(wa);
      const em=document.createElement('button');
      em.type='button';
      em.className='mini';
      em.textContent='Email';
      em.style.width='100%';
      em.onclick=(e)=>{e.preventDefault();e.stopPropagation();emailPaperwork(qid,type)};
      wrap.appendChild(em);
    });
  }

  const originalOpen=window.openQuoteDetail;
  if(typeof originalOpen==='function'){
    window.openQuoteDetail=function(){
      const r=originalOpen.apply(this,arguments);
      setTimeout(addButtons,0);
      return r;
    };
  }
})();
