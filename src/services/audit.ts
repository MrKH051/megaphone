import { emit } from '../bus.js';
import { llmJson } from '../llm.js';
import { competitorsOf, findTarget, marketStats, type Competitor, type StoreAgent, type StoreService } from '../store.js';

/**
 * SERVICE 1 — LISTING AUDIT (~$0.5)
 *
 * Input:  { "service": "<service name | serviceId | agent name>" }
 * Output: a structured audit of the customer's CROO Store listing with a
 *         full rewrite, competitor price table, and concrete fixes —
 *         grounded in a live snapshot of every listing on the store.
 */

export interface AuditInput {
  service?: string;
  target?: string; // accepted alias
}

export interface AuditReport {
  target: {
    serviceId: string;
    serviceName: string;
    agentName: string;
    priceUsdc: number;
    orders7d: number;
    completionRate: number;
    currentDescription: string;
  };
  market: { services: number; agents: number; medianPriceUsdc: number; activeShare: number };
  competitors: Array<{
    serviceName: string;
    agentName: string;
    priceUsdc: number;
    orders7d: number;
    note: string;
  }>;
  issues: string[];
  rewrite: { name: string; description: string };
  pricingAdvice: string;
  score: number; // 0-100 listing quality before fixes
}

interface LlmAudit {
  issues: string[];
  rewriteName: string;
  rewriteDescription: string;
  pricingAdvice: string;
  score: number;
}

export function targetQueryOf(raw: unknown): string {
  if (typeof raw === 'string') return raw;
  const obj = (raw ?? {}) as Record<string, unknown>;
  return String(obj.service ?? obj.target ?? obj.query ?? obj.name ?? '').trim();
}

export async function runAudit(raw: unknown): Promise<AuditReport> {
  const query = targetQueryOf(raw);
  if (!query) {
    throw new Error(
      'Please pass the listing to audit, e.g. {"service": "your service name or serviceId"}.',
    );
  }

  const found = await findTarget(query);
  if (!found) {
    throw new Error(
      `Could not find "${query}" on the CROO Agent Store. Pass your exact service name, serviceId, or agent name.`,
    );
  }

  const { service, agent } = found;
  const [competitors, market] = await Promise.all([competitorsOf(service), marketStats()]);

  emit({
    type: 'log',
    level: 'info',
    message: `Auditing "${service.name}" (${competitors.length} competitors found).`,
  });

  const analysis = await analyzeListing(service, agent, competitors, market.medianPrice);

  return {
    target: {
      serviceId: service.serviceId,
      serviceName: service.name,
      agentName: agent?.name ?? 'unknown',
      priceUsdc: service.price,
      orders7d: service.orders7d,
      completionRate: agent?.completionRate ?? 0,
      currentDescription: service.description,
    },
    market: {
      services: market.services,
      agents: market.agents,
      medianPriceUsdc: market.medianPrice,
      activeShare: market.activeShare,
    },
    competitors: competitors.map((c) => ({
      serviceName: c.service.name,
      agentName: c.agent?.name ?? 'unknown',
      priceUsdc: c.service.price,
      orders7d: c.service.orders7d,
      note: competitorNote(service, c),
    })),
    issues: analysis.issues,
    rewrite: { name: analysis.rewriteName, description: analysis.rewriteDescription },
    pricingAdvice: analysis.pricingAdvice,
    score: Math.max(0, Math.min(100, Math.round(analysis.score))),
  };
}

function competitorNote(target: StoreService, c: Competitor): string {
  const notes: string[] = [];
  if (c.service.price < target.price) notes.push(`cheaper (${fmt(c.service.price)} vs ${fmt(target.price)})`);
  if (c.service.price > target.price) notes.push(`pricier (${fmt(c.service.price)})`);
  if (c.service.orders7d > target.orders7d) notes.push(`more traction (${c.service.orders7d} orders/7d)`);
  return notes.join(', ') || 'similar offer';
}

const fmt = (n: number) => `$${n}`;

async function analyzeListing(
  service: StoreService,
  agent: StoreAgent | undefined,
  competitors: Competitor[],
  medianPrice: number,
): Promise<LlmAudit> {
  const competitorBlock = competitors.length
    ? competitors
        .map(
          (c, i) =>
            `${i + 1}. "${c.service.name}" by ${c.agent?.name ?? '?'} — $${c.service.price}, ${c.service.orders7d} orders/7d\n   ${c.service.description.slice(0, 180)}`,
        )
        .join('\n')
    : '(no close competitors found — that itself is a selling point)';

  const fallback: LlmAudit = {
    issues: ['Listing description is hard to scan for a first-time buyer.'],
    rewriteName: service.name,
    rewriteDescription: service.description,
    pricingAdvice: `Store median is $${medianPrice}; your price of $${service.price} is ${
      service.price > medianPrice ? 'above' : 'at or below'
    } median.`,
    score: 55,
  };

  const res = await llmJson<Partial<LlmAudit>>(
    [
      'You are a conversion copywriter who specializes in marketplace listings for AI agent services.',
      'Buyers (humans AND other AI agents) scan a name + first sentence and decide in seconds.',
      'Audit the listing below against its real competitors. Be specific and honest — no flattery.',
      'Never invent capabilities the listing does not claim. Keep the rewrite truthful.',
      'Return JSON with keys: issues (array of 3-6 short strings), rewriteName (string, <=60 chars),',
      'rewriteDescription (string, 2-4 sentences, benefit-first, states exact input and output),',
      'pricingAdvice (string, 1-3 sentences referencing competitor prices), score (number 0-100 for the CURRENT listing).',
    ].join(' '),
    [
      `LISTING UNDER AUDIT`,
      `Name: ${service.name}`,
      `Price: $${service.price} USDC · SLA: ${service.slaMinutes} min · Orders last 7d: ${service.orders7d}`,
      `Agent: ${agent?.name ?? 'unknown'} (completion rate ${agent?.completionRate ?? '?'}%, total earned $${agent?.totalEarnedUsdc ?? '?'})`,
      `Description: ${service.description}`,
      ``,
      `COMPETITORS ON THE SAME STORE`,
      competitorBlock,
      ``,
      `STORE CONTEXT: median service price $${medianPrice}.`,
    ].join('\n'),
    fallback,
    { temperature: 0.4, maxTokens: 900 },
  );

  // Sanitize: whatever the model returned, every field must be usable.
  return {
    issues:
      Array.isArray(res.issues) && res.issues.length
        ? res.issues.map((i) => String(i)).slice(0, 6)
        : fallback.issues,
    rewriteName:
      typeof res.rewriteName === 'string' && res.rewriteName.trim()
        ? res.rewriteName.trim().slice(0, 80)
        : fallback.rewriteName,
    rewriteDescription:
      typeof res.rewriteDescription === 'string' && res.rewriteDescription.trim()
        ? res.rewriteDescription.trim()
        : fallback.rewriteDescription,
    pricingAdvice:
      typeof res.pricingAdvice === 'string' && res.pricingAdvice.trim()
        ? res.pricingAdvice.trim()
        : fallback.pricingAdvice,
    score: Number.isFinite(Number(res.score)) ? Number(res.score) : fallback.score,
  };
}
