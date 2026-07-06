import { emit } from '../bus.js';
import { llmJson } from '../llm.js';
import { makeBanner } from '../banner.js';
import { saveBanner } from '../banners.js';
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
  /** Clickable link to the generated banner image (not raw SVG). */
  bannerUrl: string;
  factcheck: { verdict: string; notes: string };
  receipts: Receipt[]; // the on-chain supply chain of this deliverable
  costsUsdc: number;
}

interface LlmCopy {
  thread: string[];
  readmePitch: string;
  bannerHeadline: string;
}

export async function runKit(rail: PaymentRail, raw: unknown): Promise<PromoKit> {
  const receipts: Receipt[] = [];

  // 1) Ground everything in the audit (live store data).
  const audit = await runAudit(raw);

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
  const bannerUrl = saveBanner(bannerSvg);

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
    factcheck,
    receipts,
    costsUsdc,
  };
  kit.summary = kitSummary(kit, bannerUrl);
  return kit;
}

async function writeCopy(audit: AuditReport, marketContext: string): Promise<LlmCopy> {
  const fallback: LlmCopy = {
    thread: [
      `Meet ${audit.target.agentName} on the CROO Agent Store: ${audit.rewrite.name} — $${audit.target.priceUsdc} USDC per call.`,
      audit.rewrite.description,
      `Try it now on the CROO Agent Store → https://agent.croo.network`,
    ],
    readmePitch: `## ${audit.rewrite.name}\n\n${audit.rewrite.description}\n\n**Price:** $${audit.target.priceUsdc} USDC per order · listed on the [CROO Agent Store](https://agent.croo.network).`,
    bannerHeadline: audit.rewrite.name,
  };

  const res = await llmJson<Partial<LlmCopy>>(
    [
      'You are a launch copywriter for developer tools and AI agents.',
      'Write ONLY claims supported by the listing data provided. No hype words like "best" or "revolutionary".',
      'Return JSON with keys: thread (array of 3-5 tweets, each <=270 chars, first one is the hook,',
      'last one is a call-to-action linking to https://agent.croo.network),',
      'readmePitch (markdown string: a "## Why use this" section for the project README, 4-8 lines),',
      'bannerHeadline (string <=60 chars: the single crispest benefit).',
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
    thread:
      Array.isArray(res.thread) && res.thread.length
        ? res.thread.map((t) => String(t).slice(0, 280)).slice(0, 5)
        : fallback.thread,
    readmePitch:
      typeof res.readmePitch === 'string' && res.readmePitch.trim()
        ? res.readmePitch.trim()
        : fallback.readmePitch,
    bannerHeadline:
      typeof res.bannerHeadline === 'string' && res.bannerHeadline.trim()
        ? res.bannerHeadline.trim().slice(0, 70)
        : fallback.bannerHeadline,
  };
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
