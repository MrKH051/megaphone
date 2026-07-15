import { config } from './config.js';
import { emit } from './bus.js';
import { candidatesFor, getStore } from './store.js';
import { isOnCooldown, recordFailure, recordSuccess } from './hire-history.js';
import type { HireRequest, PaymentRail } from './rail/types.js';

/**
 * THE HIRE ROSTER — who Megaphone employs, per role, with fallbacks.
 *
 * For each role we shortlist cheap external services from the live store
 * (or a pinned serviceId from .env), then try them in order until one
 * delivers. Every successful hire is recorded as a receipt that ships
 * inside the customer's deliverable — full supply-chain transparency.
 */

export type Role = 'research' | 'factcheck' | 'summarize' | 'content';

const ROLE_KEYWORDS: Record<Role, string[]> = {
  research: ['web research', 'research', 'deep research'],
  factcheck: ['fact-check', 'fact check', 'quick check', 'verify'],
  summarize: ['summarize', 'summary'],
  // We buy WRITTEN PROSE, not "posting". The autopost listings on the store
  // bill for a licence or an integration and hand back a token, not a published
  // tweet — so the deliverable claimed "PUBLISHED" while nothing was posted.
  // Text we can print is text the customer can check.
  //
  // Note the absent keyword: a bare "content" matches "Content Originality
  // Check", "Bulk Verification" and friends — services that GRADE content
  // rather than write any. Every keyword here has to imply an author.
  content: ['report writing', 'copywriting', 'copywriter', 'content writer', 'ghostwriter', 'writing', 'research draft', 'draft'],
};

export interface Receipt {
  role: Role;
  serviceName: string;
  serviceId: string;
  orderId: string;
  priceUsdc: number;
  txHash?: string;
}

export interface HireOutcome {
  result: unknown;
  receipt: Receipt;
}

/** Is this name on the never-hire list? Checked here too, so a pinned id cannot slip past. */
function isBlockedName(name: string): boolean {
  const n = name.toLowerCase();
  return config.hires.blockedNames.some((b) => n.includes(b));
}

/** Shortlist hireable services for a role: pinned first, then best live matches. */
export async function shortlist(role: Role): Promise<Array<{ serviceId: string; name: string; price: number }>> {
  const list: Array<{ serviceId: string; name: string; price: number }> = [];

  const pinnedId = config.hires.pinned[role];
  if (pinnedId) {
    const { services } = await getStore();
    const pinned = services.find((s) => s.serviceId === pinnedId);
    const candidate = pinned ?? { serviceId: pinnedId, name: `pinned ${role}`, price: config.hires.maxPrice };
    // A pin is a preference, not an override: a blocked or benched service stays out.
    if (isBlockedName(candidate.name) || isOnCooldown(candidate.serviceId)) {
      emit({ type: 'log', level: 'warn', message: `Pinned ${role} service "${candidate.name}" is blocked or benched — ignoring the pin.` });
    } else {
      list.push(candidate);
    }
  }

  const found = await candidatesFor(ROLE_KEYWORDS[role], {
    maxPrice: role === 'content' ? 1 : config.hires.maxPrice, // writers cost more than a quick check
    excludeAgentIds: config.hires.excludeAgentIds,
    limit: 3,
    blockedNames: config.hires.blockedNames,
    skipServiceId: isOnCooldown,
  });
  for (const s of found) {
    if (!list.some((c) => c.serviceId === s.serviceId)) {
      list.push({ serviceId: s.serviceId, name: s.name, price: s.price });
    }
  }
  return list;
}

/**
 * Hire the best available agent for a role, falling back through the shortlist.
 * Returns null if nobody could deliver (callers degrade gracefully).
 */
export async function hireRole(
  rail: PaymentRail,
  role: Role,
  input: unknown,
): Promise<HireOutcome | null> {
  const candidates = await shortlist(role);
  if (candidates.length === 0) {
    emit({ type: 'log', level: 'warn', message: `No hireable service found for role "${role}".` });
    return null;
  }

  for (const c of candidates) {
    const req: HireRequest = {
      role,
      serviceId: c.serviceId,
      serviceName: c.name,
      input,
      price: c.price,
    };
    try {
      const res = await rail.hire(req);
      recordSuccess(c.serviceId);
      return {
        result: res.result,
        receipt: {
          role,
          serviceName: c.name,
          serviceId: c.serviceId,
          orderId: res.orderId,
          priceUsdc: res.price,
          ...(res.txHash ? { txHash: res.txHash } : {}),
        },
      };
    } catch (err) {
      const reason = String((err as Error).message ?? err);
      // Bench it so the next order — and the next process — skips it outright.
      recordFailure(c.serviceId, c.name, reason);
      emit({
        type: 'log',
        level: 'warn',
        message: `Hire "${c.name}" for ${role} failed (${reason}) — benched for ${config.hires.failureCooldownDays}d, trying next.`,
      });
    }
  }
  return null;
}
