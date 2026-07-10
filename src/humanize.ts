import type { AuditReport } from './services/audit.js';
import type { PromoKit } from './services/kit.js';
import type { Campaign } from './services/campaign.js';
import type { Receipt } from './roster.js';
import { HEAVY, THIN, row, bar, field, wrap, money } from './report.js';

/**
 * HUMAN-READABLE DELIVERY REPORTS.
 *
 * Every deliverable leads with a clean, monospace-aligned `summary` report —
 * scannable at a glance in the CROO "View JSON" panel. Machine-readable data
 * stays on the object below it. Links (banner, tx) are full URLs so they stay
 * clickable; nothing raw is dumped inline.
 */

/** "  1. text…" where continuation lines align under the text, not the number. */
function numbered(n: number, text: string): string[] {
  const tag = `  ${n}. `.padEnd(6);
  return wrap(text, ' '.repeat(tag.length)).map((line, i) =>
    i === 0 ? tag + line.trimStart() : line,
  );
}

function hiresBlock(receipts: Receipt[]): string[] {
  if (!receipts.length) return ['No external agents were needed for this order.'];
  const total = receipts.reduce((s, r) => s + r.priceUsdc, 0);
  const lines = [`Megaphone hired ${receipts.length} agent(s) on CROO — ${money(total)}:`];
  for (const r of receipts) lines.push(row(`   ${r.serviceName.slice(0, 11)}`, `${r.role} · ${money(r.priceUsdc)}`));
  return lines;
}

/** Standalone Listing Audit. */
export function auditSummary(a: AuditReport): string {
  const lines = [
    'MEGAPHONE — LISTING AUDIT',
    HEAVY,
    row('Service', a.target.serviceName),
    row('Current score', `${a.score}/100  ${bar(a.score)}`),
    row('Your price', `${money(a.target.priceUsdc)}  (store median ${money(a.market.medianPriceUsdc)})`),
    THIN,
    'WHAT TO FIX',
  ];
  for (const issue of a.issues.slice(0, 5)) lines.push(...wrap(issue, '   - '));
  lines.push(THIN, 'SUGGESTED REWRITE', row('   Name', a.rewrite.name), ...wrap(a.rewrite.description, '   '));
  lines.push(THIN, 'PRICING', ...wrap(a.pricingAdvice, '   '), HEAVY);
  return lines.join('\n');
}

/** Promo Kit — copy + banner + fact-check. */
export function kitSummary(k: PromoKit, bannerUrl: string): string {
  const lines = [
    'MEGAPHONE — PROMO KIT',
    HEAVY,
    row('Service', k.audit.target.serviceName),
    row('Banner', bannerUrl),
    ...(k.bannerFile
      ? wrap(`Signed link (~30 min) — save promptly. Permanent key: ${k.bannerFile}`, '   ')
      : []),
    row('Fact-check', `${k.factcheck.verdict}`),
    THIN,
    'ANNOUNCEMENT THREAD',
  ];
  k.thread.forEach((t, i) => lines.push(...numbered(i + 1, t)));
  lines.push(THIN, 'README PITCH', ...wrap(k.readmePitch.replace(/\s+/g, ' ').trim(), '   '));
  lines.push(THIN, ...hiresBlock(k.receipts), HEAVY);
  return lines.join('\n');
}

/** Launch Campaign — kit + execution. */
export function campaignSummary(c: Campaign, bannerUrl: string): string {
  const lines = [
    'MEGAPHONE — LAUNCH CAMPAIGN',
    HEAVY,
    row('Service', c.kit.audit.target.serviceName),
    row('Status', c.execution.posted ? 'PUBLISHED' : 'READY-TO-RUN PLAN'),
    row('Banner', bannerUrl),
    ...(c.kit.bannerFile
      ? wrap(`Signed link (~30 min) — save promptly. Permanent key: ${c.kit.bannerFile}`, '   ')
      : []),
    THIN,
    'EXECUTION',
    ...wrap(c.execution.detail, '   '),
    THIN,
    'POSTING PLAN',
  ];
  for (const p of c.execution.postingPlan) lines.push(...field(`   ${p.day}`, p.action));
  lines.push(THIN, 'ANNOUNCEMENT THREAD');
  c.kit.thread.forEach((t, i) => lines.push(...numbered(i + 1, t)));
  lines.push(THIN, ...hiresBlock(c.receipts), HEAVY);
  return lines.join('\n');
}
