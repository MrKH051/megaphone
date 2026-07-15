import { emit } from '../bus.js';
import { llmJson } from '../llm.js';
import { makeBanner } from '../banner.js';
import { hostBanner } from '../banners.js';
import { kitSummary } from '../humanize.js';
import { hireRole, type Receipt } from '../roster.js';
import type { PaymentRail } from '../rail/types.js';
import { runAudit, type AuditReport } from './audit.js';

/**
 * SERVICE 2 — PROMO KIT (~$3)
 *
 * Everything in the Audit, plus a ready-to-publish launch pack:
 *   • X/Twitter announcement thread
 *   • README "pitch" section
 *   • promo banner (SVG, 1200x630)
 *
 * While fulfilling, Megaphone HIRES other CROO agents on-chain:
 *   • a research agent — live market context for sharper copy
 *   • a fact-check agent — verifies the promo copy doesn't overclaim
 * Every hire ships as a receipt inside the deliverable.
 */

export interface PromoKit {
  /** Plain-language Markdown summary — the first thing a customer reads. */
  summary: string;
  audit: AuditReport;
  thread: string[];
  readmePitch: string;
  /** Clickable link to the generated banner image (not raw SVG). In croo
   *  mode this is a CROO-storage PNG download link, not a dashboard URL. */
  bannerUrl: string;
  /** Copy served by Megaphone's own dashboard (kept for the local UI). */
  bannerLocalUrl: string;
  /** Permanent CROO storage key — resolvable via the SDK getDownloadURL. */
  bannerFile?: string;
  /** Buyer guidance, present only when the banner is CROO-hosted. */
  bannerNote?: string;
  factcheck: { verdict: string; notes: string };
  receipts: Receipt[]; // the on-chain supply chain of this deliverable
  costsUsdc: number;
}

interface LlmCopy {
  thread: string[];
  readmePitch: string;
  bannerHeadline: string;
}

export async function runKit(rail: PaymentRail, raw: unknown, orderId?: string): Promise<PromoKit> {
  const receipts: Receipt[] = [];

  // 1) Ground everything in the audit (live store data). Same order id: the
  //    nested audit is part of THIS order, not one the customer bought separately.
  const audit = await runAudit(raw, orderId);

  // 2) Hire a research agent for market context (best effort — kit still works without).
  const research = await hireRole(rail, 'research', {
    query: `What makes buyers pick one AI-agent service over another on an agent marketplace? Context: the service is "${audit.rewrite.name}" — ${audit.rewrite.description.slice(0, 160)}`,
  });
  if (research) receipts.push(research.receipt);
  const context = research ? JSON.stringify(research.result).slice(0, 900) : '(no external context available)';

  // 3) Write the launch copy.
  const copy = await writeCopy(audit, context);

  // 4) Hire a fact-check agent to vet the copy against the real listing.
  const factcheckHire = await hireRole(rail, 'factcheck', {
    text: `Claims to check:\n${copy.thread.join('\n')}\n\nGround truth listing:\nName: ${audit.target.serviceName}\nDescription: ${audit.target.currentDescription}\nPrice: $${audit.target.priceUsdc} USDC`,
  });
  if (factcheckHire) receipts.push(factcheckHire.receipt);
  const factcheck = normalizeFactcheck(factcheckHire?.result);

  // 5) Generate the banner in-house (zero cost) and host it as a link.
  const bannerSvg = makeBanner({
    agentName: audit.target.agentName,
    headline: copy.bannerHeadline,
    price: `$${audit.target.priceUsdc} USDC`,
    stat:
      audit.target.completionRate > 0
        ? `${audit.target.completionRate}% completion rate`
        : 'live on CROO Agent Store',
  });
  const banner = await hostBanner(bannerSvg, rail.uploader);
  const bannerUrl = banner.downloadUrl ?? banner.localUrl;

  const costsUsdc = receipts.reduce((sum, r) => sum + r.priceUsdc, 0);
  emit({
    type: 'log',
    level: 'info',
    message: `Promo kit ready — ${receipts.length} agents hired for $${costsUsdc.toFixed(3)}.`,
  });

  const kit: PromoKit = {
    summary: '',
    audit,
    thread: copy.thread,
    readmePitch: copy.readmePitch,
    bannerUrl,
    bannerLocalUrl: banner.localUrl,
    ...(banner.fileKey ? { bannerFile: banner.fileKey } : {}),
    ...(banner.downloadUrl || banner.fileKey
      ? {
          bannerNote:
            'Save the banner promptly — the download link is signed (~30 min). The "bannerFile" key is permanent and resolvable via the CROO SDK getDownloadURL.',
        }
      : {}),
    factcheck,
    receipts,
    costsUsdc,
  };
  kit.summary = kitSummary(kit, bannerUrl, orderId);
  return kit;
}

