# Quote paperwork redesign — review status

Baseline: production commit `f62d0fc1348b878f51687be80647f9e012f6d6ce`.

## Scope
- Quote-only header, customer panel, equipment table, totals, deposit, validity and configured notes.
- Existing logo/company settings, quote content, tax, calculations, dates and references retained.
- No additional prices, internal costs or margins disclosed.
- No customer records, delivery/status logic, access policies or other document generators changed.
- Retains `.doc-report` for existing browser-print and attachment-export selectors.

## Verification completed
- Inline JavaScript syntax validated.
- `node tests/quote-document.test.cjs` passes: exact known totals/tax/deposit/validity, escaping, no saves, same preview/print content.
- With `QUOTE_BASELINE` pointing at original index.html: deposit, balance, invoice and contract generated HTML byte-for-byte identical.
- `node --test tests/assistant.test.js tests/customer-goodwe.test.cjs`: 25 passed.
- WeasyPrint synthetic PDF rendered and visually checked: one-page standard quote, four-page 54-row long quote. Repeated table headings, all 50 additional rows and final totals retained; no observed clipping.
- Synthetic after.pdf saved privately to Library as CS-Energy-Quote-Design-SAMPLE.pdf. Not an issued customer quotation.

## Browser verification (31 October 2026)
- Owner explicitly approved publishing review branch to existing repository. Connector created preview/quote-paperwork; Vercel staging deployment only, no production release.
- Browser-rendered short and 54-row html2pdf exports downloaded and visually checked: 1 and 4 pages respectively. Correct totals/terms present; row boundaries do not clip text. Raster export does not repeat table headings across pages (existing html2pdf limitation); browser print stylesheet specifies repeating headings.
- Fixed large blank-top/cropped-body attachment defect when the source preview was scrolled: quote exports now explicitly set html2canvas scrollX/scrollY to zero. Other document export options unchanged.
- Fixed distorted logo in raster export using intrinsic image ratio rather than object-fit (unsupported by html2canvas).
- 390px iframe viewport checked: body scrollWidth equals clientWidth, equipment/quantity and totals remain readable.
- `node tests/quote-export.test.cjs` passes quote-only export options/nonquote preservation without invoking send helpers.

## Remaining limit
- Native Chromium print dialog does not open from Print/Save PDF or Ctrl+P in this cloud browser, so native Chromium print-to-PDF not verified. WeasyPrint print layout and real browser html2pdf exports were verified separately.
- Production not published. QA sample HTML must be excluded from release; use source-only commit, not QA branch head.

## Reproduction
`HTML_ONLY=1 node tests/quote-paperwork.cjs` builds isolated synthetic HTML, without loading auth, network or real business data.
`node tests/quote-paperwork.cjs` additionally runs Chromium screenshot/PDF checks when a functioning Chromium is available.
Review artifacts live under untracked `output/quote-preview/`; do not publish this directory with application code.
