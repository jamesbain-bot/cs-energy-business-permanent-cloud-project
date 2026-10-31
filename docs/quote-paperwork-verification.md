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

## Outstanding before release
- Chromium browser-print and html2pdf attachment-export validation. Local Chromium fails process-singleton socket setup; escalation fails workspace mount; dedicated headless-shell download fails archive integrity. Native browser cannot open file URLs and cannot reach the local HTTP preview from its separate host.
- Remote review-branch push was denied by access reviewer pending explicit owner approval for existing GitHub repository destination. No retry, no remote push or production deployment.
- Preview-only sample HTML must stay separate from final production source changes.

## Reproduction
`HTML_ONLY=1 node tests/quote-paperwork.cjs` builds isolated synthetic HTML, without loading auth, network or real business data.
`node tests/quote-paperwork.cjs` additionally runs Chromium screenshot/PDF checks when a functioning Chromium is available.
Review artifacts live under untracked `output/quote-preview/`; do not publish this directory with application code.
