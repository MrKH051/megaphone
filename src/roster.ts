import { config } from './config.js';
import { emit } from './bus.js';
import { candidatesFor, getStore } from './store.js';
import type { HireRequest, PaymentRail } from './rail/types.js';

/**
 * THE HIRE ROSTER — who Megaphone employs, per role, with fallbacks.
 *
 * For each role we shortlist cheap external services from the live store
 * (or a pinned serviceId from .env), then try them in order until one
 * delivers. Every successful hire is recorded as a receipt that ships
 * inside the customer's deliverable — full supply-chain transparency.
 */

export type Role = 'research' | 'factcheck' | 'summarize' | 'post';

const ROLE_KEYWORDS: Record<Role, string[]> = {
  research: ['web research', 'research', 'deep research'],
  factcheck: ['fact-check', 'fact check', 'quick check', 'verify'],
  summarize: ['summarize', 'summary'],
  post: ['autopost', 'x campaign', 'posting', 'publish'],
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

/** Shortlist hireable services for a role: pinned first, then best live matches. */
export async function shortlist(role: Role): Promise<Array<{ serviceId: string; name: string; price: number }>> {
  const list: Array<{ serviceId: string; name: string; price: number }> = [];

  const pinnedId = config.hires.pinned[role];
  if (pinnedId) {
    const { services } = await getStore();
    const pinned = services.find((s) => s.serviceId === pinnedId);
    list.push(pinned ?? { serviceId: pinnedId, name: `pinned ${role}`, price: config.hires.maxPrice });
  }

  const found = await candidatesFor(ROLE_KEYWORDS[role], {
    maxPrice: role === 'post' ? 1 : config.hires.maxPrice, // posting agents cost more
    excludeAgentIds: config.hires.excludeAgentIds,
    limit: 3,
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
      emit({
        type: 'log',
        level: 'warn',
        message: `Hire "${c.name}" for ${role} failed (${String((err as Error).message ?? err)}) — trying next.`,
      });
    }
  }
  return null;
}