async function writeCopy(audit: AuditReport, marketContext: string): Promise<LlmCopy> {
  // Five slots, mirroring the five the prompt asks for — so a short or empty
  // model reply still ships as a complete, publishable thread.
  const fallback: LlmCopy = {
    thread: [
      `Most agents on the CROO store never get found. ${audit.target.agentName} built ${audit.rewrite.name} for the people who do go looking.`,
      audit.rewrite.description,
      `$${audit.target.priceUsdc} USDC per order${audit.target.completionRate > 0 ? ` · ${audit.target.completionRate}% completion rate` : ''}${audit.target.orders7d > 0 ? ` · ${audit.target.orders7d} orders in the last 7 days` : ''}.`,
      `Built for anyone who needs ${audit.rewrite.name.toLowerCase()} without wiring it up themselves — one call, one result.`,
      `Try it now on the CROO Agent Store → https://agent.croo.network`,
    ],
    readmePitch: `## Why use this\n\n**${audit.rewrite.name}** — ${audit.rewrite.description}\n\n- Runs on the CROO Agent Store: no setup, no keys, one call.\n- $${audit.target.priceUsdc} USDC per order${audit.target.completionRate > 0 ? `, ${audit.target.completionRate}% completion rate` : ''}.\n\n**Try it:** [${audit.rewrite.name} on the CROO Agent Store](https://agent.croo.network)`,
    bannerHeadline: audit.rewrite.name,
  };

  const res = await llmJson<Partial<LlmCopy>>(
    [
      'You are a senior launch copywriter for developer tools and AI agents.',
      'Your copy ships to production exactly as written: the customer copies it out of a report and posts it.',
      'So it must be FINISHED. Never write a placeholder, a [bracketed blank], "insert X here", "your agent", or "link in bio" — every fact you need is in the data below; if it is missing, write around it.',
      'Ground every claim in that data. No invented metrics, no "best", "revolutionary", "game-changing", no emoji spam, no "excited to announce".',
      'Return JSON with these keys:',
      'thread — an array of EXACTLY 5 tweets, each <=270 chars, each a complete standalone sentence, written to be posted in order:',
      '  [0] hook: a concrete problem the reader already recognizes. No greeting, no product name in the first 6 words.',
      '  [1] what it does, as one literal example — real input, real output.',
      '  [2] the proof: price, completion rate, orders, or the competitor gap — whichever the data actually supports.',
      '  [3] who should reach for it, and when.',
      '  [4] the call to action, ending with the link https://agent.croo.network',
      'readmePitch — a Markdown "## Why use this" section, 4-8 lines, with real newline characters, ready to paste into a README or a Discord #showcase post. Open with one bolded sentence, then a short bullet list of concrete capabilities, then a closing line with the price and a link to https://agent.croo.network',
      'bannerHeadline — <=60 chars, the single crispest benefit, no trailing punctuation.',
    ].join(' '),
    [
      `SERVICE: ${audit.rewrite.name} by ${audit.target.agentName}`,
      `WHAT IT DOES: ${audit.rewrite.description}`,
      `PRICE: $${audit.target.priceUsdc} USDC · completion rate ${audit.target.completionRate}%`,
      `EDGE OVER COMPETITORS: ${audit.competitors.map((c) => `${c.serviceName} (${c.note})`).join('; ') || 'no close competitor'}`,
      `MARKET CONTEXT FROM HIRED RESEARCH AGENT: ${marketContext}`,
    ].join('\n'),
    fallback,
    { temperature: 0.6, maxTokens: 1100 },
  );

  // Sanitize: every field must be usable no matter what the model returned.
  return {
    thread: normalizeThread(res.thread, fallback.thread),
    readmePitch: normalizePitch(res.readmePitch, fallback.readmePitch),
    bannerHeadline:
      typeof res.bannerHeadline === 'string' && res.bannerHeadline.trim()
        ? res.bannerHeadline.trim().slice(0, 70)
        : fallback.bannerHeadline,
  };
}

/**
 * The pitch is delivered as a Markdown section the customer pastes straight
 * into a README or Discord. Models routinely ignore that and return one flat
 * paragraph, which is not a section — so strip any code fence they wrapped it
 * in and guarantee the heading the deliverable promises.
 */
function normalizePitch(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string' || !raw.trim()) return fallback;

  const md = raw
    .trim()
    .replace(/^```[a-z]*\n?/i, '')
    .replace(/\n?```$/, '')
    .trim();
  if (!md) return fallback;

  return /^#{1,3}\s/m.test(md) ? md : `## Why use this\n\n${md}`;
}

/**
 * The thread ships verbatim into the deliverable, so it must be exactly five
 * postable tweets: single-line, inside X's 280-char limit, and never short of
 * the five the report promises. A model that returns fewer gets topped up from
 * the fallback slots, inserted BEFORE the model's own call-to-action so the
 * thread still ends on the CTA.
 */
function normalizeThread(raw: unknown, fallback: string[]): string[] {
  const clean = (Array.isArray(raw) ? raw : [])
    .map((t) => String(t).replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map((t) => (t.length > 280 ? `${t.slice(0, 279).trimEnd()}…` : t));

  if (!clean.length) return fallback;

  const thread = clean.slice(0, 5);
  while (thread.length < 5) {
    thread.splice(thread.length - 1, 0, fallback[thread.length - 1] as string);
  }
  return thread;
}

function normalizeFactcheck(result: unknown): { verdict: string; notes: string } {
  if (!result) return { verdict: 'skipped', notes: 'No fact-check agent was available; copy is grounded in listing data only.' };
  if (typeof result === 'string') return { verdict: 'reviewed', notes: result.slice(0, 600) };
  const obj = result as Record<string, unknown>;

  // Prefer human-readable fields; never dump raw JSON into the deliverable.
  const verdict = String(obj.verdict ?? obj.result ?? obj.mode ?? 'reviewed');
  const readable = [obj.notes, obj.summary, obj.report, obj.caveats, obj.reason]
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter(Boolean)
    .join(' — ');
  const confidence = obj.confidence != null ? ` (confidence: ${String(obj.confidence)})` : '';
  return {
    verdict,
    notes: (readable || 'External verifier returned a structured report; see receipts for the order id.') .slice(0, 600) + confidence,
  };
}
