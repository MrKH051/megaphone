# Megaphone 📣 — the growth agency for AI agents

> Every marketplace eventually grows an ad industry. **Megaphone is the first one built for the agent economy** —
> an AI agent on the [CROO Agent Store](https://agent.croo.network) whose *customers are other agents' builders*,
> and whose *employees are other agents*, hired and paid per order through real on-chain escrow (USDC on Base).
>
> Built for the **CROO Agent Hackathon** on the CROO Agent Protocol (CAP).

## The problem

The CROO Agent Store already lists **hundreds of services from dozens of agents** — and most of them are invisible.
Builders ship great agents, then describe them in one rushed sentence, price them blindly, and get zero orders.
On a marketplace where buyers (humans *and* buyer-agents) decide in seconds, a weak listing is a dead agent.

Megaphone fixes that, as a paid, callable CAP service.

## What it sells

| Service | Price | What the customer gets |
|---|---|---|
| 🔍 **Listing Audit** | ~$0.5 | Listing quality score, concrete issues, a full rewrite (name + description), pricing advice against a live competitor table |
| 📦 **Promo Kit** | ~$3 | Everything in the Audit **plus** a 5-tweet AIDA announcement thread, a copy-paste README pitch section, and a generated 1200×630 promo banner — fact-checked by a hired verifier agent |
| 🚀 **Launch Campaign** | ~$5 | Everything in the Kit **plus** a 5-day posting calendar (what to post, when, what to attach) and an extra launch post written by a hired copywriter agent. Never asks for your X credentials — every asset ships finished in the report |

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
               research agent   fact-check agent   copywriter agent   │
               (market context) (vets the copy)   (extra launch post) │
                     └──────────────┴────────────────┴────────────────┘
                                     │
                                     ▼
                     deliverable + on-chain receipts:
                     exactly which agents were hired and what each was paid
```

- **Buys from the network:** each fulfilment hires external agents (research → fact-check → copywriting), each
  with fallback candidates auto-discovered from the live store, ranked by agent track record, each paid through
  CAP escrow. Megaphone never posts on your behalf — that would need your account credentials — so it delivers
  finished, publish-ready copy instead of a claim it can't back up.
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
git clone https://github.com/MrKH051/megaphone.git
cd megaphone
npm install
npm start          # runs fully offline (simulated escrow + demo brain)
```



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
PUBLIC_URL=http://<host>:4000     # so banner links in deliverables resolve for buyers
```

Optional hiring policy (sensible defaults; Mirai is blocked out of the box):

```ini
MEGAPHONE_BLOCKED_AGENTS=mirai            # never-hire, by service or agent name
MEGAPHONE_FAILURE_COOLDOWN_DAYS=30        # how long a failed hire stays benched
MEGAPHONE_CONTENT_SERVICE_ID=...          # pin a specific copywriter (else auto-discovered)
```

Test purchase from a second agent (any CROO SDK key with a little USDC):

```bash
node scripts/buy-order.mjs <megaphone-service-id> <buyer-sdk-key> '{"service":"<listing to audit>"}'
```

## Safety rails

- **Price cap on hires** (`MEGAPHONE_MAX_HIRE_PRICE`): refuses to pay any external service above the cap,
  re-checked against the real on-chain order price before paying.
- **Quality-ranked roster:** every role has multiple candidate providers scored on agent quality (completion
  rate, finished orders, listing count, account age) blended with relevance — not keyword match alone. If one
  fails or times out, the next is hired; if none deliver, the deliverable degrades gracefully.
- **Failure memory:** a service that fails to deliver is benched on disk for 30 days
  (`MEGAPHONE_FAILURE_COOLDOWN_DAYS`), so a restart doesn't walk back into the same bad hire.
- **Block list** (`MEGAPHONE_BLOCKED_AGENTS`): never-hire agents matched by service or agent name; a pin can't
  override it. Ships blocking agents whose "autopost" service sells a licence key instead of publishing.
- **Credential redaction:** anything a hired agent returns is stripped of licence keys, JWTs, and private keys
  before it can reach a customer-facing deliverable.
- **Self-trade avoidance:** sibling agents can be excluded from hiring via `MEGAPHONE_EXCLUDE_AGENT_IDS`.

## Stack

TypeScript + Node (tsx, no build step) · `@croo-network/sdk` · Express + Server-Sent Events dashboard ·
any OpenAI-compatible LLM (Groq / local Ollama) · zero databases, zero paid APIs.

## License

MIT — see [LICENSE](LICENSE).
