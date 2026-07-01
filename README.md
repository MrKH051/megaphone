# Megaphone 📣 — the growth agency for AI agents

> Every marketplace eventually grows an ad industry. **Megaphone is the first one built for the agent economy** —
> an AI agent on the [CROO Agent Store](https://agent.croo.network) whose *customers are other agents' builders*,
> and whose *employees are other agents*, hired and paid per order through real on-chain escrow (USDC on Base).
>
> Built for the **CROO Agent Hackathon** on the CROO Agent Protocol (CAP).

## The problem

The CROO Agent Store already lists **150+ services from 70+ agents** — and most of them are invisible.
Builders ship great agents, then describe them in one rushed sentence, price them blindly, and get zero orders.
On a marketplace where buyers (humans *and* buyer-agents) decide in seconds, a weak listing is a dead agent.

Megaphone fixes that, as a paid, callable CAP service.

## What it sells

| Service | Price | What the customer gets |
|---|---|---|
| 🔍 **Listing Audit** | ~$0.5 | Listing quality score, concrete issues, a full rewrite (name + description), pricing advice against a live competitor table |
| 📦 **Promo Kit** | ~$3 | Everything in the Audit **plus** an X/Twitter announcement thread, a README pitch section, and a generated promo banner — fact-checked by a hired verifier agent |
| 🚀 **Launch Campaign** | ~$10 | Everything in the Kit **plus** execution: Megaphone hires a posting agent from the store to publish the thread, and ships a day-by-day launch plan |

## Why this is a real A2A economy, not a wrapper

Every order makes Megaphone act on **both sides of the CAP marketplace**:

```
  another builder ──($ order)──▶  MEGAPHONE 📣
                                     │
                                     │ snapshots the ENTIRE store (public CAP data):
                                     │ every listing, price, 7-day traction, agent track record
                                     │
                     ┌───($)────────┼───($)──────────┬───($)──────────┐
                     ▼              ▼                ▼                │
               research agent   fact-check agent   posting agent      │
               (market context) (vets the copy)   (publishes thread)  │
                     └──────────────┴────────────────┴────────────────┘
                                     │
                                     ▼
                     deliverable + on-chain receipts:
                     exactly which agents were hired and what each was paid
```

- **Buys from the network:** each fulfilment hires external agents (research → fact-check → posting), each with
  fallback candidates auto-discovered from the live store, each paid through CAP escrow.
- **Sells to the network:** the customers are other agent teams — real third-party wallets.
- **Radical transparency:** every deliverable ships with its own *supply chain* — the receipts (order ids, prices,
  tx hashes) of every agent Megaphone paid to produce it.

## How it works

1. **Store intelligence** — snapshots every service + agent profile from CROO's public endpoints
   (`/backend/v1/public/services`, `/backend/v1/public/agents`), then computes the customer's competitive
   context: closest rival listings, price position vs. the store median, traction gaps.
2. **Grounded copywriting** — an LLM writes the audit/rewrite/thread **only from that live data**, with a hired
   fact-check agent vetting the claims. No invented capabilities.
3. **In-house banner generator** — a 1200×630 SVG promo card produced by code (zero external cost).
4. **CAP integration** — a single `@croo-network/sdk` `AgentClient` runs the full lifecycle both ways:
   `negotiateOrder → acceptNegotiation → payOrder → deliverOrder → getDelivery`, driven by WebSocket events.

### SDK methods used

`connectWebSocket`, `negotiateOrder`, `acceptNegotiation`, `getNegotiation`, `listOrders`, `getOrder`,
`payOrder`, `deliverOrder`, `getDelivery` + events `NegotiationCreated`, `OrderCreated`, `OrderPaid`,
`OrderCompleted`, `OrderRejected`.

## Quick start

```bash
git clone <this repo>
cd megaphone
npm install
npm start          # runs fully offline (simulated escrow + demo brain)
```

Open **http://localhost:4000** — a live dashboard showing orders sold, agents hired, revenue vs. spend,
and every deliverable with its receipts. Try an order against any real listing name from the store.

### Going live (real CAP on Base)

Copy `.env.example` to `.env` and set:

```ini
RAIL=croo
CROO_MEGAPHONE_SDK_KEY=...        # from the CROO dashboard
CROO_AUDIT_SERVICE_ID=...         # your three listings
CROO_KIT_SERVICE_ID=...
CROO_CAMPAIGN_SERVICE_ID=...
LLM_API_KEY=...                   # any OpenAI-compatible provider (Groq is free)
MEGAPHONE_ADMIN_TOKEN=...         # protects the manual-order endpoint
```

Test purchase from a second agent (any CROO SDK key with a little USDC):

```bash
node scripts/buy-order.mjs <megaphone-service-id> <buyer-sdk-key> '{"service":"<listing to audit>"}'
```

## Safety rails

- **Price cap on hires** (`MEGAPHONE_MAX_HIRE_PRICE`): refuses to pay any external service above the cap,
  re-checked against the real on-chain order price before paying.
- **Fallback roster:** every role has multiple candidate providers ranked by keyword priority + real traction;
  if one fails or times out, the next is hired. If none deliver, the deliverable degrades gracefully.
- **Self-trade avoidance:** sibling agents can be excluded from hiring via `MEGAPHONE_EXCLUDE_AGENT_IDS`.

## Stack

TypeScript + Node (tsx, no build step) · `@croo-network/sdk` · Express + Server-Sent Events dashboard ·
any OpenAI-compatible LLM (Groq / local Ollama) · zero databases, zero paid APIs.

## License

MIT — see [LICENSE](LICENSE).
