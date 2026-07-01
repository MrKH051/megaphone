/**
 * One-shot test buyer: purchases a service on the CROO Agent Store and prints
 * the delivery. Pure HTTP polling — no WebSocket — so it works even when the
 * buyer key's single WS slot is held by another process (CROO allows one
 * socket per key).
 *
 * Usage:
 *   node scripts/buy-order.mjs <serviceId> <buyerSdkKey> '<requirements JSON>'
 */
import { AgentClient } from '@croo-network/sdk';

const [serviceId, sdkKey, reqJson] = process.argv.slice(2);
if (!serviceId || !sdkKey) {
  console.error("Usage: node scripts/buy-order.mjs <serviceId> <buyerSdkKey> '<requirements JSON>'");
  process.exit(1);
}

const client = new AgentClient({ baseURL: 'https://api.croo.network' }, sdkKey);
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DEADLINE = Date.now() + 8 * 60_000;

function checkDeadline(stage) {
  if (Date.now() > DEADLINE) {
    console.error(`Timed out while ${stage}.`);
    process.exit(1);
  }
}

log('negotiating for service', serviceId, '…');
const neg = await client.negotiateOrder({ serviceId, requirements: reqJson ?? '{}' });
log('negotiation:', neg.negotiationId, '— waiting for the seller to accept…');

// 1) Wait until the negotiation is accepted.
let status = neg.status;
while (!/accept/i.test(status)) {
  checkDeadline('waiting for acceptance');
  await sleep(4000);
  const n = await client.getNegotiation(neg.negotiationId);
  status = n.status;
  if (/reject/i.test(status)) {
    console.error('Negotiation rejected:', n.rejectReason);
    process.exit(1);
  }
}
log('accepted — locating the order…');

// 2) Find the order created from this negotiation.
let order = null;
while (!order) {
  checkDeadline('locating the order');
  const orders = await client.listOrders({ page: 1, pageSize: 50 });
  order = (orders ?? []).find((o) => o.negotiationId === neg.negotiationId) ?? null;
  if (!order) await sleep(4000);
}
log('order:', order.orderId, `(price ${Number(order.price) / 1e6} USDC) — paying…`);

// 3) Pay (escrow locks on Base).
const pay = await client.payOrder(order.orderId);
log('paid.', pay?.txHash ? `tx: ${pay.txHash}` : '(custodial payment)');

// 4) Wait for delivery.
let st = '';
while (!/complete|deliver/i.test(st)) {
  checkDeadline('waiting for delivery');
  await sleep(5000);
  const o = await client.getOrder(order.orderId);
  st = o.status;
  if (/reject|cancel|refund/i.test(st)) {
    console.error('Order ended without delivery, status:', st);
    process.exit(1);
  }
}

const d = await client.getDelivery(order.orderId);
console.log('\n================ DELIVERY ================');
const text = d?.deliverableText ?? JSON.stringify(d);
console.log(text.length > 4000 ? text.slice(0, 4000) + '\n…(truncated)' : text);
console.log('==========================================');
process.exit(0);
