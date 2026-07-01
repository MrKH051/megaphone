import { emit } from '../bus.js';
import { hireRole, type Receipt } from '../roster.js';
import type { PaymentRail } from '../rail/types.js';
import { runKit, type PromoKit } from './kit.js';

/**
 * SERVICE 3 — LAUNCH CAMPAIGN (~$10)
 *
 * Everything in the Promo Kit, plus execution: Megaphone hires a posting
 * agent from the store (e.g. an X autopost service) to actually publish the
 * thread. If no posting agent is available, it degrades gracefully to a
 * ready-to-run posting plan — the customer still gets full value.
 */

export interface Campaign {
  kit: PromoKit;
  execution: {
    posted: boolean;
    detail: string;
    postingPlan: Array<{ day: string; action: string }>;
  };
  receipts: Receipt[];
  costsUsdc: number;
}

export async function runCampaign(rail: PaymentRail, raw: unknown): Promise<Campaign> {
  const kit = await runKit(rail, raw);
  const receipts: Receipt[] = [...kit.receipts];

  // Try to hire a posting agent to publish the thread for real.
  const posting = await hireRole(rail, 'post', {
    task: 'Publish this announcement thread on X, one tweet per item, in order.',
    thread: kit.thread,
  });

  let posted = false;
  let detail: string;
  if (posting) {
    receipts.push(posting.receipt);
    posted = true;
    detail = `Thread handed to "${posting.receipt.serviceName}" (order ${posting.receipt.orderId}) for publication. Raw response: ${JSON.stringify(posting.result).slice(0, 400)}`;
  } else {
    detail =
      'No posting agent was available on the store right now, so the campaign ships as a ready-to-run plan below — every asset is final and publish-ready.';
  }

  const costsUsdc = receipts.reduce((sum, r) => sum + r.priceUsdc, 0);
  emit({
    type: 'log',
    level: 'info',
    message: `Campaign ready — posted=${posted}, ${receipts.length} agents hired for $${costsUsdc.toFixed(3)}.`,
  });

  return {
    kit,
    execution: {
      posted,
      detail,
      postingPlan: [
        { day: 'Day 1', action: 'Publish the announcement thread (tweet 1 pinned).' },
        { day: 'Day 2', action: 'Post the banner image quoting the thread; reply to every comment.' },
        { day: 'Day 3', action: 'Share the README pitch in the CROO Discord #showcase channel.' },
        { day: 'Day 5', action: 'Post a "results so far" follow-up with your order count.' },
      ],
    },
    receipts,
    costsUsdc,
  };
}
