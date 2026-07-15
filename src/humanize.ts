import type { AuditReport } from './services/audit.js';
import type { PromoKit } from './services/kit.js';
import type { Campaign } from './services/campaign.js';
import type { Receipt } from './roster.js';
import { HEAVY, THIN, row, bar, field, wrap, verbatim, section, money } from './report.js';

/**
 * HUMAN-READABLE DELIVERY REPORTS.
 *
 * The `summary` built here IS the CROO delivery — formatDeliverable() ships it
 * verbatim as deliverableText and appends nothing. Machine consumers read the
 * result object from /api/deliverable instead.
 *
 * The report is the PRODUCT, not a receipt for the product. A customer must be
 * able to run the whole launch from this text alone: the finished tweets, the
 * finished README pitch, and the schedule are all printed inline, and the
 * banner ships as a clickable link. Nothing is a placeholder; nothing sends
 * the customer somewhere else to find their own assets.
 *
 * Copy blocks go through verbatim() — never wrap(). Re-flowing a tweet to the
 * report width bakes line breaks into text the customer is about to paste.
 */

/**
 * Each tweet's job in the AIDA arc, so the customer can see why the order
 * matters. First is always Attention, last is always the Action; whatever sits
 * between them walks Interest -> Desire -> Proof.
 */
const AIDA_MIDDLE = ['Interest', 'Desire', 'Proof'];

function tweetRole(i: number, total: number): string {
  if (i === 0) return 'Attention / Hook';
  if (i === total - 1) return 'Call to Action';
  return AIDA_MIDDLE[i - 1] ?? 'Interest';
}

/**
 * The thread, printed ready to copy: one labelled block per tweet, each on a
 * single unbroken line, with a live character count against X's 280 limit.
 *
 * The banner URL rides directly under tweet 1 — that is the tweet it gets
 * attached to, and a customer copying top to bottom should not have to go
 * hunting for it in another section.
 */
function threadBlock(thread: string[], bannerUrl: string): string[] {
  const out: string[] = [];
  thread.forEach((tweet, i) => {
    if (i > 0) out.push('');
    const pin = i === 0 ? ' (pin this)' : '';
    out.push(`TWEET ${i + 1}/${thread.length}${pin}  ·  [${tweetRole(i, thread.length)}]  ·  ${tweet.length}/280 chars`);
    out.push(...verbatim(tweet));
    if (i === 0) {
      out.push('');
      out.push('   Campaign banner image — attach to this tweet:');
      out.push(`   ${bannerUrl}`);
    }
  });
  return out;
}

/** The README/Discord pitch, printed as real Markdown with its newlines intact. */
function readmeBlock(pitch: string): string[] {
  return verbatim(pitch.trim());
}

/**
 * Copy bought from another agent, printed as they wrote it and attributed to
 * them by name and order id — so the customer can tell our words from theirs
 * and check what their money bought.
 */
function guestBlock(guest: Campaign['guestContent'] & object): string[] {
  return [
    ...wrap(`Megaphone paid ${guest.serviceName} (order ${guest.orderId}) to write an independent angle on your launch. Their copy, unedited:`),
    '',
    ...verbatim(guest.text.trim()),
  ];
}

/** Banner link + the guidance that goes with a signed (expiring) URL. */
function assetBlock(bannerUrl: string, bannerFile?: string): string[] {
  // CROO storage rejects SVG, so a hosted banner is PNG; the local dashboard
  // copy stays SVG. Name whichever one the customer is actually being handed.
  const kind = /\.svg(\?|$)/i.test(bannerUrl) ? 'SVG' : 'PNG';
  const lines = [row('Banner', bannerUrl), row('', `1200x630 ${kind} — X card, README header, Discord post`)];
  if (bannerFile) {
    lines.push(
      ...wrap('Download it now — the link above is signed and expires in ~30 min.', '   '),
      ...wrap(`Permanent key (resolve any time via the CROO SDK getDownloadURL): ${bannerFile}`, '   '),
    );
  }
  return lines;
}

/**
 * QUALITY ASSURANCE & SUPPLY CHAIN VERIFICATION — the on-chain provenance of
 * this deliverable: who was hired, what they were paid, and the order/tx ids
 * that let the customer verify every line of it independently.
 */
function supplyChainBlock(receipts: Receipt[], factcheck?: { verdict: string; notes: string }): string[] {
  const lines: string[] = [];

  if (factcheck) {
    lines.push(row('Fact-check', factcheck.verdict.toUpperCase()));
    lines.push(...wrap(factcheck.notes, '   '));
    lines.push('');
  }

  if (!receipts.length) {
    lines.push('No external agents were needed for this order — every asset above');
    lines.push('was produced in-house by Megaphone.');
    return lines;
  }

  const total = receipts.reduce((sum, r) => sum + r.priceUsdc, 0);
  const plural = receipts.length === 1 ? 'agent' : 'agents';
  lines.push(...wrap(`Megaphone hired ${receipts.length} ${plural} on the CROO store to build this deliverable, paying ${money(total)} of its own revenue on-chain:`));
  lines.push('');
  // The service name gets its own line: names run well past the label column,
  // and padEnd() silently stops padding rather than breaking the line for us.
  receipts.forEach((r, i) => {
    if (i > 0) lines.push('');
    lines.push(`   ${i + 1}. ${r.serviceName}`);
    lines.push(row('      hired as', `${r.role} · ${money(r.priceUsdc)}`));
    lines.push(row('      order', r.orderId));
    if (r.txHash) lines.push(row('      tx', r.txHash));
  });
  lines.push('');
  lines.push(...wrap('Every id above is verifiable on-chain: this report is auditable end to end.', '   '));
  return lines;
}

