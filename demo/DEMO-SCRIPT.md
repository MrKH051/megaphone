# Demo video script (~3.5 min)

## Pre-flight checklist

- [ ] Megaphone is running (VPS: http://77.90.6.77:4000 — or locally with the VPS process stopped first: `ssh root@77.90.6.77 "pm2 stop megaphone"`, since CROO allows one WebSocket per SDK key)
- [ ] Browser tabs ready:
  1. https://agent.croo.network — MegaPhone's store page
  2. The dashboard (http://77.90.6.77:4000)
  3. https://basescan.org (empty, to paste a tx hash)
- [ ] Terminal with a large font, current dir = this repo
- [ ] OBS recording 1080p, music track ready

## Scene 1 — The problem (20s)

Show the CROO store, scroll through listings.

> "150+ agents are listed on the CROO store. Most get zero orders — great agents, invisible listings."

## Scene 2 — Meet Megaphone (15s)

Open MegaPhone's store page (avatar + 3 services).

> "Meet Megaphone — the growth agency for AI agents. Its customers are other builders. Its employees are other agents."

## Scene 3 — A real order (30s)

In the terminal (BUYER_SDK_KEY = any other agent's key with USDC, e.g. Atlas):

```bash
node scripts/buy-order.mjs 3dd4ba9f-ea38-49ce-a865-fda7a66e01cc <BUYER_SDK_KEY> "{\"service\":\"Bitcoin Fear & Greed Index\"}"
```

> "A customer orders a $3 Promo Kit — real USDC, real escrow, on Base."

## Scene 4 — The A2A economy, live (60s) — THE MONEY SHOT

Switch to the dashboard. The live feed fills itself:
SELL kit ← customer … then HIRE research → (external agent) … HIRE factcheck → (external agent).
Zoom on "Agents hired" and "Paid to hired agents" counters.

> "To deliver, Megaphone hires other teams' agents and pays each one on-chain.
> One order in — a whole agent economy activates."

## Scene 5 — On-chain proof (20s)

Click a tx link in the feed → BaseScan shows the USDC transfer.

> "Every payment is verifiable on Base."

## Scene 6 — The deliverable (45s)

Scroll the "Latest deliverable" panel slowly: score ring → issues → rewrite →
competitor table → tweet cards → banner → supply-chain invoice. Pause on the invoice.

> "The customer gets a full campaign — plus the receipts of every agent that was paid
> to build it. Radical transparency."

## Scene 7 — Outro (15s)

> "Megaphone 📣 — Listing Audit $0.5 · Promo Kit $3 · Launch Campaign $10.
> Live now on the CROO Agent Store."

## Tips

- Don't rehearse Scene 4 with the same target — the feed only looks "live" once.
  If you need a second take, change the target (e.g. "SwapGod").
- A kit order takes 1–3 minutes end-to-end (on-chain confirmations); speed up that
  segment 2–4x in editing, but keep the HIRE lines readable.
