// Adds Documents & Legalisation button to each customer record
(function(){
  const originalOpenCustomerDetail =
    window.openCustomerDetail ||
    (typeof openCustomerDetail==='function' ? openCustomerDetail : null);

  if(!originalOpenCustomerDetail) return;

  window.openCustomerDetail=function(id){
    const result=originalOpenCustomerDetail.apply(this,arguments);

    setTimeout(()=>{
      const body=document.getElementById('customerDetailBody');
      if(!body || body.querySelector('.cs-documents-button')) return;

      const customerSection=body.querySelector('.detail-section');
      if(!customerSection) return;

      const actionRow=customerSection.querySelector('.btnrow, .card-actions');
      if(!actionRow) return;

      const btn=document.createElement('button');
      btn.type='button';
      btn.className='mini cs-documents-button';
      btn.textContent='Documents & Legalisation';
      btn.onclick=()=>window.csShowCustomerDocuments(id);

      actionRow.appendChild(btn);
    },0);

    return result;
  };
})();