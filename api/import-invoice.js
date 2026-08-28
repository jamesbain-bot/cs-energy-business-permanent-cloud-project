// CS Energy - AI customer invoice extraction
// Vercel serverless function: /api/import-invoice
// Expects JSON: { filename, mimeType, base64 }
// Requires OPENAI_API_KEY in Vercel Environment Variables.

const SUPABASE_URL = 'https://xhbftdpbowqpfnvsvybt.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_cEsokxhFCIbvq4YUl5SoEQ_KsGSfeXt';

function send(res, status, body) {
  res.status(status).json(body);
}

async function verifySignedInUser(req) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return false;

  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      Authorization: auth,
      apikey: SUPABASE_PUBLISHABLE_KEY
    }
  });

  return response.ok;
}

function cleanBase64(value) {
  if (typeof value !== 'string') return '';
  const comma = value.indexOf(',');
  return value.startsWith('data:') && comma >= 0 ? value.slice(comma + 1) : value;
}

function responseText(apiResponse) {
  if (typeof apiResponse?.output_text === 'string' && apiResponse.output_text.trim()) {
    return apiResponse.output_text.trim();
  }

  const parts = [];
  for (const item of apiResponse?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === 'string') parts.push(content.text);
    }
  }
  return parts.join('\n').trim();
}

