// CS Energy - Documents modal always above Customer Details
(function(){
  const STYLE_ID='cs-documents-modal-layer-style';
  if(!document.getElementById(STYLE_ID)){
    const s=document.createElement('style');
    s.id=STYLE_ID;
    s.textContent=`
      #customerDetailModal.open{z-index:1000}
      #csDocsModal.open{z-index:1300 !important}
      #csDocsModal.open .modalbox{position:relative;z-index:1301}
    `;
    document.head.appendChild(s);
  }

  const originalShow=window.csShowCustomerDocuments;
  if(typeof originalShow==='function'){
    window.csShowCustomerDocuments=function(customerId){
      const result=originalShow.apply(this,arguments);
      const m=document.getElementById('csDocsModal');
      if(m){
        m.style.zIndex='1300';
        m.dataset.returnCustomerId=customerId||'';
      }
      return result;
    };
  }
})();