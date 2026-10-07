# CS Energy assistant — first release

The assistant is part of the existing **Assistant** screen. It reads the signed-in owner's cloud records, looks up Google Calendar appointments, and prepares email/WhatsApp drafts. The exact recipient and wording are stored on the server. Only the separate confirmation control can submit that draft.

## Included

- Customer, system, job and quote lookups, scoped to the signed-in account.
- Saved jobs plus Google Calendar reads, with Europe/Madrid date handling.
- Email submission through the existing Resend connection and verified CS Energy sender.
- WhatsApp Cloud API text replies, incoming text storage, delivery-status callbacks, and signature verification.
- Twilio telephone entry point: registered caller number, keypad PIN, spoken questions, exact draft read-back, spoken/keypad approval.
- Approval ledger, expiry, concurrent-request protection and persistent phone sessions. No automatic retries after uncertain submission.
- Phone access settings, browser dictation where supported, and integration status in the app.

## Deliberate first-release limits

Phone conversations use Twilio speech recognition and text-to-speech in turns; this is not a full-duplex OpenAI Realtime call. Real calls still need latency and audio testing after a number is connected. A slow request fails safely and asks the caller to use the back office.

The assistant does not yet change bookings, create CRM jobs/invoices, read Gmail, attach PDFs, transcribe WhatsApp voice notes, or automatically reply to customers. Those operations remain in the existing app. It never claims to have performed them.

WhatsApp text replies require an incoming customer message to the connected number in the previous 24 hours. Business-initiated messages outside that window require approved Meta templates and the appropriate consent; template selection/sending is not included in this release. The existing manual WhatsApp buttons continue to work. A new API connection does not import old WhatsApp chat history.

## Database and account setup

Apply `supabase/migrations/20261007161325_cs_energy_assistant.sql` to the existing CS Energy project. These are additive tables; no CRM rows are replaced. All new tables have RLS enabled and no browser grants. Server-side code verifies a Supabase access token and checks `cs_energy_assistant_access` before reading any business data. Caller ID alone cannot authorise access.

Enable only explicitly verified business-owner accounts by inserting their existing Auth user IDs into `cs_energy_assistant_access(user_id)`. Never grant every authenticated user access, infer access from a customer-created app-state row, or use editable user metadata. An owner can register their phone and PIN in the Assistant screen. PINs are salted with scrypt; five attempts lock PIN entry for fifteen minutes. Changing phone credentials invalidates existing calls.

The business has several historical owner accounts. Web conversations always use the signed-in account's own records. Phone calls use the account where that phone was registered. Choose the same account for `WHATSAPP_OWNER_USER_ID`.

## Existing server environment

The production project already uses `OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `GOOGLE_SERVICE_ACCOUNT_JSON` and `GOOGLE_CALENDAR_ID`. Keep all secrets in Vercel environment settings; do not commit them or paste them in chat. Some existing secrets are production-only, so preview environments need separate configuration before authenticated testing.

Optional: `ASSISTANT_MODEL` (default `gpt-4.1-mini`), `ASSISTANT_EMAIL_FROM` (default existing verified sender `CS Energy <info@competasolar.es>`), `GOOGLE_IMPERSONATE_EMAIL` (default existing Calendar subject). A configured status means the environment variables exist, not that a provider delivery has been verified.

## Connect a telephone number

Set the following server environment variables after provisioning the chosen Twilio account/number:

| Variable | Value |
| --- | --- |
| `TWILIO_ACCOUNT_SID` | Twilio account SID owning the number |
| `TWILIO_AUTH_TOKEN` | Secret used to validate Twilio requests |
| `TWILIO_PHONE_NUMBER` | Assistant's number in international `+…` format |
| `ASSISTANT_PUBLIC_URL` | `https://app.csenergy.solar` |

