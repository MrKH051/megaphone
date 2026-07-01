import { config } from './config.js';
import { emit } from './bus.js';

/**
 * STORE INTELLIGENCE — Megaphone's superpower.
 *
 * The CROO Agent Store exposes public, no-auth endpoints for every listed
 * agent and service. We snapshot both, join them, and compute the competitive
 * context (who else sells something similar, at what price, with what track
 * record) that powers every Megaphone deliverable.
 */

export interface StoreService {
  serviceId: string;
  agentId: string;
  name: string;
  description: string;
  /** USDC (human units, e.g. 0.1) */
  price: number;
  slaMinutes: number;
  orders7d: number;
}

export interface StoreAgent {
  agentId: string;
  name: string;
  description: string;
  avatar: string;
  status: string;
  onlineStatus: string;
  completedOrders: number;
  totalEarnedUsdc: number;
  completionRate: number;
  avgDeliveryText: string;
  skillTags: string[];
  createdTime: string;
}

export interface Competitor {
  service: StoreService;
  agent?: StoreAgent;
  similarity: number;
}

interface Snapshot {
  services: StoreService[];
  agents: Map<string, StoreAgent>;
  fetchedAt: number;
}

const CACHE_TTL_MS = 10 * 60 * 1000;
let cache: Snapshot | null = null;

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { headers: { 'User-Agent': 'megaphone-agent/0.1' } });
  if (!res.ok) throw new Error(`Store API ${res.status} for ${url}`);
  return res.json();
}

/** USDC base-units string (6 decimals) -> human number ("100000" -> 0.1). */
export function usdc(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round((n / 1_000_000) * 1e6) / 1e6 : 0;
}

/** Snapshot the whole store (all services + all agents), cached for 10 minutes. */
export async function getStore(force = false): Promise<Snapshot> {
  if (!force && cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache;

  // NOTE: the API caps page_size (returns 50/page even when asked for 100),
  // so we page until it stops returning items or we reach the reported total.
  const services: StoreService[] = [];
  for (let page = 1; page <= 40; page++) {
    const data = await getJson(
      `${config.croo.apiUrl}/backend/v1/public/services?page=${page}&page_size=100`,
    );
    const items: any[] = data.items ?? [];
    if (items.length === 0) break;
    for (const it of items) {
      services.push({
        serviceId: it.serviceId,
        agentId: it.agentId,
        name: String(it.name ?? ''),
        description: String(it.description ?? ''),
        price: usdc(it.price),
        slaMinutes: Number(it.slaMinutes ?? 0),
        orders7d: Number(it.orders7d ?? 0),
      });
    }
    const total = Number(data.total ?? 0);
    if (total > 0 && services.length >= total) break;
  }

  const agents = new Map<string, StoreAgent>();
  for (let page = 1; page <= 40; page++) {
    const data = await getJson(
      `${config.croo.apiUrl}/backend/v1/public/agents?page=${page}&page_size=100`,
    );
    const items: any[] = data.agents ?? data.items ?? [];
    if (items.length === 0) break;
    for (const it of items) {
      agents.set(it.agentId, {
        agentId: it.agentId,
        name: String(it.name ?? ''),
        description: String(it.description ?? ''),
        avatar: String(it.avatar ?? ''),
        status: String(it.status ?? ''),
        onlineStatus: String(it.onlineStatus ?? ''),
        completedOrders: Number(it.completedOrders ?? 0),
        totalEarnedUsdc: usdc(it.totalEarned),
        completionRate: Number(it.completionRate ?? 0),
        avgDeliveryText: String(it.avgDeliveryText ?? ''),
        skillTags: Array.isArray(it.skillTagSlugs) ? it.skillTagSlugs : [],
        createdTime: String(it.createdTime ?? ''),
      });
    }
    const total = Number(data.total ?? 0);
    if (total > 0 && agents.size >= total) break;
  }

  cache = { services, agents, fetchedAt: Date.now() };
  emit({
    type: 'log',
    level: 'info',
    message: `Store snapshot: ${services.length} services from ${agents.size} agents.`,
  });
  return cache;
}

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'for', 'of', 'to', 'in', 'on', 'with', 'any', 'your',
  'via', 'from', 'by', 'is', 'are', 'be', 'this', 'that', 'you', 'we', 'our', 'it',
  'description', 'returns', 'return', 'get', 'submit', 'agent', 'agents', 'service',
]);

function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/[\s-]+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w)),
  );
}

