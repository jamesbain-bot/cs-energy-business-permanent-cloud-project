// CS Energy supplier invoice importer - delegated event version
(function(){
  let extracted = null;

  function getForm(){
    return document.getElementById('supplierInvoiceForm');
  }

  function pdfToBase64(file){
    return new Promise((resolve,reject)=>{
      const r=new FileReader();
      r.onload=()=>resolve(String(r.result).split(',')[1]||'');
      r.onerror=reject;
      r.readAsDataURL(file);
    });
  }

  function summarize(lines){
    return (lines||[]).map(l=>{
      const qty = l.quantity ?? 1;
      const total = Number(
        l.line_total_net ??
        ((l.unit_price_net||0)*(l.quantity||1)) ??
        0
      );
      return `${qty} × ${l.description||''}${l.sku?' ['+l.sku+']':''} — €${total.toFixed(2)} ex IVA`;
    }).join('\n');
  }

  function showStatus(form,text,isError=false){
    let el=form.querySelector('#supplierAiStatus');
    if(!el){
      el=document.createElement('div');
      el.id='supplierAiStatus';
      el.className='banner';
      el.style.marginBottom='12px';
      form.prepend(el);
    }
    el.textContent=text;
    if(isError) el.style.borderColor='#b94a48';
    else el.style.borderColor='';
  }

  async function readPdf(file,form){
    if(!file) return;
    const isPdf = file.type==='application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if(!isPdf){
      extracted=null;
      return;
    }

    if(!cloudSession?.access_token){
      extracted=null;
      alert('Please sign in before importing a supplier invoice.');
      return;
    }

    if(file.size>2500000){
      extracted=null;
      alert('Please use a PDF under 2.5 MB.');
      return;
    }

    showStatus(form,'AI is reading '+file.name+'…');

    try{
      const base64=await pdfToBase64(file);
      const response=await fetch('/api/import-supplier-invoice',{
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          'Authorization':'Bearer '+cloudSession.access_token
        },
        body:JSON.stringify({
          filename:file.name,
          mimeType:file.type||'application/pdf',
          base64
        })
      });

      const result=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(result.error||'Supplier invoice extraction failed.');

      extracted={
        ...result.invoice,
        sourceFilename:file.name,
        sourceBase64:base64
      };

      form.elements.supplier.value=extracted.supplier_name||'';
      form.elements.invoiceNo.value=extracted.invoice_number||'';
      if(extracted.invoice_date) form.elements.date.value=extracted.invoice_date;
      form.elements.due.value=extracted.due_date||'';
      form.elements.total.value=extracted.total_gross ?? '';
      form.elements.items.value=summarize(extracted.line_items);
      form.elements.notes.value=[
        form.elements.notes.value,
        extracted.notes||''
      ].filter(Boolean).join('\n');

      showStatus(
        form,
        `Invoice read${extracted.supplier_name?' from '+extracted.supplier_name:''}. `+
        `Confidence ${Math.round(Number(extracted.confidence||0)*100)}%. `+
        `Check the details, then click Save invoice.`
      );
    }catch(err){
      console.error('Supplier invoice import failed',err);
      extracted=null;
      showStatus(form,'Could not import supplier invoice: '+(err?.message||'Unknown error'),true);
    }
  }

  // Delegated listener: works even if the form/modal is opened or rebuilt later.
  document.addEventListener('change',function(e){
    const input=e.target;
    if(!(input instanceof HTMLInputElement)) return;
    if(input.name!=='file') return;

    const form=input.closest('#supplierInvoiceForm');
    if(!form) return;

    extracted=null;
    readPdf(input.files?.[0],form);
  },true);

  // Capture submit before the original handler when AI data exists.
  document.addEventListener('submit',function(e){
    const form=e.target;
    if(!(form instanceof HTMLFormElement) || form.id!=='supplierInvoiceForm') return;
    if(!extracted) return; // manual entry continues to use original app code

    e.preventDefault();
    e.stopImmediatePropagation();

    const vals=Object.fromEntries(new FormData(form));
    const file=form.elements.file.files?.[0];

    const finish=(storedFile='')=>{
      const inv={
        id:uid('inv_'),
        supplier:vals.supplier,
        invoiceNo:vals.invoiceNo,
        date:vals.date,
        due:vals.due,
        total:Number(vals.total||0),
        status:vals.status,
        items:vals.items,
        notes:vals.notes,
        fileName:file?.name||'',
        fileData:storedFile,
        paidAt:vals.status==='Paid'?iso(new Date()):'',
        lines:(extracted.line_items||[]).map(l=>({
          description:l.description,
          quantity:l.quantity??1,
          unit_price_net:l.unit_price_net,
          line_total_net:l.line_total_net,
          tax_rate:l.tax_rate,
          sku:l.sku||'',
          manufacturer:l.manufacturer||'',
          model:l.model||''
        })),
        subtotalNet:extracted.subtotal_net,
        ivaRate:extracted.iva_rate,
        ivaAmount:extracted.iva_amount,
        currency:extracted.currency||'EUR',
        importedAt:new Date().toISOString()
      };

      data.supplierInvoices.push(inv);
      save();

      form.reset();
      const status=form.querySelector('#supplierAiStatus');
      if(status) status.remove();
      extracted=null;

      closeModal('supplierInvoiceModal');
      renderPurchasing();

      if(typeof csShowSupplierProductReview==='function'){
        csShowSupplierProductReview(inv);
      }
    };

    if(file){
      const r=new FileReader();
      r.onload=()=>finish(r.result);
      r.readAsDataURL(file);
    }else{
      finish();
    }
  },true);

  // Reset extraction state whenever Add supplier invoice is opened.
  const originalOpen = typeof openSupplierInvoiceModal==='function' ? openSupplierInvoiceModal : null;
  if(originalOpen){
    window.openSupplierInvoiceModal=function(){
      extracted=null;
      const result=originalOpen.apply(this,arguments);
      const form=getForm();
      const status=form?.querySelector('#supplierAiStatus');
      if(status) status.remove();
      return result;
    };
  }

  window.csSupplierInvoiceImporterReady=true;
})();
