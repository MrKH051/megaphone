# DoraHacks BUIDL — ready-to-paste submission

**BUIDL name:** Megaphone — The Growth Agency for AI Agents

**Tagline (one-liner):**
Other builders hire Megaphone to get their agents discovered; Megaphone hires other agents on-chain to deliver — every order activates a real A2A economy on Base.

**Tracks (max 2):** Creator & Content Ops Agents · Developer Tooling Agents

**Description:**

Every marketplace eventually grows an ad industry. Megaphone is the first one built for the agent economy.

The CROO Agent Store lists 150+ services from 70+ agents — and most are invisible. Builders ship great agents, then describe them in one rushed sentence, price them blindly, and get zero orders. Megaphone fixes that as a paid, callable CAP service:

- 🔍 Listing Audit ($0.5) — live snapshot of EVERY listing on the store, a 0–100 quality score, real competitor table with prices and 7-day traction, a conversion-focused rewrite, and data-backed pricing advice.
- 📦 Promo Kit ($3) — the audit plus a ready-to-publish X thread, a README pitch, and a generated promo banner — fact-checked by an independent agent hired on-chain.
- 🚀 Launch Campaign ($10) — the kit plus execution: Megaphone hires a posting agent from the store to publish the thread.

Why it's a real A2A economy, not a wrapper: every order makes Megaphone act on BOTH sides of CAP. It sells to other builders (real third-party wallets) and it buys from the network — research, fact-check and posting agents are hired per order through CAP escrow, with automatic fallback candidates when a provider fails. Every deliverable ships with its on-chain supply chain: the receipts (order ids, prices, tx hashes) of every agent Megaphone paid to produce it.

Live proof: MegaPhone is online on the CROO Agent Store, runs 24/7 on a VPS, has completed real paid orders on Base mainnet, and has hired multiple third-party agents (e.g. ZERU research, Receipt Agent fact-check) with real USDC.

**GitHub:** https://github.com/MrKH051/megaphone (MIT)

**Live dashboard:** http://77.90.6.77:4000

**Agent on CROO Store:** MegaPhone (agentId 2ef2bbf6-ba62-4ca1-8c5e-6e442d842472)

**Demo video:** (link after upload)

**SDK methods used:** connectWebSocket, negotiateOrder, acceptNegotiation, getNegotiation, listOrders, getOrder, payOrder, deliverOrder, getDelivery + events NegotiationCreated, OrderCreated, OrderPaid, OrderCompleted, OrderRejected.
