import { config } from '../config.js';
import { emit } from '../bus.js';
import { formatDeliverable } from '../report.js';
import { usdc } from '../store.js';
import type { HireRequest, HireResult, PaymentRail, ServiceHandler, ServiceKey } from './types.js';

/**
 * THE REAL RAIL — CROO Agent Protocol on Base.
 *
 * Megaphone is a single agent (one SDK key) that acts on both sides:
 *
 *   SELLER — auto-accepts negotiations for its own listings (audit/kit/campaign);
 *            when the buyer pays, runs the matching handler and delivers.
 *   BUYER  — hires external services mid-fulfilment:
 *            negotiateOrder → OrderCreated → payOrder → OrderCompleted → getDelivery.
 *
 * Lifecycle wiring is identical to the pattern proven in production by
 * Research Desk (same SDK, same event flow).
 */

interface Pending {
  req: HireRequest;
  price: number;
  orderId?: string;
  resolve: (r: HireResult) => void;
  reject: (e: Error) => void;
}

export class CrooRail implements PaymentRail {
  readonly name = 'CROO Agent Protocol (Base)';

  private sdk: any;
  private client: any;
  private stream: any;

  private handlers = new Map<ServiceKey, ServiceHandler>();
  private myServiceIds = new Map<string, ServiceKey>(); // serviceId -> key

  private pendingByNeg = new Map<string, Pending>();
  private pendingByOrder = new Map<string, Pending>();

  registerService(key: ServiceKey, handler: ServiceHandler): void {
    this.handlers.set(key, handler);
  }

  async init(): Promise<void> {
    if (!config.croo.sdkKey) {
      throw new Error('Missing CROO_MEGAPHONE_SDK_KEY in .env (or use RAIL=sim).');
    }
    for (const key of ['audit', 'kit', 'campaign'] as ServiceKey[]) {
      const id = config.croo.serviceIds[key];
      if (id) this.myServiceIds.set(id, key);
    }
    if (this.myServiceIds.size === 0) {
      emit({
        type: 'log',
        level: 'warn',
        message: 'No CROO_*_SERVICE_ID configured — selling is disabled, buying still works.',
      });
    }

    this.sdk = await import('@croo-network/sdk');
    const { AgentClient } = this.sdk;
    this.client = new AgentClient(
      {
        baseURL: config.croo.apiUrl,
        wsURL: config.croo.wsUrl,
        ...(config.croo.rpcUrl ? { rpcURL: config.croo.rpcUrl } : {}),
      },
      config.croo.sdkKey,
    );
    this.stream = await this.client.connectWebSocket();
    this.attachSellerHandlers();
    this.attachBuyerHandlers();

    emit({ type: 'log', level: 'info', message: 'Connected to CROO Agent Protocol on Base.' });
  }

  // ---------------------------------------------------------------- SELLER --

  private attachSellerHandlers(): void {
    const { EventType, DeliverableType } = this.sdk;

    // Auto-accept incoming negotiations for OUR listings only. (Negotiations we
    // start as a buyer reference other teams' serviceIds and are skipped here.)
    this.stream.on(EventType.NegotiationCreated, async (e: any) => {
      const key = e.service_id ? this.myServiceIds.get(e.service_id) : undefined;
      if (!key) return;
      try {
        await this.client.acceptNegotiation(e.negotiation_id);
        emit({ type: 'log', level: 'info', message: `Accepted a "${key}" negotiation.` });
      } catch (err) {
        emit({ type: 'log', level: 'error', message: `Accept failed: ${String(err)}` });
      }
    });

    // When a buyer pays for one of our services, fulfil and deliver.
    this.stream.on(EventType.OrderPaid, async (e: any) => {
      const orderId = e.order_id;
      // Ignore OrderPaid echoes for orders where WE are the buyer.
      if (this.pendingByOrder.has(orderId)) return;
      try {
        await this.fulfilOrder(orderId);
      } catch (err) {
        emit({ type: 'log', level: 'error', message: `Fulfil failed for ${orderId}: ${String(err)}` });
      }
    });
  }

