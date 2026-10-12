# AI quote drafting in the existing back office

## What changes

The existing quote editor has a **Draft with AI** button. Choose a customer, describe the job and optionally enter a requested capacity. An authenticated endpoint uses the existing OpenAI connection to suggest catalogue products and quantities. It returns a reviewable preview; **Add reviewed lines to quote** appends them to the current editable quote. The ordinary **Save quote** remains a separate action. Nothing is automatically saved, sent, invoiced, accepted or deployed by generating a draft.

The model cannot set prices. Server code hydrates each product ID from this owner's saved `cs_energy_app_state` price book, using the current fixed/markup formula. Preview totals use the existing quote calculation (21% IVA). This feature does not add support for other VAT rates. The response omits unknown or unsuitable equipment instead of inventing custom priced items. Missing/bad-priced catalogue entries are excluded with a warning. Missing requirements are visibly listed and excluded from the total.

AI equipment and quantities are preliminary suggestions, not an electrical design or a compatibility/stock guarantee. Capacity is only a requested target. A qualified installer must verify sizing, compatibility, roof/mounting, protection, cable routes, labour and legalisation before issuing the quotation.

## Dependencies and access

- Reuses `OPENAI_API_KEY` and optional `ASSISTANT_MODEL` (default `gpt-4.1-mini`). No browser-side provider key.
- Reuses the existing assistant owner access table, rate-limit RPC and `SUPABASE_SERVICE_ROLE_KEY`. Accounts without enabled assistant access receive an error; existing roles and policies are not changed.
- No new database migration, paid service, customer-data import or permission expansion.
- The server reads the **saved cloud** customer/catalogue data. Save and sync price-book edits before generating. The browser refuses to apply a draft if the selected products/prices, customer, account or quote editor changed.
- The model receives the entered description, requested capacity and catalogue ID/category/manufacturer/model/SKU only. It does not receive stored customer contact details, addresses, product prices/costs, account settings or credentials. Keep personal details out of free text. `store: false` is set on the Responses request.
- At most 300 saved catalogue entries / 120 KB catalogue input; 40 output lines; integer quantities 1–10,000. Larger catalogues fail explicitly instead of silently dropping products. Description limit 4,000 characters and capacity limit 10,000 kWp. These are request limits, not design validation.

## Verification

From the repository directory:

- `node --test tests/*.test.js`
- `node --check quote-draft.js`
- `node --check api/quote-draft.js`
- `node --check lib/quote-draft.js`
- With jsdom 26.1.0 installed, `node tests/quote-draft-dom.cjs` and `node tests/assistant-dom.cjs`.
- With Playwright and Chromium installed, `CHROMIUM_PATH=/path/to/chromium node tests/quote-draft-ui.cjs`.

Tests use synthetic customers/catalogue data and mocked providers, never a real customer or paid model request. DOM tests cover preview without mutation, totals, safe rendering, repeated apply/generate, cancellation, late responses, changed prices/editor/account, error recovery and sign-out. Backend tests cover auth, saved catalogue hydration, malformed/missing prices, model injection of price/unknown products, request/output bounds and provider failures.

Local verification: 25 backend tests and both DOM suites passed. Browser test is included but could not execute in the build environment: installed Chromium fails to create a process socket (`Operation not permitted`), including an approved retry. Consequently layout/screenshots and full browser behaviour are **not verified**. Live authenticated OpenAI drafting is **not verified**. No change has been pushed, merged or deployed.

Before activation, review the patch, approve publication/deployment separately, run the browser test in a browser-capable environment, and perform an authenticated preview smoke test with a synthetic customer/product list. Confirm preview environment has the existing assistant configuration. Check no record is saved before pressing Save quote, cancellation leaves the editor unchanged, stored catalogue price/IVA matches, and customer/engineer accounts cannot call the endpoint. Do not test by sending a customer quote.
