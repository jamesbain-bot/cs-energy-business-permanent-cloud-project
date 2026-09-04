const ALLOWED_HOSTS = [
  'krannich-solar.com',
  'distribucionessolares.es'
];

function hostAllowed(hostname) {
  const h = String(hostname || '').toLowerCase();
  return ALLOWED_HOSTS.some(d => h === d || h.endsWith('.' + d));
}

function decodeHtml(s='') {
  return String(s)
    .replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'")
    .replace(/&lt;/g,'<').replace(/&gt;/g,'>')
    .replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n)));
}

function cleanText(s='') {
  return decodeHtml(String(s).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim());
}

function absUrl(u, base) {
  if (!u) return '';
  try { return new URL(decodeHtml(u), base).href; } catch { return ''; }
}

function meta(html, key, attr='property') {
  const re = new RegExp(`<meta[^>]+${attr}=["']${key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}["'][^>]+content=["']([^"']+)["'][^>]*>|<meta[^>]+content=["']([^"']+)["'][^>]+${attr}=["']${key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}["'][^>]*>`, 'i');
  const m = html.match(re); return decodeHtml((m && (m[1] || m[2])) || '');
}

function firstJsonLdProduct(html) {
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const b of blocks) {
    try {
      const parsed = JSON.parse(b[1].trim());
      const walk = x => {
        if (!x) return null;
        if (Array.isArray(x)) { for (const v of x) { const r=walk(v); if(r) return r; } return null; }
        if (typeof x === 'object') {
          const t = x['@type'];
          if (t === 'Product' || (Array.isArray(t) && t.includes('Product'))) return x;
          if (x['@graph']) return walk(x['@graph']);
        }
        return null;
      };
      const p = walk(parsed); if (p) return p;
    } catch {}
  }
  return null;
}

function findPdf(html, base, words) {
  const links = [...html.matchAll(/href=["']([^"']+\.pdf(?:\?[^"']*)?)["'][^>]*>([\s\S]*?)<\/a>/gi)];
  const keys = words.map(x=>x.toLowerCase());
  for (const m of links) {
    const label = cleanText(m[2]).toLowerCase();
    const href = m[1].toLowerCase();
    if (keys.some(k => label.includes(k) || href.includes(k))) return absUrl(m[1], base);
  }
  return '';
}

function supplierFromHost(host) {
  host = String(host||'').toLowerCase();
  if (host.includes('krannich-solar.com')) return 'Krannich Solar';
  if (host.includes('distribucionessolares.es')) return 'Distribuciones Solares';
  return '';
}

function categoryFromText(s='') {
  const t=s.toLowerCase();
  if (/panel|module|modulo|módulo|solar module|solarmodul/.test(t)) return 'Panel';
  if (/inverter|inversor|wechselrichter/.test(t)) return 'Inverter';
  if (/battery|bater[ií]a|speicher/.test(t)) return 'Battery';
  if (/charger|cargador|wallbox|ladestation/.test(t)) return 'EV Charger';
  if (/heat pump|bomba de calor|wärmepumpe/.test(t)) return 'Heat Pump';
  return 'Other';
}

async function fetchHtml(url) {
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(), 12000);
  try {
    const r = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/152 Safari/537.36',
        'accept':'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
        'accept-language':'es-ES,es;q=0.9,en;q=0.8'
      }
    });
    const text = await r.text();
    return {ok:r.ok, status:r.status, url:r.url, text};
  } finally { clearTimeout(timer); }
}

function krannichFallbacks(input) {
  const out=[];
  try {
    const u=new URL(input);
    if (u.hostname.toLowerCase() === 'app.krannich-solar.com') {
      const m=u.pathname.match(/\/shop\/product\/([^/]+)/i);
      const id=m?.[1]||'';
      const name=(u.searchParams.get('name')||'').trim().replace(/^\/+|\/+$/g,'');
      if (name && id) out.push(`https://shop.krannich-solar.com/es-es/${name}/${id}`);
      if (name) out.push(`https://shop.krannich-solar.com/es-es/${name}`);
    }
  } catch {}
  return out;
}

