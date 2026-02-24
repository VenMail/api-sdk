# @venmail/vsm

> Venmail's official Node.js/TypeScript SDK for receiving webhook events,
> validating signatures, and normalizing delivery data.

`@venmail/vsm` gives your app everything it needs to trust Venmail webhook
traffic: an Express-ready middleware, signature utilities, TypeScript guards,
and helpers for keeping delivery timelines consistent across services.

---

## Why teams use this SDK

1. **Drop-in Express middleware** – verify HMAC signatures, parse payloads, and
   dispatch strongly typed events with a single handler.
2. **Security helpers** – low-level utilities for shared-secret headers, raw
   body validation, and custom transports.
3. **Typed payload detection** – quickly branch on inbound mail, delivery
   status, bounce, or form events.
4. **Delivery timeline normalization** – convert the many Venmail payloads into
   a single `NormalizedDeliveryEvent` before your business logic runs.

## Installation

```bash
npm install @venmail/vsm
# or
yarn add @venmail/vsm
# or
pnpm add @venmail/vsm
```

The package ships as pure ESM with generated type definitions. Middleware
helpers assume an Express-compatible runtime.

## Quick start

The SDK is built around the `venmailIntegrationWebhook` middleware. Drop it
into your Express app, pass your shared secret, and handle events in one place.

> 💡 **Need email templates?** Use our companion CLI tool `@venmail/vsm-cli` to
> scan your codebase and generate email templates automatically for your framework.
> Install with `npm install -g @venmail/vsm-cli` and run `vsm scan` in your project.

```ts
import express from "express";
import {
  venmailIntegrationWebhook,
  type VenmailIntegrationEvent,
} from "@venmail/vsm";

const app = express();
app.use(express.json({ type: "application/json" }));

app.post(
  "/webhooks/venmail",
  venmailIntegrationWebhook({
    secret: process.env.VENMAIL_WEBHOOK_SECRET!,
    async onEvent(event) {
      console.log("Received", event.event_type, event.payload);
    },
  })
);

app.listen(3000);
```

### Step 1. Verify signatures manually (optional)

Need to validate events outside of Express (e.g. edge runtimes or custom
parsers)? Use the low-level helpers:

```ts
import { verifyVenmailSignature, verifySharedSecretHeader } from "@venmail/vsm";

const isSigned = verifyVenmailSignature({
  secret: process.env.VENMAIL_WEBHOOK_SECRET!,
  signature: req.get("x-venmail-signature") ?? "",
  rawBody,
});

const hasSharedSecret = verifySharedSecretHeader({
  secret: process.env.VENMAIL_WEBHOOK_SECRET!,
  provided: req.get("X-Venmail-Webhook-Secret"),
});
```

### Step 2. Detect payload types

Venmail emits distinct payload shapes for inbound mail, status updates, bounces,
and more. The guards make branching safe and ergonomic:

```ts
import {
  detectVenmailWebhookKind,
  isMailWebhookPayload,
  normalizeDeliveryEvent,
} from "@venmail/vsm";

const kind = detectVenmailWebhookKind(req.body);

if (kind.kind === "mail" && isMailWebhookPayload(req.body)) {
  // handle inbound email ingestion
}

if (
  kind.kind === "status" ||
  kind.kind === "bounce"
) {
  const delivery = normalizeDeliveryEvent(req.body);
  console.log(delivery.status, delivery.campaignId);
}
```

## API surface at a glance

| Helper | What it does |
| --- | --- |
| `venmailIntegrationWebhook(options)` | Express middleware that validates signatures, parses JSON, emits strongly typed events, and auto-responds if you don't write a response. |
| `verifyVenmailSignature(options)` | Low-level SHA-256 HMAC validation for webhook signatures. |
| `verifySharedSecretHeader(options)` | Constant-time comparison for shared-secret headers (e.g. `X-Venmail-Webhook-Secret`). |
| `detectVenmailWebhookKind(payload)` | Returns a discriminated union describing the payload category. |
| `isMailWebhookPayload`, `isStatusPayload`, `isBouncePayload` | Narrow specific payload shapes before operating on them. |
| `normalizeDeliveryEvent(payload)` | Converts payloads into a consistent `{ messageId, recipient, status, campaignId }` object. |

All exported interfaces are re-exported from the package root for IDE autocompletion.

## Documentation & support

- **Live docs**: The GitHub Pages deployment lives at
  [`https://venmail.github.io/vsm`](https://venmail.github.io/vsm). Every push to
  `main` triggers `.github/workflows/docs.yml`, which runs `npm ci`, executes the
  `build:docs` script, and publishes the contents of `docs-site/` via
  `actions/deploy-pages`.
- **Local preview**: Run `npm run docs:serve` to spin up a static server pointed
  at `docs-site/` (defaults to <http://localhost:8080>). Update the files inside
  `docs-site/` and re-run `npm run build:docs` before pushing to guarantee CI has
  the latest assets.

Need help? Open an issue on GitHub with reproduction details plus any relevant
request IDs from Venmail logs.

## Local development (for contributors)

```bash
npm run typecheck
npm run build
```

The `dist/` artifacts are generated via `tsc`. No bundler is required.

## License

MIT
