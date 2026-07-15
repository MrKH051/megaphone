import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { emit } from './bus.js';

/**
 * HIRE HISTORY — Megaphone remembers who let it down.
 *
 * A service that failed to deliver once will usually fail again: it is offline,
 * it rejects our payload shape, or it sells something that is not what its
 * listing claims. Retrying it on every order burns escrow time and, on the live
 * rail, real USDC.
 *
 * The record is written to disk on purpose. In-memory only would forget every
 * failure on restart, which is exactly when we most need it: the whole point is
 * that a fresh process must not walk back into the same bad hire.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(__dirname, '..', '.data', 'hire-failures.json');

interface FailureRecord {
  serviceId: string;
  serviceName: string;
  count: number;
  lastReason: string;
  lastFailedAt: string; // ISO
}

let memo: Map<string, FailureRecord> | null = null;

function load(): Map<string, FailureRecord> {
  if (memo) return memo;
  memo = new Map();
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8')) as FailureRecord[];
    for (const r of Array.isArray(raw) ? raw : []) {
      if (r?.serviceId) memo.set(r.serviceId, r);
    }
  } catch {
    // No history yet (or it is corrupt) — start clean rather than crash a hire.
  }
  return memo;
}

function save(): void {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify([...load().values()], null, 2));
  } catch (err) {
    emit({ type: 'log', level: 'warn', message: `Could not persist hire history: ${String(err)}` });
  }
}

const daysSince = (iso: string): number => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? (Date.now() - t) / 86_400_000 : Infinity;
};

/** Record that a service failed to deliver, and why. */
export function recordFailure(serviceId: string, serviceName: string, reason: string): void {
  const hist = load();
  const prev = hist.get(serviceId);
  hist.set(serviceId, {
    serviceId,
    serviceName,
    count: (prev?.count ?? 0) + 1,
    lastReason: reason.slice(0, 300),
    lastFailedAt: new Date().toISOString(),
  });
  save();
}

/** Clear a service's record — it delivered, so it has earned another chance. */
export function recordSuccess(serviceId: string): void {
  const hist = load();
  if (hist.delete(serviceId)) save();
}

/**
 * Should we skip this service? True while its most recent failure is still
 * inside the cooldown. The window is per-failure, not permanent: a service
 * that was merely offline for a day deserves to come back eventually.
 */
export function isOnCooldown(serviceId: string): boolean {
  const rec = load().get(serviceId);
  if (!rec) return false;
  return daysSince(rec.lastFailedAt) < config.hires.failureCooldownDays;
}

/** Every service currently benched, for the dashboard and for logging. */
export function benched(): FailureRecord[] {
  return [...load().values()].filter((r) => isOnCooldown(r.serviceId));
}
