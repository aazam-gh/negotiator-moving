# Negotiator hackathon notes

Live app: https://clean-greyhound-195.convex.site

Negotiator is an approval-first procurement workflow for moving services. It parses a request deterministically, researches providers with Firecrawl, requires explicit approval before AgentMail outreach, and compares structured replies while preserving unknowns.

## Current proof

- Production Convex deployment and static hosting are live.
- A real authenticated production mission reached Firecrawl discovery and returned five scored provider candidates with source links.
- The approval gate held at `Contacted 0`; no real provider outreach was sent. A separate disposable AgentMail inbox was used for a controlled production round-trip.
- The fictional demo proves the three-row quote comparison UI.
- AgentMail lifecycle projection, durable research run state, password onboarding, Stripe checkout/webhook wiring, and server-side subscription lookup are deployed.
- Controlled AgentMail proof passed: durable labeled send, in-thread inbound reply, webhook delivery, deterministic quote extraction, and mission transition to `comparing`.
- AgentMail component environment wiring is patched and deployed so its isolated durable worker receives production credentials.
- Verification passed: 15 tests, TypeScript, ESLint, production build, Convex deployment, static upload, public HTTP 200, JWKS HTTP 200, and Stripe webhook route HTTP 200.

## SaaS boundaries

Stripe enforcement is opt-in with `BILLING_REQUIRED=true` and must remain disabled until Stripe test credentials, a subscription price ID, and the webhook secret are configured. No secrets belong in this repository. Provider outreach remains approval-gated and requires a verified contact email.
