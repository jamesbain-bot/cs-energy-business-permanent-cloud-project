(function(){
  const STYLE_ID='cs-energy-modal-layer-fix';
  if(!document.getElementById(STYLE_ID)){
    const style=document.createElement('style');
    style.id=STYLE_ID;
    style.textContent=`
      #customerDetailModal.open{z-index:1000}
      #customerModal.open{z-index:1100}
      #customerModal.open .modalbox{position:relative;z-index:1101}
    `;
    document.head.appendChild(style);
  }

  const originalOpen=window.openCustomerModal || (typeof openCustomerModal==='function' ? openCustomerModal : null);
  if(originalOpen){
    window.openCustomerModal=function(id=null){
      const detail=document.getElementById('customerDetailModal');
      const modal=document.getElementById('customerModal');
      const detailWasOpen=!!detail?.classList.contains('open');
      const result=originalOpen(id);
      if(modal){
        modal.dataset.returnToCustomerDetail=detailWasOpen&&id ? id : '';
        modal.style.zIndex='1100';
      }
      return result;
    };
  }

  const originalClose=window.closeModal || (typeof closeModal==='function' ? closeModal : null);
  if(originalClose){
    window.closeModal=function(id){
      const modal=document.getElementById(id);
      const returnId=id==='customerModal' ? modal?.dataset.returnToCustomerDetail : '';
      const result=originalClose(id);
      if(id==='customerModal' && modal){
        modal.style.zIndex='';
        modal.dataset.returnToCustomerDetail='';
      }
      // If the customer detail was left open underneath, it is already visible.
      // If another action closed it, reopen the same customer record.
      if(returnId){
        const detail=document.getElementById('customerDetailModal');
        if(detail && !detail.classList.contains('open') && typeof openCustomerDetail==='function'){
          openCustomerDetail(returnId);
        }
      }
      return result;
    };
  }
})();