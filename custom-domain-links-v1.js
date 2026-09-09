(function(){
if(location.hostname==='my.csenergy.solar'&&new URLSearchParams(location.search).get('customerapp')==='1'){
  try{history.replaceState({},document.title,'/')}catch(e){}
}
window.copyCustomerAppLink=function(){
  const link='https://my.csenergy.solar/';
  navigator.clipboard?.writeText(link);
  alert('Customer app link copied: '+link);
};
window.copyPortalLink=window.copyCustomerAppLink;
})();