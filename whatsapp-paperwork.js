
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
    const label=LABELS[type]?.[0]||'Document';
    const filename=safeName(`CS-Energy-${quoteId}-${label}.pdf`);
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
      const {blob,filename}=await buildPdf(quoteId,type);
      const file=new File([blob],filename,{type:'application/pdf'});
      const label=LABELS[type]?.[1]||'document';
      const message=`Please find your CS Energy ${label}. Kind regards, James`;

      if(navigator.canShare && navigator.canShare({files:[file]}) && navigator.share){
        await navigator.share({files:[file],text:message,title:filename});
      } else {
        const a=document.createElement('a');
        const href=URL.createObjectURL(blob);
        a.href=href; a.download=filename;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(()=>URL.revokeObjectURL(href),30000);

        if(typeof whatsappCustomerQuote==='function'){
          whatsappCustomerQuote(quoteId);
        } else {
          alert('PDF downloaded. Open the customer WhatsApp conversation and attach it.');
        }
      }
    }catch(err){
      console.error(err);
      alert('Could not prepare the paperwork for WhatsApp: '+(err?.message||err));
    }
  }

  window.whatsappPaperwork=whatsappPaperwork;

  async function emailPaperwork(quoteId,type){
    try{
      const {blob,filename}=await buildPdf(quoteId,type);
      const file=new File([blob],filename,{type:'application/pdf'});
      const label=LABELS[type]?.[1]||'document';
      const message=`Please find your CS Energy ${label}. Kind regards, James`;

      if(navigator.canShare && navigator.canShare({files:[file]}) && navigator.share){
        await navigator.share({files:[file],title:filename,text:message});
      } else {
        const a=document.createElement('a');
        const href=URL.createObjectURL(blob);
        a.href=href; a.download=filename;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(()=>URL.revokeObjectURL(href),30000);

        if(typeof emailCustomerQuote==='function'){
          emailCustomerQuote(quoteId);
        } else {
          alert('PDF downloaded. Open your email app and attach it.');
        }
      }
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
