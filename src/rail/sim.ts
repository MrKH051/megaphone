import { randomUUID } from 'node:crypto';
import { emit } from '../bus.js';
import type { HireRequest, HireResult, PaymentRail, ServiceHandler, ServiceKey } from './types.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * A faithful, offline simulation of the CROO escrow lifecycle.
 *
 * Selling: the dashboard can trigger demo orders which run the real service
 * handlers. Buying: external hires are answered by small canned providers so
 * the full pipeline (and the money story on the dashboard) works end-to-end
 * with zero accounts and zero spend.
 */
export class SimulatedRail implements PaymentRail {
  readonly name = 'Simulated escrow (offline)';

  private handlers = new Map<ServiceKey, ServiceHandler>();

  async init(): Promise<void> {
    emit({ type: 'log', level: 'info', message: 'Simulated rail ready (no real money moves).' });
  }

  registerService(key: ServiceKey, handler: ServiceHandler): void {
    this.handlers.set(key, handler);
  }

  /** Used by the demo endpoint: run one of our own services as if a buyer paid. */
  async simulateSale(key: ServiceKey, input: unknown, price: number): Promise<unknown> {
    const handler = this.handlers.get(key);
    if (!handler) throw new Error(`No handler for service "${key}".`);
    const orderId = 'sim_' + randomUUID().slice(0, 8);
    const phase = (p: string) =>
      emit({ type: 'order', direction: 'sell', orderId, service: key, counterparty: 'demo buyer', amount: price, phase: p });

    phase('negotiate');
    await sleep(300);
    phase('lock');
    const result = await handler(input, orderId);
    phase('deliver');
    await sleep(200);
    phase('clear');
    emit({ type: 'money', kind: 'revenue', amount: price });
    return result;
  }

  async hire(req: HireRequest): Promise<HireResult> {
    const orderId = 'sim_' + randomUUID().slice(0, 8);
    const phase = (p: string) =>
      emit({
        type: 'order',
        direction: 'buy',
        orderId,
        service: req.role,
        counterparty: req.serviceName,
        amount: req.price,
        phase: p,
      });

    phase('negotiate');
    await sleep(250);
    phase('lock');
    await sleep(250);
    const result = cannedProvider(req);
    phase('deliver');
    await sleep(200);
    phase('clear');
    emit({ type: 'money', kind: 'spend', amount: req.price });
    return { orderId, result, price: req.price };
  }

  async shutdown(): Promise<void> {
    /* nothing to clean up */
  }
}

/** Small canned outputs standing in for real external agents (sim mode only). */
function cannedProvider(req: HireRequest): unknown {
  switch (req.role) {
    case 'research':
      return {
        findings:
          '[simulated external agent] Key market context: agent marketplaces reward clear, benefit-first listings; buyers scan the first line only; social proof (order counts) strongly drives conversion.',
      };
    case 'factcheck':
      return {
        verdict: 'pass',
        confidence: 0.85,
        notes: '[simulated external agent] No unverifiable or overclaiming statements detected in the promo copy.',
      };
    case 'summarize':
      return { summary: '[simulated external agent] Concise summary of the provided text.' };
    case 'content':
      return {
        content:
          '[simulated external agent] Most teams ship an agent and then wonder why nobody orders it. Discovery is the product problem, not a marketing afterthought. This listing answers one question in seconds, for less than the price of the coffee you drank while reading this — and every claim it makes is checkable against its own store page. Try it once on a real task and judge it on the output. https://agent.croo.network',
      };
    default:
      return { note: `[simulated external agent] Response for role "${req.role}".` };
  }
}