Set the number's **A call comes in** webhook to **POST** `https://app.csenergy.solar/api/assistant?mode=voice`. Use this exact HTTPS hostname, since webhook signatures bind the URL. Register the owner's mobile and a 6–10 digit PIN in the app. Calls from other numbers get no CRM access. PIN entry uses the keypad, followed by `#`; PINs are not sent to the language model. The assistant introduces itself as AI.

Before using it for real customer communication, call from the registered mobile, check PIN rejection, ask for a known appointment, prepare a message to a test contact, and approve/cancel it. Voice confirmation requires a narrow yes/no phrase with at least 0.85 recognition confidence or keypad 1/2. No recording is enabled by this code. Provider speech processing/logging settings should be reviewed in the provider account.

## Connect WhatsApp Business

Use the Meta WhatsApp Cloud API for the CS Energy business number. Check the account's number onboarding/coexistence options before changing an existing WhatsApp Business app number.

| Variable | Value |
| --- | --- |
| `WHATSAPP_ACCESS_TOKEN` | Server-only token authorised to send messages |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta phone-number ID for CS Energy |
| `WHATSAPP_APP_SECRET` | App secret for verifying signed POST bodies |
| `WHATSAPP_VERIFY_TOKEN` | A random webhook verification secret |
| `WHATSAPP_OWNER_USER_ID` | Explicitly enabled owner account ID |
| `WHATSAPP_GRAPH_VERSION` | Supported Graph API version for the Meta app, e.g. `vXX.0`; set from the provider console, not a guessed version |

Set the callback to `https://app.csenergy.solar/api/assistant?mode=whatsapp`, enter the same verification token, and subscribe to message events. After redeploying, send a test WhatsApp to the connected number, ask the assistant to read it, draft a reply, and confirm it. Confirm delivery callbacks in the ledger. Incoming messages are stored as untrusted data and never trigger automatic responses.

## Verification and operations

Run `node --test tests/assistant.test.js` for authentication, tenant separation, immutable approval, concurrent clicks, timeout handling, webhook signatures, duplicate incoming messages, phone confirmation and the WhatsApp service window. `node tests/assistant-dom.cjs` checks the screen's interactions with jsdom installed; `node tests/assistant-ui.cjs` checks layout with Playwright and Chromium installed. The tests mock providers and never send real customer messages.

Implementation verification: 13 backend tests and the DOM interaction test passed. Database privilege, rate-limit and PIN-lockout checks passed against the CS Energy database; test mutations were rolled back. Full browser/layout testing could not run in the build workspace because the Chromium download failed. Live AI, phone/audio and provider delivery still need a signed-in smoke test and configured external accounts.

The database advisor reports five informational “RLS enabled, no policies” entries for these deliberately server-only tables. Browser grants are explicitly revoked. It also reports pre-existing issues outside this change, including RLS disabled on `customer_care_plan_payment_history` and public execution of legacy security-definer functions. Those existing features were not altered in this release. [RLS remediation reference](https://supabase.com/docs/guides/database/database-linter?lint=0013_rls_disabled_in_public).

Keep a reasonable retention policy for assistant transcripts and customer messages. After choosing the retention period, delete expired sessions (which cascade to actions) and old incoming messages with an administrator job. No automated deletion is enabled by this release.

If the provider accepted a message but the connection/database update failed, the ledger can remain `unknown` or `executing`. Check the provider before creating a replacement message. `submitted` means accepted by the provider; it is not proof of delivery. WhatsApp callbacks can advance to `sent`, `delivered`, `read` or `failed`.

Reference documentation: [OpenAI function calling](https://developers.openai.com/api/docs/guides/function-calling), [Twilio Gather](https://www.twilio.com/docs/voice/twiml/gather), [Twilio signature validation](https://www.twilio.com/docs/usage/security), [Resend send email](https://resend.com/docs/api-reference/emails/send-email), [Google Calendar events](https://developers.google.com/workspace/calendar/api/v3/reference/events/list), [WhatsApp Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api/).
