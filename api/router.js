const DSP = 'https://tienda.distribucionessolares.es';
const KR = 'https://shop.krannich-solar.com';

function clean(s = '') {
  return String(s)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function abs(base, href = '') {
  try {
    return new URL(href, base).href;
  } catch {
    return href;
  }
}

function uniq(a) {
  return [...new Set(a.filter(Boolean))];
}

async function get(url) {
  const r = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0',
      'accept-language': 'es-ES,es;q=0.9,en;q=0.7'
    }
  });

  const text = await r.text();

  if (!r.ok) {
    throw new Error(`HTTP ${r.status} for ${url}`);
  }

  return text;
}

function stripOldPrices(html) {
  return String(html || '')
    .replace(/<del\b[^>]*>[\s\S]*?<\/del>/gi, ' ')
    .replace(/<s\b[^>]*>[\s\S]*?<\/s>/gi, ' ')
    .replace(/<strike\b[^>]*>[\s\S]*?<\/strike>/gi, ' ')
    .replace(
      /<[^>]*class=["'][^"']*(?:old[-_ ]?price|original[-_ ]?price|list[-_ ]?price|price[-_ ]?old|line-through)[^"']*["'][^>]*>[\s\S]*?<\/[^>]+>/gi,
      ' '
    );
}

function euroNumber(v) {
  if (!v) return 0;

  const n = Number(
    String(v)
      .replace(/\s/g, '')
      .replace(/\./g, '')
      .replace(',', '.')
      .replace(/[^\d.-]/g, '')
  );

  return Number.isFinite(n) ? n : 0;
}

function activeExVatPrice(html) {
  const safe = stripOldPrices(html);
  const text = clean(safe);

  const patterns = [
    /([0-9][0-9.,]*)\s*€\s*\((?:Excluding VAT|Sin IVA|IVA no incluido)\)/i,

    /([0-9][0-9.,]*)\s*€\s*(?:Excluding VAT|Sin IVA|IVA no incluido)/i,

    /(?:Excluding VAT|Sin IVA|IVA no incluido|Precio neto|Net price)\s*[:\-]?\s*([0-9][0-9.,]*)\s*€/i
  ];

  for (const rx of patterns) {
    const m = text.match(rx);

    if (m) {
      const n = euroNumber(m[1]);

      if (n > 0) return n;
    }
  }

  return 0;
}

function titleFrom(html, url) {
  return clean(
    (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] ||
    (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] ||
    url
  );
}

function dspSku(html, url) {
  const text = clean(html);

  return (
    (text.match(/Ref\.\s*([A-Za-z0-9._/-]+)/i) || [])[1] ||
    (text.match(/(?:Referencia|SKU|Código)\s*:?\s*([A-Za-z0-9._/-]+)/i) || [])[1] ||
    (url.match(/\/shop\/([^/?#]+?)-\d+(?:\?|$)/) || [])[1] ||
    ''
  );
}

function detectBrand(title, html) {
  const known = [
    'Victron Energy',
    'Victron',
    'Fronius',
    'Pylontech',
    'BYD',
    'SMA',
    'Huawei',
    'SolarEdge',
    'GoodWe',
    'SolaX',
    'Kostal',
    'Deye',
    'Eleksol',
    'JA Solar',
    'AIKO',
    'Trina Solar',
    'JinkoSolar'
  ];

  const text = `${title} ${clean(html).slice(0, 6000)}`;

  return known.find(
    b => new RegExp(b.replace(/\s+/g, '\\s+'), 'i').test(text)
  ) || '';
}

function availabilityFrom(html) {
  const text = clean(html);

  const patterns = [
    /(Available upon request[^.]{0,180})/i,
    /(please allow\s*\d+\s*-\s*\d+\s*business days[^.]{0,140})/i,
    /(En stock[^.]{0,140})/i,
    /(Disponible[^.]{0,140})/i,
    /(Agotado[^.]{0,140})/i,
    /(Disponible a partir[^.]{0,160})/i
  ];

  for (const rx of patterns) {
    const m = text.match(rx);

    if (m) return clean(m[1]);
  }

  return '';
}

function dspProductLinks(html) {
  const out = [];

  for (const m of html.matchAll(
    /<a[^>]+href=["']([^"']*\/shop\/[^"'#]+)["'][^>]*>/gi
  )) {
    const u = abs(DSP, m[1]).split('#')[0];

    if (!u.startsWith(DSP + '/shop/')) continue;
    if (/\/shop\/category\//i.test(u)) continue;
    if (/\/shop\/page\/\d+/i.test(u)) continue;
    if (u === DSP + '/shop') continue;

    out.push(u);
  }

  return uniq(out);
}

async function dspDetail(url) {
  const html = await get(url);
  const title = titleFrom(html, url);

  return {
    supplier: 'DSP Solar',
    manufacturer: detectBrand(title, html),
    model: title,
    name: title,
    sku: dspSku(html, url),

    // IMPORTANT:
    // crossed-out prices are removed before this is calculated
    cost: activeExVatPrice(html),

    availability: availabilityFrom(html),
    sourceUrl: url
  };
}

async function dspSync() {
  const products = [];
  const seen = new Set();

  for (let page = 1; page <= 12; page++) {
    const url =
      page === 1
        ? `${DSP}/shop`
        : `${DSP}/shop/page/${page}`;

    let html;

    try {
      html = await get(url);
    } catch {
      break;
    }

    const links = dspProductLinks(html);

    if (!links.length && page > 1) break;

    for (let i = 0; i < links.length; i += 5) {
      const rows = await Promise.all(
        links
          .slice(i, i + 5)
          .map(u => dspDetail(u).catch(() => null))
      );

      for (const row of rows) {
        if (!row) continue;

        const key = row.sku || row.sourceUrl;

        if (seen.has(key)) continue;

        seen.add(key);
        products.push(row);
      }
    }
  }

  return products;
}

function krannichLinks(html) {
  const out = [];

  for (const m of html.matchAll(
    /<a[^>]+href=["']([^"']+)["'][^>]*>/gi
  )) {
    const u = abs(KR, m[1]).split('#')[0];

    if (!u.startsWith(KR + '/es-es/')) continue;

    if (/\/\d{6,8}\/?(?:\?|$)/.test(u)) {
      out.push(u);
    }
  }

  return uniq(out);
}

function krannichSku(html, url) {
  const text = clean(html);

  return (
    (text.match(
      /(?:Referencia|N[uú]mero de art[ií]culo|Art\.?\s*(?:no\.?|nº))[^A-Za-z0-9]{0,30}([A-Za-z0-9._/-]+)/i
    ) || [])[1] ||
    (url.match(/\/(\d{6,8})\/?(?:\?|$)/) || [])[1] ||
    ''
  );
}

async function krannichDetail(url) {
  const html = await get(url);
  const title = titleFrom(html, url);

  return {
    supplier: 'Krannich Solar',
    manufacturer: detectBrand(title, html),
    model: title,
    name: title,
    sku: krannichSku(html, url),

    // Public catalogue usually doesn't expose your account price.
    cost: 0,

    availability: availabilityFrom(html),
    sourceUrl: url
  };
}

async function krannichSync() {
  const products = [];
  const seen = new Set();

  const startPages = [
    `${KR}/es-es/`,
    `${KR}/es-es/inversores`,
    `${KR}/es-es/modulos`,
    `${KR}/es-es/almacenamiento`
  ];

  const discovered = new Set();

  for (const page of startPages) {
    try {
      const html = await get(page);

      for (const u of krannichLinks(html)) {
        discovered.add(u);
      }
    } catch {}
  }

  const urls = [...discovered];

  for (let i = 0; i < urls.length; i += 6) {
    const rows = await Promise.all(
      urls
        .slice(i, i + 6)
        .map(u => krannichDetail(u).catch(() => null))
    );

    for (const row of rows) {
      if (!row) continue;

      const key = row.sku || row.sourceUrl;

      if (seen.has(key)) continue;

      seen.add(key);
      products.push(row);
    }
  }

  return products;
}

async function handler(req, res) {
  const op = String(req.query?.op || '');

  try {
    if (op === 'sync-dsp') {
      const products = await dspSync();

      return res.status(200).json({
        ok: true,
        products,
        count: products.length
      });
    }

    if (op === 'sync-krannich') {
      const products = await krannichSync();

      return res.status(200).json({
        ok: true,
        products,
        count: products.length
      });
    }

    if (op === 'k-test') {
      return res.status(400).json({
        ok: false,
        error:
          'Direct Krannich account login is disabled. Browser-assisted pricing import will be used instead.'
      });
    }

    if (op === 'k-prices') {
      return res.status(400).json({
        ok: false,
        error:
          'Krannich authenticated pricing requires the browser-assisted importer.'
      });
    }

    if (op === 'cloud-status') {
      return res.status(200).json({
        ok: true,
        configured: false,
        error: 'Cloud database connection is not active yet.'
      });
    }

    if (op === 'cloud-save' || op === 'cloud-load') {
      return res.status(503).json({
        ok: false,
        error: 'Cloud database connection is not active yet.'
      });
    }

    return res.status(400).json({
      ok: false,
      error: `Unknown operation: ${op}`
    });
  } catch (e) {
    console.error(e);

    return res.status(500).json({
      ok: false,
      error: e.message || String(e)
    });
  }
}

module.exports = handler;
