# Negotiator

Negotiator is an approval-first procurement agent. This first vertical slice turns a moving-service request into structured requirements, researches providers, asks only approved businesses for quotes, and presents replies as a live comparison.

## What works in v0.1

- Convex-persisted missions, providers, sources, outreach threads, messages, quotes, activity, agent runs, and approvals.
- Anonymous sessions for a frictionless demo plus password accounts for persistent SaaS ownership.
- Firecrawl component wrapper for web provider discovery.
- AgentMail component for durable sending, threading, and webhook ingestion.
- Deterministic, user-reviewed moving-request parsing.
- Conservative inbound classification and quote extraction that preserves unknown fields.
- Explicit, idempotent outreach approval. No email can be sent before approval.
- Realtime mission dashboard and an idempotent fictional demo mission.
- Static export configured for Convex static hosting at `convex.site`.
- Stripe subscription checkout and webhook synchronization are wired behind a server-side subscription gate.

Negotiator does not purchase services, accept quotes, or process payments.

## Run locally

Requirements: Node.js 20+ and pnpm 10.

```bash
pnpm install
npx convex dev
pnpm dev
```

The generated `.env.local` supplies `NEXT_PUBLIC_CONVEX_URL`. The default quickstart port may differ from 3000.

## Configure integrations

Secrets belong in the Convex deployment, never in `.env.local` or client code:

```bash
npx convex env set FIRECRAWL_API_KEY your_key
npx convex env set AGENTMAIL_API_KEY your_key
npx convex env set AGENTMAIL_INBOX_ID your_inbox_id
npx convex env set AGENTMAIL_WEBHOOK_SECRET your_webhook_secret
npx convex env set STRIPE_SECRET_KEY sk_test_...
npx convex env set STRIPE_WEBHOOK_SECRET whsec_...
npx convex env set STRIPE_PRICE_ID price_...
npx convex env set BILLING_REQUIRED true
npx convex env set SITE_URL https://<deployment>.convex.site
```

Register AgentMail's webhook as `https://<deployment>.convex.site/agentmail/webhook`.
Register Stripe's webhook as `https://<deployment>.convex.site/stripe/webhook`. The public app exposes an Upgrade to Pro action when `STRIPE_PRICE_ID` is configured. Keep `BILLING_REQUIRED` disabled until the test-mode checkout and webhook have been verified end to end.

The AgentMail component is isolated from the app deployment environment, so the Convex app config explicitly passes the AgentMail credentials into that component. This is required for its durable send worker and webhook callback path to operate in production.

Without keys, the fictional demo remains usable while real integration calls return clear configuration errors.

## Verify

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
npx convex dev --once
```

## Publish to convex.site

Publishing is deliberately separate from setup and development:

```bash
pnpm deploy
```

This builds the static Next.js export, pushes Convex functions, and uploads the frontend through the Convex Static Hosting component.

## Architecture

- `components/negotiator/NegotiatorApp.tsx`: product flow and reactive dashboard.
- `convex/schema.ts`: durable mission state and audit trail.
- `lib/negotiator-rules.ts`: deterministic request, qualification, RFQ, reply, and comparison rules.
- `convex/research.ts`: authenticated Firecrawl discovery and source persistence.
- `convex/outreach.ts`: approval gate and AgentMail sends.
- `convex/inbound.ts`: idempotent inbound webhook projection, delivery-state projection, and deterministic quote extraction.
- `convex/billing.ts`: Stripe checkout and server-side active-subscription lookup.
- `convex/quotes.ts`: authenticated manual quote correction.
- `convex/http.ts`: auth/webhook routes plus static-site fallback.
- `convex/demo.ts`: replay-safe fictional demo fixture.

## Known v0.1 limits

- Moving-service parsing intentionally extracts only obvious patterns; the user completes uncertain fields before research.
- Provider contact email extraction is conservative, so providers without a verified public business email cannot be selected for outreach.
- Demo providers use reserved `.demo` domains and are clearly labeled fictional.
- Production outreach billing is opt-in via `BILLING_REQUIRED=true`; it should remain disabled until Stripe test credentials, a price ID, and the webhook endpoint are configured.

## Runtime boundary

Codex is the engineering tool used to build Negotiator. It is not part of the deployed application. The v0.1 runtime is Convex + Firecrawl + AgentMail and does not require an LLM SDK or model API key.
