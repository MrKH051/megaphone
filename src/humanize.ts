import type { AuditReport } from './services/audit.js';
import type { PromoKit } from './services/kit.js';
import type { Campaign } from './services/campaign.js';
import type { Receipt } from './roster.js';

/**
 * HUMAN-READABLE DELIVERY SUMMARIES.
 *
 * Every deliverable leads with a plain-language `summary` (Markdown) so a
 * customer who opens the raw order JSON immediately understands what they got
 * — no wading through nested fields. Machine-readable data stays below it for
 * agent consumers. Links are always clickable; nothing raw is dumped inline.
 */

const STORE = 'https://agent.croo.network';
const tx = (h?: string) => (h ? `[view on Basescan](https://basescan.org/tx/${h})` : '');

function hiresLine(receipts: Receipt[]): string {
  if (!receipts.length) return '_No external agents were needed for this order._';
  const rows = receipts
    .map((r) => `- **${r.serviceName}** (${r.role}) — $${r.priceUsdc.toFixed(3)} ${tx(r.txHash)}`.trim())
    .join('\n');
  const total = receipts.reduce((s, r) => s + r.priceUsdc, 0);
  return `To build this, Megaphone hired **${receipts.length}** other agent${receipts.length > 1 ? 's' : ''} on CROO for **$${total.toFixed(3)}**:\n${rows}`;
}

/** Standalone Listing Audit. */
export function auditSummary(a: AuditReport): string {
  const issues = a.issues.slice(0, 5).map((i) => `- ${i}`).join('\n');
  return [
    `# 📣 Listing Audit — ${a.target.serviceName}`,
    '',
    `**Score: ${a.score}/100** for your current listing on the [CROO Agent Store](${STORE}).`,
    '',
    '## What to fix',
    issues || '- No major issues found.',
    '',
    '## Suggested rewrite',
    `**Name:** ${a.rewrite.name}`,
    '',
    a.rewrite.description,
    '',
    '## Pricing',
    a.pricingAdvice,
    '',
    `_You're priced at $${a.target.priceUsdc} vs a store median of $${a.market.medianPriceUsdc}._`,
  ].join('\n');
}

/** Promo Kit — copy + banner + fact-check. */
export function kitSummary(k: PromoKit, bannerUrl: string): string {
  const thread = k.thread.map((t, i) => `${i + 1}. ${t}`).join('\n');
  return [
    `# 📣 Promo Kit — ${k.audit.target.serviceName}`,
    '',
    'Your ready-to-publish launch pack. Everything below is final and publish-ready.',
    '',
    '## 🖼 Banner',
    `**[Open your banner image →](${bannerUrl})**  _(1200×630, ready for X / OpenGraph)_`,
    '',
    '## 🧵 Announcement thread',
    thread,
    '',
    '## 📄 README pitch',
    k.readmePitch,
    '',
    '## ✅ Fact-check',
    `**${k.factcheck.verdict}** — ${k.factcheck.notes}`,
    '',
    '---',
    hiresLine(k.receipts),
  ].join('\n');
}

/** Launch Campaign — kit + execution. */
export function campaignSummary(c: Campaign, bannerUrl: string): string {
  const plan = c.execution.postingPlan.map((p) => `- **${p.day}:** ${p.action}`).join('\n');
  const status = c.execution.posted
    ? `✅ **Published.** ${c.execution.detail}`
    : `📋 **Ready-to-run plan** (no posting agent was available, so nothing was posted for you):`;
  return [
    `# 📣 Launch Campaign — ${c.kit.audit.target.serviceName}`,
    '',
    '## 🚀 Execution',
    status,
    '',
    plan,
    '',
    '## 🖼 Banner',
    `**[Open your banner image →](${c.kit.bannerUrl})**`,
    '',
    '## 🧵 Announcement thread',
    c.kit.thread.map((t, i) => `${i + 1}. ${t}`).join('\n'),
    '',
    '## 📄 README pitch',
    c.kit.readmePitch,
    '',
    '---',
    hiresLine(c.receipts),
  ].join('\n');
}
