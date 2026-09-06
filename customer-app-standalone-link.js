// CS Energy Customer App standalone link v1
(function(){
  window.copyCustomerAppLink=function(){
    const link=location.origin+'/customer.html';
    navigator.clipboard?.writeText(link);
    alert('Customer app link copied.');
  };
  window.copyPortalLink=window.copyCustomerAppLink;
})();