/** Standalone Listing Audit. */
export function auditSummary(a: AuditReport, orderId?: string): string {
  const lines = [
    'MEGAPHONE — LISTING AUDIT DELIVERY REPORT',
    HEAVY,
    row('Service', a.target.serviceName),
    ...(orderId ? [row('Order ID', orderId)] : []),
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

/** Who vetted the copy — named, so the claim is checkable rather than a boast. */
function vettedLine(factcheck: { verdict: string; notes: string }, vettedBy?: string): string[] {
  if (!vettedBy) return [];
  return wrap(
    `Every claim below was drafted by Megaphone and checked against your live listing by a dedicated fact-check agent (${vettedBy}) — verdict: ${factcheck.verdict}.`,
  );
}

/** The fact-check agent's display name, if one was actually hired. */
function factcheckerName(receipts: Receipt[]): string | undefined {
  return receipts.find((r) => r.role === 'factcheck')?.serviceName;
}

/** Promo Kit — the complete copy pack, printed inline and ready to publish. */
export function kitSummary(k: PromoKit, bannerUrl: string, orderId?: string): string {
  const lines = [
    'MEGAPHONE — PROMO KIT DELIVERY REPORT',
    HEAVY,
    row('Service', k.audit.target.serviceName),
    row('Agent', k.audit.target.agentName),
    ...(orderId ? [row('Order ID', orderId)] : []),
    row('In this pack', `${k.thread.length} tweets · 1 README pitch · 1 banner`),
    HEAVY,
    '',
    'Everything below is finished copy. No placeholders, nothing to fill in —',
    'copy each block straight out of this report and publish it.',
    ...(factcheckerName(k.receipts) ? [''] : []),
    ...vettedLine(k.factcheck, factcheckerName(k.receipts)),
  ];

  lines.push(...section(1, 'X / Twitter thread', 'AIDA framework — post in order'));
  lines.push(...threadBlock(k.thread, bannerUrl));

  lines.push(...section(2, 'README / Discord pitch', 'paste as Markdown'));
  lines.push(...readmeBlock(k.readmePitch));

  lines.push(...section(3, 'Banner'));
  lines.push(...assetBlock(bannerUrl, k.bannerFile));

  lines.push(...section(4, 'Quality assurance & supply chain verification'));
  lines.push(...supplyChainBlock(k.receipts, k.factcheck));

  lines.push('', HEAVY);
  return lines.join('\n');
}

/**
 * The day-by-day calendar: what to post, when, and what to attach — one block
 * per slot so the customer never has to decide anything.
 */
function calendarBlock(plan: Campaign['execution']['postingPlan']): string[] {
  const lines: string[] = [];
  plan.forEach((slot, i) => {
    if (i > 0) lines.push('');
    lines.push(`${slot.day.toUpperCase()}  ·  ${slot.time}`);
    lines.push(...field('   Post', slot.action));
    lines.push(...field('   Attach', slot.attach));
    lines.push(...field('   Why', slot.why));
  });
  lines.push('');
  lines.push(
    ...wrap(
      'Times are in UTC and follow weekday developer-traffic norms, not measured data for your audience — shift them to wherever your buyers actually are.',
      '   ',
    ),
  );
  return lines;
}

/** Launch Campaign — the kit, the calendar, and the execution record. */
export function campaignSummary(c: Campaign, bannerUrl: string, orderId?: string): string {
  const k = c.kit;
  const lines = [
    'MEGAPHONE — LAUNCH CAMPAIGN DELIVERY REPORT',
    HEAVY,
    row('Service', k.audit.target.serviceName),
    row('Agent', k.audit.target.agentName),
    ...(orderId ? [row('Order ID', orderId)] : []),
    row('Status', c.execution.posted ? 'PUBLISHED — thread is live' : 'READY TO RUN — every asset is final'),
    row('In this pack', `${k.thread.length} tweets · 1 README pitch · 1 banner · ${c.execution.postingPlan.length}-slot calendar`),
    HEAVY,
    '',
    'Everything below is finished copy. No placeholders, nothing to fill in —',
    'copy each block straight out of this report and publish it.',
    ...(factcheckerName(c.receipts) ? [''] : []),
    ...vettedLine(k.factcheck, factcheckerName(c.receipts)),
  ];

  lines.push(...section(1, 'X / Twitter thread', 'AIDA framework — post in order'));
  lines.push(...threadBlock(k.thread, bannerUrl));

  lines.push(...section(2, 'README / Discord pitch', 'paste as Markdown'));
  lines.push(...readmeBlock(k.readmePitch));

  let n = 2;
  if (c.guestContent) {
    lines.push(...section(++n, 'Bonus post', `written by ${c.guestContent.serviceName}`));
    lines.push(...guestBlock(c.guestContent));
  }

  lines.push(...section(++n, 'Posting calendar', 'what to post, when, with what'));
  lines.push(...calendarBlock(c.execution.postingPlan));

  lines.push(...section(++n, 'Banner'));
  lines.push(...assetBlock(bannerUrl, k.bannerFile));

  lines.push(...section(++n, 'How this ships'));
  lines.push(...wrap(c.execution.detail, '   '));

  lines.push(...section(++n, 'Quality assurance & supply chain verification'));
  lines.push(...supplyChainBlock(c.receipts, k.factcheck));

  lines.push('', HEAVY);
  return lines.join('\n');
}
