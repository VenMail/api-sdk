# Venmail Webhook & Event Endpoints

This document catalogs the webhook- and event-oriented HTTP surfaces exposed by
`mailer_web`. Each entry includes authentication guidance, payload expectations,
and downstream processing notes pulled directly from the Laravel source.

> **Tip:** Pair these contracts with the helpers in `@venmail/vsm` to verify HMAC
> signatures, detect payload types, and normalize delivery events automatically.

## 1. Mail ingestion webhooks

### `POST /api/v1/mails/org/{id}`
- **Handler:** `MailAPIController@webhook`
- **Purpose:** Primary SMTP relay ingestion endpoint. Accepts raw mail payloads
  forwarded by Venmail relays and queues `ProcessMailJob`.
- **Queueing:** `ProcessMailJob::dispatch($input, $id, $headers)` with retry-on-
  exception semantics after a 120s delay.
- **Processing:** `ProcessMailJob` handles classification, storage, contact
  enrichment, OTP/link extraction, and notification dispatching
  (@app/Http/Controllers/API/MailAPIController.php#36-64,
  @app/Jobs/ProcessMailJob.php#36-400).
- **Auth:** Network-level access only; no header secret enforced. Deploy behind
  trusted relays/VPNs.

### Payload sketch
Matches the schema consumed inside `ProcessMailJob`:
```jsonc
{
  "message_id": "<...>",
  "rcpt_to": "employee@customer.com",
  "to": "employee@customer.com",
  "from": "Sender <sender@example.com>",
  "attachments": [/* ... */],
  "html": "...",
  "text": "...",
  "spam_status": { "score": 1.2 }
}
```
Use `isMailWebhookPayload` from `@venmail/vsm` to guard this structure.

## 2. Delivery + bounce events

### `POST /api/v1/events/org/{id}`
- **Handler:** `MailAPIController@eventWebhook`
- **Purpose:** Legacy delivery/bounce status feed used by upstream ESPs.
- **Processing:** Queues `ProcessEventJob`, which branches based on payload
  shape (status vs. bounce) and updates either campaign tables or regular inbox
  mail records, including delivery timelines and failure reasons
  (@app/Http/Controllers/API/MailAPIController.php#51-64,
  @app/Jobs/ProcessEventJob.php#51-562).
- **Payloads:**
  - `{"status":"MessageDelivered","message":{...}}`
  - `{"original_message":{...},"bounce":{...}}`
  - Nested `{ event, payload }` wrappers.
- **Usage:** Convert to a `NormalizedDeliveryEvent` with
  `normalizeDeliveryEvent()`.

### Kumo log hooks — `POST /api/v1/kumo/events`
- **Handler:** `MailAPIController@kumoEventWebhook`
- **Purpose:** Receives batched KumoMTA `LogRecord` objects (delivery,
  transient failure, bounce, expiration, etc.).
- **Auth:** HMAC-style shared secret header `X-Kumo-Webhook-Secret` compared with
  `config('kumo.webhook.secret')`. Requests lacking or mismatching secrets are
  rejected with `401`; production fails closed if the secret is undefined.
- **Processing:** Payload is normalized into status/bounce shapes and pushed
  through `ProcessEventJob` just like `/events/org/{id}`
  (@app/Http/Controllers/API/MailAPIController.php#66-175,
  @config/kumo.php#54-75).
- **Org resolution:** Derived from `meta.venmail_org_id`/`message_id` suffixes.

### External SMTP provider hooks
- **Handlers:** `SmtpProviderService@handleWebhook` plus provider-specific
  parsers (`handleSendGridWebhook`, `handleMailgunWebhook`, `handlePostmarkWebhook`).
- **Routing:** Custom per-provider endpoints (see admin UI / integrations).
- **Auth:** Each `SmtpProvider` row stores a unique `webhook_secret` validated
  against the incoming secret before events are processed
  (@app/Services/SmtpProviderService.php#509-616,
  @app/Models/SmtpProvider.php#34-70).
- **Effects:** Updates campaign metrics (opens/clicks), records bounces via
  `FailedCampaignMail`, and emits `CampaignEvent` rows.

## 3. Organization integration events

When organizations configure integrations (Zapier, custom webhooks), Venmail
records internal events and POSTs them to the subscriber URLs.

- **Event catalog:** Defined in `OrganizationIntegration::SUPPORTED_EVENTS`
  (e.g. `MailReceived`, `CampaignSent`, `SubscriptionExpired`)
  (@app/Models/OrganizationIntegration.php#15-90).
- **Recording:** `OrganizationIntegrationService::recordEvent` collects all
  active integrations per organization, filters by subscription list, stores
  `OrganizationIntegrationEvent` rows, and dispatches delivery jobs when a
  webhook URL is present
  (@app/Services/OrganizationIntegrationService.php#15-85).
- **Delivery:** `DeliverOrganizationIntegrationEvent` signs the JSON body using
  `hash_hmac('sha256', body, webhook_secret)` and adds headers:
  - `X-Venmail-Event`
  - `X-Venmail-Signature`
  Success responses mark the event as delivered; failures are retried with an
  exponential backoff schedule before being marked `pending_retry`/`failed`
  (@app/Jobs/DeliverOrganizationIntegrationEvent.php#15-125).

Use `venmailIntegrationWebhook` in this package to verify those signatures and
hydrate a typed `VenmailIntegrationEvent` in your app.

## 4. Form builder webhooks & emitted events

### Management endpoints (JWT-protected)
- `GET /api/v1/app-forms/{id}/webhooks`
- `POST /api/v1/app-forms/{id}/webhooks`
- `DELETE /api/v1/app-forms/{id}/webhooks/{webhookId}`
All handled by `AppFormAPIController` with organization + permission checks.
Payload schema matches `App\Models\FormWebhook`
(@app/Http/Controllers/API/AppFormAPIController.php#2088-2302,
 @app/Models/FormWebhook.php#1-91).

### Emitted public events
The public form APIs emit the following events that integrations can subscribe
to (via Laravel's event dispatcher):
- `form.response.created`
- `form.response.answered`
- `form.response.submitted`
(@app/Http/Controllers/API/AppFormAPIController.php#1984-2085,
 @app/Http/Controllers/API/AppFormAPIController.php#2356-2379,
 @app/Http/Controllers/API/AppFormAPIController.php#2699-2704).

If your webhook listens for those events, expect payloads containing:
```jsonc
{
  "form_id": 123,
  "response_id": 456,
  "question_id": 789 // when applicable
}
```

## 5. Payments & billing hooks

### `POST /api/v1/webhooks/stripe`
- Alias: `/api/v1/integrations/stripe/webhook`
- **Handler:** `AppFormAPIController@stripeWebhook` for form payment intents.
- **Middleware:** `throttle:100,1` to guard abuse
  (@routes/api.php#135-159).

### `POST /webhooks/stripe` (App-wide billing)
- **Handler:** `StripeWebhookController@handle`
- **Purpose:** Processes subscription renewals, invoice payments, and checkout
  completions for organizations.
- **Auth:** Stripe signature validation using `cashier.webhook.secret`.
- **Processing:** Syncs Stripe subscriptions, updates invoices/transactions, and
  adjusts org payment state (@app/Http/Controllers/StripeWebhookController.php#16-166).

## 6. Slack notifications

### `PATCH /organizations/{organization}/slack`
- **Handler:** `OrganizationSlackController@update`
- **Purpose:** Allows authenticated org owners to configure a Slack webhook URL
  for internal notifications.
- **Validation:** Sends a test message immediately and errors if Slack rejects
  the webhook (@app/Http/Controllers/OrganizationSlackController.php#11-45).

## 7. Helpful references

| Concern | File |
| --- | --- |
| Mail ingestion payload structure | `app/Jobs/ProcessMailJob.php` |
| Delivery/bounce normalization | `app/Jobs/ProcessEventJob.php` |
| Campaign metrics via ESP hooks | `app/Services/SmtpProviderService.php` |
| Integration event recording | `app/Services/OrganizationIntegrationService.php` |
| Integration delivery/signature | `app/Jobs/DeliverOrganizationIntegrationEvent.php` |
| Form webhook CRUD + events | `app/Http/Controllers/API/AppFormAPIController.php` |
| Stripe billing hooks | `app/Http/Controllers/StripeWebhookController.php` |
| Slack webhook validation | `app/Http/Controllers/OrganizationSlackController.php` |

Understanding these code paths ensures your custom automations stay aligned with
Venmail's server-side behavior and gives you precise hooks for logging,
retries, and observability.
