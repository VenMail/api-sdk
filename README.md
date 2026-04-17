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

## Agent API client

The SDK also ships an `AgentClient` for the Venmail Agent REST API — the
bearer-authenticated endpoints that let AI agents (Claude, MCP servers, any
HTTP client) read and send mail from a Venmail inbox.

Tokens are provisioned from the Venmail UI (Admin → AI Agents, or Profile →
Advanced → Share with AI agent) and look like `ma-vm_<prefix>_<secret>`.

```ts
import { AgentClient } from "@venmail/vsm";

const client = new AgentClient({
  baseUrl: "https://mail.example.com",
  token: process.env.VENMAIL_AGENT_TOKEN!,
  // Called when a refreshed token arrives; persist it somewhere.
  onTokenRefreshed: (t) => keychain.set("venmail:agent", t),
});

// Identify the bound inbox & scopes.
const me = await client.me();

// List threads.
const { data: threads, next_cursor } = await client.listThreads({
  folder: "inbox",
  limit: 25,
});

// Reply.
await client.replyToThread(threads[0].id, {
  body: "Thanks — I'll follow up shortly.",
});

// Send a new message.
await client.sendMessage({
  to: "alice@example.com",
  subject: "Quick update",
  body: "Hello Alice, here is the status.",
});

// Rotate the token.
await client.refreshToken();
```

### Supported endpoints

| Method                    | Scope            | Description                              |
| ------------------------- | ---------------- | ---------------------------------------- |
| `me()`                    | (any valid token)| Identity + scopes of the bound inbox.    |
| `listThreads(params)`     | `inbox:read`     | Paginated thread list with cursor + q.   |
| `getThread(id)`           | `thread:read`    | Full thread with nested messages.        |
| `markThreadRead(id)`      | `mail:mark_read` | Idempotent.                              |
| `replyToThread(id, body)` | `mail:send`      | Inline reply to an existing thread.      |
| `sendMessage(input)`      | `mail:send`      | New outbound mail.                       |
| `refreshToken()`          | (any valid token)| Rotates; old token is revoked server-side.|
| `revokeToken()`           | (any valid token)| Explicit revoke.                         |

### Errors

All API failures throw `AgentApiError` with a `status` field and the raw
server `body`. Transient 5xx failures are retried up to `retries` (default 2)
with jittered exponential backoff.

```ts
import { AgentApiError } from "@venmail/vsm";

try {
  await client.listThreads();
} catch (e) {
  if (e instanceof AgentApiError && e.status === 403) {
    // Token missing required scope — reissue with the right permissions.
  }
  throw e;
}
```

## Local development (for contributors)

```bash
npm run typecheck
npm run build
```

The `dist/` artifacts are generated via `tsc`. No bundler is required.

## License

MIT
