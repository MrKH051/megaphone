import { emit } from '../bus.js';
import { campaignSummary } from '../humanize.js';
import { hireRole, type Receipt } from '../roster.js';
import type { PaymentRail } from '../rail/types.js';
import { runKit, type PromoKit } from './kit.js';

/**
 * SERVICE 3 — LAUNCH CAMPAIGN (~$10)
 *
 * Everything in the Promo Kit, plus a dated posting calendar and an extra,
 * independently written angle bought from a specialist copywriter on the store.
 *
 * We deliberately do NOT hire an "autopost" agent any more. The ones listed on
 * the store bill for a licence key or an integration and hand back a token —
 * nothing gets published — yet the old code set posted=true whenever the hire
 * succeeded, so the deliverable told the customer "PUBLISHED" when no tweet
 * existed. Buying written copy instead keeps the claim honest: the customer can
 * read exactly what they paid for, right in the report.
 */

/** One slot on the calendar: what to post, when, what to attach, and why then. */
export interface PostingSlot {
  day: string;
  /** Suggested window, UTC + the two timezones most dev audiences sit in. */
  time: string;
  action: string;
  attach: string;
  why: string;
}

/** Copy bought from a specialist writer on the store — shipped as-is to the buyer. */
export interface GuestContent {
  serviceName: string;
  orderId: string;
  text: string;
}

export interface Campaign {
  /** Plain-language Markdown summary — the first thing a customer reads. */
  summary: string;
  kit: PromoKit;
  execution: {
    posted: boolean;
    detail: string;
    postingPlan: PostingSlot[];
  };
  /** Present only when a copywriter was hired AND returned usable prose. */
  guestContent?: GuestContent;
  receipts: Receipt[];
  costsUsdc: number;
}

/**
 * Build the calendar against the assets we actually produced — the tweet count
 * and the banner link are real, so the instructions name them exactly.
 *
 * The time windows are conventional developer-audience norms (weekday US
 * morning is when dev timelines are busiest), not measurements of this
 * customer's followers; the report says so rather than implying we measured.
 */
export function buildPostingPlan(kit: PromoKit, posted: boolean): PostingSlot[] {
  const n = kit.thread.length;
  const last = `${n}/${n}`;

  return [
    {
      day: 'Day 1 — launch',
      time: '14:00 UTC · 09:00 ET / 15:00 CET',
      action: posted
        ? `Your thread is already live — pin tweet 1/${n} to your profile and reply to every comment for the first two hours.`
        : `Post tweet 1/${n} with the banner attached, then reply to yourself with 2/${n} through ${last}, about a minute apart. Pin tweet 1/${n} to your profile.`,
      attach: `Banner on tweet 1 only — ${kit.bannerUrl}. Replies 2/${n}-${last} stay plain text.`,
      why: 'Weekday US morning: the busiest window on developer timelines, and it leaves you awake to answer replies.',
    },
    {
      day: 'Day 2 — reach',
      time: '16:00 UTC · 11:00 ET / 17:00 CET',
      action: `Quote-tweet your own thread with one new line — the sharpest sentence from tweet ${Math.min(3, n)}/${n}, rewritten so it stands alone.`,
      attach: 'Nothing — the banner already ran on day 1, and a bare quote-tweet reads as a thought, not a repeat ad.',
      why: 'A quote-tweet re-surfaces day 1 to everyone who missed it, without spending your banner twice.',
    },
    {
      day: 'Day 3 — community',
      time: '15:00 UTC · 10:00 ET / 16:00 CET',
      action: 'Paste the README pitch (section 2) into the CROO Discord #showcase channel, and into your repo README.',
      attach: `Banner PNG as the post image — ${kit.bannerUrl}`,
      why: 'Discord readers convert better than timeline readers: they are already shopping for agents.',
    },
    {
      day: 'Day 5 — proof',
      time: '14:00 UTC · 09:00 ET / 15:00 CET',
      action: `Reply to your day 1 thread with your real order count and one thing you shipped since. Link the store listing again.`,
      attach: 'Nothing — plain text reads as an honest update, not an ad.',
      why: 'The follow-up is what converts the people who saw day 1 and did nothing. Only post numbers you actually have.',
    },
  ];
}