  /**
   * Fulfil a PAID order for one of our services and deliver the result.
   * Called from the OrderPaid event, and manually (POST /api/fulfil) to
   * rescue an order whose first fulfilment attempt failed.
   */
  async fulfilOrder(orderId: string): Promise<void> {
    const { DeliverableType } = this.sdk;
    const order = await this.client.getOrder(orderId);
    const key = order?.serviceId ? this.myServiceIds.get(order.serviceId) : undefined;
    if (!key) throw new Error(`Order ${orderId} is not for one of our services.`);
    const handler = this.handlers.get(key);
    if (!handler) throw new Error(`No handler registered for "${key}".`);

    const price = usdc(order?.price);
    const input = safeParse(order?.requirements);
    const feed = (phase: string) =>
      emit({ type: 'order', direction: 'sell', orderId, service: key, counterparty: 'customer', amount: price, phase });

    feed('lock');
    const result = await handler(input, orderId);
    await this.client.deliverOrder(orderId, {
      deliverableType: DeliverableType.Text,
      deliverableText: formatDeliverable(result),
    });
    feed('deliver');
    emit({ type: 'money', kind: 'revenue', amount: price });
    feed('clear');
  }

  // ----------------------------------------------------------------- BUYER --

  private attachBuyerHandlers(): void {
    const { EventType } = this.sdk;

    this.stream.on(EventType.OrderCreated, async (e: any) => {
      const pending = e.negotiation_id ? this.pendingByNeg.get(e.negotiation_id) : undefined;
      if (!pending) return;
      const orderId = e.order_id;
      pending.orderId = orderId;
      if (orderId) this.pendingByOrder.set(orderId, pending);

      try {
        // Read the real on-chain price and refuse to overpay.
        const order = await this.client.getOrder(orderId);
        const realPrice = usdc(order?.price);
        if (realPrice > 0) pending.price = realPrice;
        const cap = Math.max(pending.req.price * 2, config.hires.maxPrice);
        if (pending.price > cap) {
          throw new Error(
            `Price ${pending.price} exceeds cap ${cap} for "${pending.req.serviceName}" — not paying.`,
          );
        }
        this.phase(pending, 'accept', orderId);
        const res = await this.client.payOrder(orderId);
        this.phase(pending, 'lock', orderId, res?.txHash);
        emit({ type: 'money', kind: 'spend', amount: pending.price });
      } catch (err) {
        this.fail(pending, err);
      }
    });

    this.stream.on(EventType.OrderCompleted, async (e: any) => {
      const pending = e.order_id ? this.pendingByOrder.get(e.order_id) : undefined;
      if (!pending) return;
      try {
        const delivery = await this.client.getDelivery(e.order_id);
        this.phase(pending, 'deliver', e.order_id);
        this.phase(pending, 'clear', e.order_id);
        pending.resolve({
          orderId: e.order_id,
          result: safeParse(delivery?.deliverableText),
          price: pending.price,
        });
        this.cleanup(pending);
      } catch (err) {
        this.fail(pending, err);
      }
    });

    this.stream.on(EventType.OrderRejected, (e: any) => {
      const pending = e.order_id ? this.pendingByOrder.get(e.order_id) : undefined;
      if (pending) this.fail(pending, new Error(`Order rejected: ${e.reason ?? 'unknown'}`));
    });
  }

  async hire(req: HireRequest): Promise<HireResult> {
    return new Promise<HireResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.fail(pending, new Error(`Order to "${req.serviceName}" timed out.`));
      }, 180_000);

      const pending: Pending = {
        req,
        price: req.price,
        resolve: (r) => {
          clearTimeout(timer);
          resolve(r);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      };

      this.phase(pending, 'negotiate');
      this.client
        .negotiateOrder({ serviceId: req.serviceId, requirements: JSON.stringify(req.input) })
        .then((neg: any) => this.pendingByNeg.set(neg.negotiationId, pending))
        .catch((err: unknown) => this.fail(pending, err));
    });
  }

  // ---------------------------------------------------------------- helpers --

  private phase(p: Pending, phase: string, orderId?: string, txHash?: string): void {
    emit({
      type: 'order',
      direction: 'buy',
      orderId: orderId ?? '',
      service: p.req.role,
      counterparty: p.req.serviceName,
      amount: p.price,
      phase,
      ...(txHash ? { txHash } : {}),
    });
  }

  private fail(p: Pending, err: unknown): void {
    p.reject(err instanceof Error ? err : new Error(String(err)));
    this.cleanup(p);
  }

  private cleanup(p: Pending): void {
    for (const [k, v] of this.pendingByNeg) if (v === p) this.pendingByNeg.delete(k);
    for (const [k, v] of this.pendingByOrder) if (v === p) this.pendingByOrder.delete(k);
  }

  async shutdown(): Promise<void> {
    try {
      this.stream?.close();
    } catch {
      /* ignore */
    }
  }
}

function safeParse(value: unknown): any {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
