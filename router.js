
const DSP='https://tienda.distribucionessolares.es';
const KR='https://shop.krannich-solar.com';

function clean(s=''){return String(s).replace(/<[^>]*>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim()}
async function get(url,opts={}){const r=await fetch(url,{headers:{'user-agent':'Mozilla/5.0','accept-language':'es-ES,es;q=0.9,en;q=0.7',...(opts.headers||{})},redirect:'follow',...opts});const text=await r.text();if(!r.ok)throw new Error(`HTTP ${r.status} for ${url}`);return{text,headers:r.headers,status:r.status,url:r.url}}
function abs(base,href=''){try{return new URL(href,base).href}catch{return href}}
function uniq(a){return [...new Set(a.filter(Boolean))]}

function stripOldPriceNodes(html){
  // Remove crossed-out / old-price markup before price extraction.
  return String(html)
    .replace(/<del\b[^>]*>[\s\S]*?<\/del>/gi,' ')
    .replace(/<s\b[^>]*>[\s\S]*?<\/s>/gi,' ')
    .replace(/<strike\b[^>]*>[\s\S]*?<\/strike>/gi,' ')
    .replace(/<[^>]*class=["'][^"']*(?:old[-_ ]?price|original[-_ ]?price|list[-_ ]?price|price[-_ ]?old|text-decoration-line-through)[^"']*["'][^>]*>[\s\S]*?<\/[^>]+>/gi,' ');
}
function parseEuro(v){if(!v)return null;const n=Number(String(v).replace(/\s/g,'').replace(/\./g,'').replace(',','.').replace(/[^\d.-]/g,''));return Number.isFinite(n)?n:null}
function activeExVatPrice(html){
  const safe=stripOldPriceNodes(html);
  const t=clean(safe);

  // Highest priority: value immediately associated with Excluding VAT / Sin IVA labels.
  const patterns=[
    /([0-9][0-9.,]*)\s*€\s*\((?:Excluding VAT|Sin IVA|IVA no incluido|Net(?:to)?(?: price)?)\)/i,
    /([0-9][0-9.,]*)\s*€\s*(?:Excluding VAT|Sin IVA|IVA no incluido)/i,
    /(?:Excluding VAT|Sin IVA|IVA no incluido|Precio neto|Net price)\s*[:\-]?\s*([0-9][0-9.,]*)\s*€/i,
    /(?:price_without_tax|price-no-vat|price_excl_tax)[^0-9]{0,80}([0-9][0-9.,]*)\s*€/i
  ];
  for(const rx of patterns){const m=t.match(rx);if(m){const n=parseEuro(m[1]);if(n!=null&&n>0)return n}}

  // DOM-ish fallback: look for a non-struck-through currency span near "Excluding VAT".
  const chunks=safe.split(/<[^>]+>/).map(clean).filter(Boolean);
  for(let i=0;i<chunks.length;i++){
    if(/Excluding VAT|Sin IVA|IVA no incluido/i.test(chunks[i])){
      for(let j=Math.max(0,i-3);j<=Math.min(chunks.length-1,i+3);j++){
        const m=chunks[j].match(/([0-9][0-9.,]*)\s*€/);
        if(m){const n=parseEuro(m[1]);if(n!=null&&n>0)return n}
      }
    }
  }
  return null;
}
function dspProductLinks(html){
  const out=[];
  for(const m of html.matchAll(/<a[^>]+href=["']([^"']*\/shop\/[^"'#]+)["'][^>]*>/gi)){
    const u=abs(DSP,m[1]).split('#')[0];
    if(!u.startsWith(DSP+'/shop/'))continue;
    if(/\/shop\/category\//i.test(u)||/\/shop\/page\/\d+/i.test(u))continue;
    out.push(u);
  }
  return uniq(out);
}
function brandFrom(title,html){
  const known=['Victron Energy','Victron','Eleksol','Pylontech','Deye','Fronius','GoodWe','Huawei','SMA','SolaX','JA Solar','AIKO','Trina Solar','JinkoSolar','Kostal','SolarEdge'];
  const txt=title+' '+clean(stripOldPriceNodes(html)).slice(0,5000);
  return known.find(b=>new RegExp(b.replace(/\s+/g,'\\s+'),'i').test(txt))||'';
}
function titleFrom(html,url){return clean((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)||[])[1]||(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||url)}
function skuFrom(html,url){
  const t=clean(html);
  return (t.match(/Ref\.\s*([A-Za-z0-9._/-]+)/i)||[])[1] ||
         (t.match(/(?:Referencia|SKU|Código)\s*:?\s*([A-Za-z0-9._/-]+)/i)||[])[1] ||
         (url.match(/\/shop\/([^/?#]+?)-\d+(?:\?|$)/)||[])[1] || '';
}
function availabilityFrom(html){
  const t=clean(html);
  for(const rx of [/(Available upon request[^.]{0,140})/i,/(please allow\s*\d+\s*-\s*\d+\s*business days[^.]{0,120})/i,/(En stock[^.]{0,140})/i,/(Disponible[^.]{0,140})/i,/(Agotado[^.]{0,140})/i]){const m=t.match(rx);if(m)return clean(m[1])}
  return '';
}
async function dspDetail(url){
  const {text:html}=await get(url);
  const title=titleFrom(html,url);
  return {
    supplier:'DSP Solar',
    manufacturer:brandFrom(title,html),
    model:title,
    name:title,
    sku:skuFrom(html,url),
    cost:activeExVatPrice(html),
    availability:availabilityFrom(html),
    sourceUrl:url
  };
}
async function dspSync(){
  let products=[], seen=new Set();
  for(let page=1;page<=7;page++){
    const {text}=await get(page===1?DSP+'/shop':`${DSP}/shop/page/${page}`);
    const links=dspProductLinks(text);
    for(let i=0;i<links.length;i+=5){
      const rows=await Promise.all(links.slice(i,i+5).map(u=>dspDetail(u).catch(()=>null)));
      for(const r of rows){if(!r)continue;const k=r.sourceUrl||r.sku;if(k&&!seen.has(k)){seen.add(k);products.push(r)}}
    }
  }
  return products;
}

// Lightweight placeholders for other ops so current UI remains functional if this router is used.
async function krSync(){return[]}
async function handler(req,res){
  const op=String(req.query?.op||'');
  try{
    if(op==='sync-dsp') return res.status(200).json({ok:true,products:await dspSync()});
    if(op==='sync-krannich') return res.status(200).json({ok:true,products:await krSync()});
    if(op==='cloud-status') return res.status(200).json({ok:true,configured:false,error:'DATABASE_URL not configured'});
    return res.status(400).json({ok:false,error:'Unknown op'});
  }catch(e){return res.status(500).json({ok:false,error:e.message})}
}
module.exports=handler;