function parseProduct(html, pageUrl, originalUrl) {
  const p=firstJsonLdProduct(html)||{};
  const brand = typeof p.brand === 'string' ? p.brand : (p.brand?.name || '');
  const offers = Array.isArray(p.offers) ? p.offers[0] : (p.offers || {});
  const title = p.name || meta(html,'og:title') || (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'');
  let manufacturer = brand;
  if (!manufacturer) {
    manufacturer = cleanText(html.match(/(?:Hersteller|Manufacturer|Fabricante)[\s\S]{0,180}?(?:<[^>]+>)*\s*([^<\n]{2,80})/i)?.[1]||'');
  }
  let sku = p.sku || p.mpn || p.productID || '';
  if (!sku) sku = cleanText(html.match(/(?:Art\.?-?Nr\.?|Artikelnummer|Article\s*(?:no\.?|number)|SKU|Referencia)[^A-Za-z0-9]{0,20}([A-Za-z0-9._\/-]{4,30})/i)?.[1]||'');
  let model = cleanText(title).replace(/\s*[|–—-]\s*Krannich.*$/i,'').trim();
  if (manufacturer && model.toLowerCase().startsWith(manufacturer.toLowerCase())) model=model.slice(manufacturer.length).trim();
  let photo='';
  if (p.image) photo = Array.isArray(p.image) ? (typeof p.image[0]==='string'?p.image[0]:p.image[0]?.url) : (typeof p.image==='string'?p.image:p.image?.url);
  photo = absUrl(photo || meta(html,'og:image'), pageUrl);
  let price = offers.price ?? offers.lowPrice ?? '';
  if (price === '') {
    const pm = html.match(/(?:price|precio|preis)[^\d]{0,50}(\d{1,6}(?:[.,]\d{2,4})?)/i);
    if (pm) price = pm[1].replace('.','').replace(',','.');
  }
  const description = cleanText(p.description || meta(html,'og:description') || meta(html,'description','name'));
  const datasheet=findPdf(html,pageUrl,['datasheet','data sheet','ficha','datenblatt','technical']);
  const manual=findPdf(html,pageUrl,['manual','installation','instalación','montage','anleitung']);
  return {
    ok:true,
    supplier:supplierFromHost(new URL(originalUrl).hostname),
    manufacturer:cleanText(manufacturer),
    model:cleanText(model),
    sku:cleanText(sku),
    category:categoryFromText(`${title} ${description}`),
    photo,
    datasheet,
    manual,
    cost: price === '' || price == null || Number.isNaN(Number(price)) ? null : Number(price),
    description,
    source_url:pageUrl
  };
}

module.exports = async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  if (req.method !== 'GET') return res.status(405).json({ok:false,error:'GET only'});
  const raw=String(req.query?.url||'').trim();
  if (!raw) return res.status(400).json({ok:false,error:'Missing product URL'});
  let u;
  try { u=new URL(raw); } catch { return res.status(400).json({ok:false,error:'Invalid product URL'}); }
  if (!['http:','https:'].includes(u.protocol) || !hostAllowed(u.hostname)) return res.status(400).json({ok:false,error:'Supplier URL not supported'});

  const candidates=[raw, ...krannichFallbacks(raw)];
  let lastError='Could not read product page';
  for (const candidate of candidates) {
    try {
      const r=await fetchHtml(candidate);
      if (!r.ok) { lastError=`Supplier page returned ${r.status}`; continue; }
      if (!r.text || r.text.length < 500) { lastError='Supplier page returned no product details'; continue; }
      const item=parseProduct(r.text,r.url,raw);
      if (item.model || item.manufacturer || item.sku) return res.status(200).json(item);
      lastError='No product details found on that page';
    } catch(e) {
      lastError = e?.name==='AbortError' ? 'Supplier page timed out' : (e?.message || lastError);
    }
  }
  return res.status(502).json({ok:false,error:lastError, hint:'If this is a logged-in supplier page, use its public product page when available. Private account prices cannot be read without supplier API/login access.'});
};