/** Jaccard-ish keyword similarity between two listings (name weighted 2x). */
function similarity(a: StoreService, b: StoreService): number {
  const an = tokens(a.name);
  const bn = tokens(b.name);
  const ad = tokens(`${a.name} ${a.description}`);
  const bd = tokens(`${b.name} ${b.description}`);
  const overlap = (x: Set<string>, y: Set<string>) => {
    let hit = 0;
    for (const t of x) if (y.has(t)) hit++;
    const denom = Math.min(x.size, y.size) || 1;
    return hit / denom;
  };
  return 0.6 * overlap(an, bn) + 0.4 * overlap(ad, bd);
}

/**
 * Find the listing the customer is talking about. Accepts a serviceId, an exact
 * or partial service name, or an agent name (then picks that agent's top service).
 */
export async function findTarget(query: string): Promise<{ service: StoreService; agent?: StoreAgent } | null> {
  const { services, agents } = await getStore();
  const q = query.trim().toLowerCase();
  if (!q) return null;

  const byId = services.find((s) => s.serviceId.toLowerCase() === q);
  if (byId) return { service: byId, agent: agents.get(byId.agentId) };

  const exact = services.find((s) => s.name.toLowerCase() === q);
  if (exact) return { service: exact, agent: agents.get(exact.agentId) };

  const agentHit = [...agents.values()].find((a) => a.name.toLowerCase() === q)
    ?? [...agents.values()].find((a) => a.name.toLowerCase().includes(q));
  if (agentHit) {
    const own = services
      .filter((s) => s.agentId === agentHit.agentId)
      .sort((a, b) => b.orders7d - a.orders7d)[0];
    if (own) return { service: own, agent: agentHit };
  }

  const partial = services
    .filter((s) => s.name.toLowerCase().includes(q) || q.includes(s.name.toLowerCase()))
    .sort((a, b) => b.orders7d - a.orders7d)[0];
  if (partial) return { service: partial, agent: agents.get(partial.agentId) };

  return null;
}

/** Rank every other team's listing by similarity to the target. */
export async function competitorsOf(target: StoreService, limit = 6): Promise<Competitor[]> {
  const { services, agents } = await getStore();
  return services
    .filter((s) => s.serviceId !== target.serviceId && s.agentId !== target.agentId)
    .map((service) => ({ service, agent: agents.get(service.agentId), similarity: similarity(target, service) }))
    .filter((c) => c.similarity > 0.15)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

/** Store-wide pricing/traction stats used to position the customer's listing. */
export async function marketStats(): Promise<{
  services: number;
  agents: number;
  medianPrice: number;
  activeShare: number;
}> {
  const { services, agents } = await getStore();
  const prices = services.map((s) => s.price).sort((a, b) => a - b);
  const medianPrice = prices.length ? prices[Math.floor(prices.length / 2)] : 0;
  const active = services.filter((s) => s.orders7d > 0).length;
  return {
    services: services.length,
    agents: agents.size,
    medianPrice,
    activeShare: services.length ? Math.round((active / services.length) * 100) : 0,
  };
}

/**
 * Find hireable services for a role (research / factcheck / summarize / post):
 * cheap, from other teams, ranked by real traction. Used by the hire roster.
 *
 * Keywords are ordered by priority: a service whose NAME matches an earlier
 * keyword always outranks one matching a later keyword or matching only in
 * the description ("Fact-Check" beats "Verify Crypto Shill" for factcheck).
 */
export async function candidatesFor(
  keywords: string[],
  opts: { maxPrice: number; excludeAgentIds: string[]; limit?: number },
): Promise<StoreService[]> {
  const { services } = await getStore();
  const kw = keywords.map((k) => k.toLowerCase());

  const rank = (s: StoreService): number => {
    const name = s.name.toLowerCase();
    const desc = s.description.toLowerCase();
    for (let i = 0; i < kw.length; i++) if (name.includes(kw[i])) return i;
    for (let i = 0; i < kw.length; i++) if (desc.includes(kw[i])) return kw.length + i;
    return -1;
  };

  return services
    .map((s) => ({ s, rank: rank(s) }))
    .filter(
      ({ s, rank }) =>
        rank >= 0 &&
        s.price > 0 &&
        s.price <= opts.maxPrice &&
        !opts.excludeAgentIds.includes(s.agentId),
    )
    .sort((a, b) => a.rank - b.rank || b.s.orders7d - a.s.orders7d || a.s.price - b.s.price)
    .map(({ s }) => s)
    .slice(0, opts.limit ?? 3);
}
