(function(){
 const form=document.getElementById('supplierInvoiceForm');
 if(!form)return;
 const file=form.elements.file;
 let extracted=null;

 function b64(f){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]||'');r.onerror=reject;r.readAsDataURL(f)})}
 function summarize(lines){return (lines||[]).map(l=>`${l.quantity??1} × ${l.description||''}${l.sku?' ['+l.sku+']':''} — €${Number(l.line_total_net??((l.unit_price_net||0)*(l.quantity||1))||0).toFixed(2)} ex IVA`).join('\n')}
 async function readPdf(f){
   if(!f||(!f.name.toLowerCase().endsWith('.pdf')&&f.type!=='application/pdf'))return;
   if(!cloudSession?.access_token)return alert('Please sign in before importing a supplier invoice.');
   if(f.size>2500000)return alert('Please use a PDF under 2.5 MB.');
   const old=form.querySelector('#supplierAiStatus');if(old)old.remove();
   const status=document.createElement('div');status.id='supplierAiStatus';status.className='banner';status.style.marginBottom='12px';status.textContent='AI is reading '+f.name+'…';form.prepend(status);
   try{
     const base64=await b64(f);
     const response=await fetch('/api/import-supplier-invoice',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+cloudSession.access_token},body:JSON.stringify({filename:f.name,mimeType:f.type||'application/pdf',base64})});
     const result=await response.json().catch(()=>({}));
     if(!response.ok)throw new Error(result.error||'Supplier invoice extraction failed.');
     extracted={...result.invoice,sourceFilename:f.name,sourceBase64:base64};
     form.elements.supplier.value=extracted.supplier_name||'';
     form.elements.invoiceNo.value=extracted.invoice_number||'';
     form.elements.date.value=extracted.invoice_date||form.elements.date.value;
     form.elements.due.value=extracted.due_date||'';
     form.elements.total.value=extracted.total_gross??'';
     form.elements.items.value=summarize(extracted.line_items);
     form.elements.notes.value=[form.elements.notes.value,extracted.notes||''].filter(Boolean).join('\n');
     status.textContent=`Invoice read${extracted.supplier_name?' from '+extracted.supplier_name:''}. Confidence ${Math.round(Number(extracted.confidence||0)*100)}%. Check details, then Save invoice.`;
   }catch(e){console.error(e);status.textContent='Could not import supplier invoice: '+(e.message||'Unknown error');extracted=null}
 }
 file.addEventListener('change',()=>readPdf(file.files?.[0]));

 form.addEventListener('submit',function(e){
   if(!extracted)return; // manual entry uses original app handler
   e.preventDefault();e.stopImmediatePropagation();
   const vals=Object.fromEntries(new FormData(form)),f=file.files?.[0];
   const finish=(stored='')=>{
     const inv={id:uid('inv_'),supplier:vals.supplier,invoiceNo:vals.invoiceNo,date:vals.date,due:vals.due,total:Number(vals.total||0),status:vals.status,items:vals.items,notes:vals.notes,fileName:f?.name||'',fileData:stored,paidAt:vals.status==='Paid'?iso(new Date()):'',lines:(extracted.line_items||[]).map(l=>({description:l.description,quantity:l.quantity??1,unit_price_net:l.unit_price_net,line_total_net:l.line_total_net,tax_rate:l.tax_rate,sku:l.sku||'',manufacturer:l.manufacturer||'',model:l.model||''})),subtotalNet:extracted.subtotal_net,ivaRate:extracted.iva_rate,ivaAmount:extracted.iva_amount,currency:extracted.currency||'EUR',importedAt:new Date().toISOString()};
     data.supplierInvoices.push(inv);save();form.reset();extracted=null;closeModal('supplierInvoiceModal');renderPurchasing();
     if(typeof csShowSupplierProductReview==='function')csShowSupplierProductReview(inv);
   };
   if(f){const r=new FileReader();r.onload=()=>finish(r.result);r.readAsDataURL(f)}else finish();
 },true);

 const originalOpen=window.openSupplierInvoiceModal;
 if(typeof originalOpen==='function')window.openSupplierInvoiceModal=function(){extracted=null;const r=originalOpen.apply(this,arguments);const s=form.querySelector('#supplierAiStatus');if(s)s.remove();return r};
})();