const invoiceSchema = {
  type: 'object',
  properties: {
    customer_name: { type: ['string', 'null'] },
    customer_email: { type: ['string', 'null'] },
    customer_phone: { type: ['string', 'null'] },
    customer_tax_id: { type: ['string', 'null'] },
    customer_address: { type: ['string', 'null'] },
    invoice_number: { type: ['string', 'null'] },
    invoice_date: { type: ['string', 'null'], description: 'ISO date YYYY-MM-DD when identifiable' },
    due_date: { type: ['string', 'null'], description: 'ISO date YYYY-MM-DD when identifiable' },
    currency: { type: ['string', 'null'], description: 'Usually EUR' },
    subtotal_net: { type: ['number', 'null'], description: 'PRICE before IVA. On CS Energy / Competa Solar historical invoices, an amount labelled Price is the total excluding IVA.' },
    iva_rate: { type: ['number', 'null'], description: 'Percentage, for example 21' },
    iva_amount: { type: ['number', 'null'] },
    total_gross: { type: ['number', 'null'] },
    line_items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          description: { type: 'string' },
          quantity: { type: ['number', 'null'] },
          unit_price_net: { type: ['number', 'null'] },
          line_total_net: { type: ['number', 'null'] },
          tax_rate: { type: ['number', 'null'] },
          sku_or_model: { type: ['string', 'null'] }
        },
        required: [
          'description',
          'quantity',
          'unit_price_net',
          'line_total_net',
          'tax_rate',
          'sku_or_model'
        ],
        additionalProperties: false
      }
    },
    notes: { type: ['string', 'null'] },
    confidence: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      description: 'Overall confidence in the extraction'
    }
  },
  required: [
    'customer_name',
    'customer_email',
    'customer_phone',
    'customer_tax_id',
    'customer_address',
    'invoice_number',
    'invoice_date',
    'due_date',
    'currency',
    'subtotal_net',
    'iva_rate',
    'iva_amount',
    'total_gross',
    'line_items',
    'notes',
    'confidence'
  ],
  additionalProperties: false
};

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { error: 'POST only' });
  }

  try {
    const signedIn = await verifySignedInUser(req);
    if (!signedIn) {
      return send(res, 401, { error: 'Please sign in to CS Energy before importing an invoice.' });
    }

    if (!process.env.OPENAI_API_KEY) {
      return send(res, 500, { error: 'OPENAI_API_KEY is not configured on Vercel.' });
    }

    const { filename, mimeType, base64 } = req.body || {};
    const safeFilename = String(filename || 'invoice.pdf').slice(0, 180);
    const type = String(mimeType || 'application/pdf').toLowerCase();

    if (type !== 'application/pdf' && !safeFilename.toLowerCase().endsWith('.pdf')) {
      return send(res, 400, { error: 'Please upload a PDF invoice.' });
    }

    const rawBase64 = cleanBase64(base64);
    if (!rawBase64) {
      return send(res, 400, { error: 'No PDF data was received.' });
    }

    const approxBytes = Math.floor(rawBase64.length * 3 / 4);
    const maxBytes = 2.5 * 1024 * 1024;
    if (approxBytes > maxBytes) {
      return send(res, 413, {
        error: 'This PDF is too large for the invoice importer. Please use a PDF under 2.5 MB.'
      });
    }

    const openAIResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-5.6-terra',
        reasoning: { effort: 'low' },
        input: [
          {
            role: 'system',
            content:
              'You extract data from customer invoices issued by CS Energy / Competa Solar. ' +
              'Read the invoice exactly as printed. Extract the customer, invoice metadata, every genuine billed line item, and the invoice financial summary. ' +
              'The financial summary is critical. On these CS Energy / Competa Solar historical invoices, the printed field labelled PRICE means the invoice price BEFORE IVA. Always map that printed PRICE amount to subtotal_net. Then separately read the printed IVA rate, IVA amount, and final TOTAL including IVA. Never treat the printed PRICE as an IVA-inclusive total. ' +
              'The relationship is PRICE ex IVA + IVA amount = TOTAL incl IVA. If all three are printed, copy them exactly rather than recalculating from line items. If PRICE is printed but one summary value is missing, only derive it when the arithmetic is unambiguous. ' +
              'Do not set subtotal_net, iva_amount or total_gross to null merely because line item pricing is incomplete. If those amounts are visibly printed in the invoice summary, capture them exactly. ' +
              'For each genuine billed line, capture quantity, unit price and line total whenever they are printed. Do not invent missing values. If a value is not present or cannot be determined reliably, return null. ' +
              'Keep equipment model numbers and meaningful descriptions. Monetary values must be numbers only, without currency symbols or thousands separators. ' +
              'Dates must be YYYY-MM-DD when identifiable. Do not treat subtotals, IVA, deposits, balances or totals as product line items unless they are genuinely billed line items.'
          },
          {
            role: 'user',
            content: [
              {
                type: 'input_file',
                filename: safeFilename,
                file_data: `data:application/pdf;base64,${rawBase64}`
              },
              {
                type: 'input_text',
                text:
                  'Extract this customer invoice into the required schema. Read the totals box/summary separately from the line items. IMPORTANT: on these invoices, PRICE is the amount excluding IVA and must be returned as subtotal_net. IVA is returned separately as iva_amount, and TOTAL is the amount including IVA. Pay particular attention to quantities, unit prices, line totals, invoice number, customer identity, PRICE ex IVA, IVA percentage, IVA amount and TOTAL incl IVA.'
              }
            ]
          }
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'cs_energy_customer_invoice',
            strict: true,
            schema: invoiceSchema
          }
        },
        store: false
      })
    });

    const apiJson = await openAIResponse.json();

    if (!openAIResponse.ok) {
      console.error('OpenAI invoice extraction error:', apiJson);
      return send(res, 502, {
        error: apiJson?.error?.message || 'OpenAI could not read this invoice.'
      });
    }

    const text = responseText(apiJson);
    if (!text) {
      console.error('No structured output returned:', apiJson);
      return send(res, 502, { error: 'No invoice data was returned.' });
    }

    let invoice;
    try {
      invoice = JSON.parse(text);
    } catch (err) {
      console.error('Could not parse invoice JSON:', text);
      return send(res, 502, { error: 'The extracted invoice data could not be parsed.' });
    }

    return send(res, 200, {
      ok: true,
      invoice,
      source_filename: safeFilename,
      model: 'gpt-5.6-terra'
    });
  } catch (err) {
    console.error('Invoice import failed:', err);
    return send(res, 500, {
      error: err?.message || 'Invoice import failed.'
    });
  }
};
