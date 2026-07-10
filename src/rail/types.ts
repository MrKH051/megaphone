export type ServiceKey = 'audit' | 'kit' | 'campaign';

/** A request to hire (and pay) another CROO agent's service. */
export interface HireRequest {
  role: string; // what we need it for, e.g. "research" / "factcheck" / "post"
  serviceId: string; // the external service to hire
  serviceName: string; // display name for the feed / receipts
  input: unknown; // the task payload sent as order requirements
  /** Listed store price (USDC) — used for display and as an escrow sanity cap. */
  price: number;
}

export interface HireResult {
  orderId: string;
  result: unknown;
  price: number; // actual amount paid (real on-chain price in croo mode)
  txHash?: string;
}

/** One of Megaphone's own sellable services. */
export type ServiceHandler = (input: unknown, orderId: string) => Promise<unknown>;

/** A finished artifact shipped to CROO file storage (croo mode only). */
export interface UploadedFile {
  key?: string; // permanent storage key, resolvable via the SDK
  url?: string; // signed download URL (expires after ~30 min)
}
export type Uploader = (fileName: string, data: Buffer) => Promise<UploadedFile | undefined>;

/**
 * A payment rail runs the CROO order lifecycle in both directions:
 *
 *   SELL — external buyers order Megaphone's services (audit / kit / campaign);
 *          the rail auto-accepts, runs the matching handler, and delivers.
 *   BUY  — Megaphone hires other agents (research, fact-check, posting…) while
 *          fulfilling an order, paying each one through on-chain escrow.
 *
 * Two implementations behind one interface:
 *   - SimulatedRail: fully offline, for demos and first runs
 *   - CrooRail:      the real CROO Agent Protocol on Base
 */
export interface PaymentRail {
  readonly name: string;
  init(): Promise<void>;
  /** Register the handler that fulfils one of our own listings. */
  registerService(key: ServiceKey, handler: ServiceHandler): void;
  /** Hire an external service and wait for its delivery. */
  hire(req: HireRequest): Promise<HireResult>;
  /** Upload an artifact to CROO file storage — undefined on the sim rail. */
  readonly uploader?: Uploader;
  shutdown(): Promise<void>;
}
