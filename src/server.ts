import express from 'express';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { config } from './config.js';
import { bus, emit, type BusEvent } from './bus.js';
import type { PaymentRail, ServiceKey } from './rail/types.js';
import { SimulatedRail } from './rail/sim.js';
import { runAudit } from './services/audit.js';
import { runKit } from './services/kit.js';
import { runCampaign } from './services/campaign.js';
import { getStore } from './store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Keep the last few deliverables in memory so the dashboard can render them.
const deliverables = new Map<string, { service: ServiceKey; result: unknown; at: number }>();

function remember(service: ServiceKey, result: unknown): string {
  const id = randomUUID().slice(0, 8);
  deliverables.set(id, { service, result, at: Date.now() });
  // Cap memory: keep the 20 most recent.
  if (deliverables.size > 20) {
    const oldest = [...deliverables.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    deliverables.delete(oldest[0]);
  }
  emit({ type: 'deliverable', id, service });
  return id;
}

async function buildRail(): Promise<PaymentRail> {
  let rail: PaymentRail;
  if (config.rail === 'croo') {
    const { CrooRail } = await import('./rail/croo.js'); // lazy: only load SDK in croo mode
    rail = new CrooRail();
  } else {
    rail = new SimulatedRail();
  }

  rail.registerService('audit', async (input) => {
    const report = await runAudit(input);
    remember('audit', report);
    return report;
  });
  rail.registerService('kit', async (input) => {
    const kit = await runKit(rail, input);
    remember('kit', kit);
    return kit;
  });
  rail.registerService('campaign', async (input) => {
    const campaign = await runCampaign(rail, input);
    remember('campaign', campaign);
    return campaign;
  });

  await rail.init();
  return rail;
}

async function main() {
  const rail = await buildRail();

  // Warm the store snapshot so the first order is fast (best effort).
  getStore().catch((err) =>
    emit({ type: 'log', level: 'warn', message: `Store warm-up failed: ${String(err)}` }),
  );

  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('/api/status', (_req, res) => {
    res.json({
      rail: config.rail,
      railName: rail.name,
      llm: config.llm.apiKey ? config.llm.model : 'demo brain (no LLM key set)',
      services: ['audit', 'kit', 'campaign'],
    });
  });

  // Server-Sent Events: stream every bus event to connected browsers.
  app.get('/api/events', (req, res) => {
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.flushHeaders();
    res.write(`data: ${JSON.stringify({ type: 'hello' })}\n\n`);

    const listener = (ev: BusEvent) => res.write(`data: ${JSON.stringify(ev)}\n\n`);
    bus.on('event', listener);
    req.on('close', () => bus.off('event', listener));
  });

  // Fetch a stored deliverable (dashboard rendering).
  app.get('/api/deliverable/:id', (req, res) => {
    const item = deliverables.get(req.params.id);
    if (!item) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    res.json(item);
  });

  // Render a kit/campaign banner as an actual image.
  app.get('/api/banner/:id', (req, res) => {
    const item = deliverables.get(req.params.id);
    const svg =
      (item?.result as any)?.bannerSvg ?? (item?.result as any)?.kit?.bannerSvg ?? null;
    if (!svg) {
      res.status(404).send('no banner');
      return;
    }
    res.set('Content-Type', 'image/svg+xml').send(svg);
  });

  /**
   * Run one of Megaphone's services as if a customer ordered it.
   * In sim mode this is the demo path. In croo mode it performs REAL hires
   * (spends USDC), so it requires the admin token when one is configured.
   */
  app.post('/api/demo', (req, res) => {
    const service = String(req.body?.service ?? 'audit') as ServiceKey;
    const target = String(req.body?.target ?? '').trim();
    if (!['audit', 'kit', 'campaign'].includes(service)) {
      res.status(400).json({ error: 'service must be audit | kit | campaign' });
      return;
    }
    if (!target) {
      res.status(400).json({ error: 'Please provide "target" (a service/agent name on the CROO store).' });
      return;
    }
    const needsToken = config.rail === 'croo' || Boolean(config.adminToken);
    if (needsToken && req.headers['x-admin-token'] !== config.adminToken) {
      res.status(403).json({ error: 'admin token required' });
      return;
    }

    const prices: Record<ServiceKey, number> = { audit: 0.5, kit: 3, campaign: 10 };
    const input = { service: target };
    const work =
      config.rail === 'sim' && rail instanceof SimulatedRail
        ? rail.simulateSale(service, input, prices[service])
        : runService(rail, service, input);

    work.catch((err) => {
      emit({ type: 'log', level: 'error', message: String(err?.message ?? err) });
    });
    res.json({ ok: true, message: 'Order started — watch the live feed.' });
  });

  app.listen(config.port, () => {
    console.log(`\n  Megaphone 📣 is running:  http://localhost:${config.port}`);
    console.log(`  Payment rail: ${rail.name}`);
    console.log(
      `  AI brain:     ${config.llm.apiKey ? config.llm.model : 'demo brain (set LLM_API_KEY for real AI)'}\n`,
    );
  });
}

async function runService(rail: PaymentRail, service: ServiceKey, input: unknown): Promise<void> {
  if (service === 'audit') {
    remember('audit', await runAudit(input));
  } else if (service === 'kit') {
    remember('kit', await runKit(rail, input));
  } else {
    remember('campaign', await runCampaign(rail, input));
  }
}

main().catch((err) => {
  console.error('Failed to start Megaphone:', err);
  process.exit(1);
});
