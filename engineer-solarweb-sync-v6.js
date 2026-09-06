// CS Energy Engineer sync v6 - aggressively preserve Solar.web Public Display URL
(function(){
  const previous=window.csSyncEngineerSystems;
  if(typeof previous!=='function') return;

  function findUrl(s){
    const known=[
      s.solarWebUrl,s.publicDisplayUrl,s.solarWebPublicUrl,s.monitorUrl,
      s.monitoringUrl,s.publicUrl,s.solarwebUrl,s.solarWebLink
    ];
    const direct=known.find(v=>typeof v==='string' && /solarweb\.com/i.test(v));
    if(direct)return direct;
    for(const v of Object.values(s||{})){
      if(typeof v==='string' && /https?:\/\/[^\s]*solarweb\.com/i.test(v))return v;
    }
    return '';
  }

  window.csSyncEngineerSystems=async function(){
    // Temporarily normalise the URL field before the existing safe sync runs.
    (data.systems||[]).forEach(s=>{
      const u=findUrl(s);
      if(u && !s.solarWebUrl) s.solarWebUrl=u;
    });
    return previous.apply(this,arguments);
  };
})();