/**
 * Strip credentials out of anything a hired agent hands back.
 *
 * This is not hypothetical: an autopost agent returned a licence JWT in its
 * delivery text, and the old code interpolated its whole raw response into the
 * report — so a customer-facing deliverable published a live bearer token.
 * Whatever we print from a third party goes through here first.
 */
export function redactSecrets(text: string): string {
  return text
    // e.g. mirai_v1.eyJ… — consume every dot-segment so no signature tail survives.
    .replace(/\b[\w-]+_v\d+\.[A-Za-z0-9_-]{16,}(?:\.[A-Za-z0-9_-]+)*/g, '[licence key redacted]')
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}(?:\.[A-Za-z0-9_-]+)?/g, '[JWT redacted]')
    .replace(/\b(?:sk|pk|api|key|token|secret)[-_][A-Za-z0-9_-]{16,}/gi, '[credential redacted]')
    .replace(/\b0x[a-fA-F0-9]{64}\b/g, '[private key redacted]');
}

/** The longest piece of readable prose in an agent's reply, or '' if there is none. */
export function extractText(result: unknown): string {
  if (typeof result === 'string') return redactSecrets(result).trim();
  if (!result || typeof result !== 'object') return '';

  const obj = result as Record<string, unknown>;
  const candidates = [obj.content, obj.text, obj.copy, obj.output, obj.result, obj.draft, obj.post, obj.message]
    .map((v) => {
      if (typeof v === 'string') return v;
      // Some writers return the thread as an array of tweets.
      if (Array.isArray(v) && v.every((x) => typeof x === 'string')) return (v as string[]).join('\n\n');
      return '';
    })
    .map((s) => redactSecrets(s).trim())
    .filter(Boolean);

  // Prefer the richest field rather than whichever key happened to come first.
  return candidates.sort((a, b) => b.length - a.length)[0] ?? '';
}

/**
 * A licence, an invoice, or an "order received" ack is not content. Require
 * enough prose that the customer is actually getting words they can use.
 */
function isUsableCopy(text: string): boolean {
  if (text.length < 80) return false;
  if (/redacted\]/.test(text) && text.length < 200) return false;
  return /\s/.test(text.trim());
}

export async function runCampaign(rail: PaymentRail, raw: unknown, orderId?: string): Promise<Campaign> {
  const kit = await runKit(rail, raw, orderId);
  const receipts: Receipt[] = [...kit.receipts];

  // Buy an independent written angle from a specialist copywriter on the store.
  const writer = await hireRole(rail, 'content', {
    task: 'Write one short launch post (under 120 words) promoting this service. Return plain text only.',
    service: kit.audit.target.serviceName,
    description: kit.audit.rewrite.description,
    price: `$${kit.audit.target.priceUsdc} USDC`,
    link: 'https://agent.croo.network',
  });

  let guestContent: GuestContent | undefined;
  if (writer) {
    receipts.push(writer.receipt);
    const text = extractText(writer.result);
    if (isUsableCopy(text)) {
      guestContent = { serviceName: writer.receipt.serviceName, orderId: writer.receipt.orderId, text };
    } else {
      emit({
        type: 'log',
        level: 'warn',
        message: `Writer "${writer.receipt.serviceName}" returned no usable copy — omitting it from the deliverable.`,
      });
    }
  }

  // Megaphone never claims a post it cannot show. Nothing here publishes to X,
  // so the campaign always ships as a ready-to-run plan.
  const posted = false;
  const detail = guestContent
    ? `Every asset above is final and publish-ready. Megaphone does not post to your X account — it has no access to it, and no agent on the store publishes on your behalf without handing over your credentials. Follow the posting calendar below and you are done in five days.`
    : `Every asset above is final and publish-ready. Megaphone does not post to your X account — it has no access to it. Follow the posting calendar below and you are done in five days.`;

  const costsUsdc = receipts.reduce((sum, r) => sum + r.priceUsdc, 0);
  emit({
    type: 'log',
    level: 'info',
    message: `Campaign ready — posted=${posted}, ${receipts.length} agents hired for $${costsUsdc.toFixed(3)}.`,
  });

  const campaign: Campaign = {
    summary: '',
    kit,
    execution: {
      posted,
      detail,
      postingPlan: buildPostingPlan(kit, posted),
    },
    ...(guestContent ? { guestContent } : {}),
    receipts,
    costsUsdc,
  };
  campaign.summary = campaignSummary(campaign, kit.bannerUrl, orderId);
  return campaign;
}
