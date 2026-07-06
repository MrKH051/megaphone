import process from 'node:process';

// Load variables from a local ".env" file if one exists.
// (Node 20.12+ ships this built in — no extra library needed.)
try {
  process.loadEnvFile?.();
} catch {
  // No .env file present — that's fine, we fall back to safe defaults below.
}

export type RailName = 'sim' | 'croo';

export const config = {
  port: Number(process.env.PORT ?? 4000),

  // Public base URL where this server is reachable. Used to hand customers a
  // clickable LINK to their generated banner instead of dumping raw SVG into
  // the deliverable. On the VPS, set PUBLIC_URL=http://<host>:4000 in .env.
  publicUrl: (process.env.PUBLIC_URL ?? `http://localhost:${Number(process.env.PORT ?? 4000)}`).replace(/\/$/, ''),

  // Which payment rail to use:
  //   "sim"  -> simulated escrow, runs fully offline (great for demos / first run)
  //   "croo" -> real CROO Agent Protocol on Base
  rail: (process.env.RAIL ?? 'sim') as RailName,

  // Optional token protecting the /api/demo endpoint (recommended in croo mode,
  // since a demo order spends real USDC on hires).
  adminToken: process.env.MEGAPHONE_ADMIN_TOKEN ?? '',

  // The AI brain: any OpenAI-compatible chat endpoint (Groq by default — free & fast).
  llm: {
    baseUrl: process.env.LLM_BASE_URL ?? 'https://api.groq.com/openai/v1',
    model: process.env.LLM_MODEL ?? 'llama-3.3-70b-versatile',
    apiKey: process.env.LLM_API_KEY ?? '',
  },

  croo: {
    apiUrl: process.env.CROO_API_URL ?? 'https://api.croo.network',
    wsUrl: process.env.CROO_WS_URL ?? 'wss://api.croo.network/ws',
    rpcUrl: process.env.CROO_RPC_URL || undefined,

    // Megaphone is ONE agent that both sells and buys — a single SDK key.
    sdkKey: process.env.CROO_MEGAPHONE_SDK_KEY ?? '',

    // Our own three listings on the CROO Agent Store (from the dashboard).
    serviceIds: {
      audit: process.env.CROO_AUDIT_SERVICE_ID ?? '',
      kit: process.env.CROO_KIT_SERVICE_ID ?? '',
      campaign: process.env.CROO_CAMPAIGN_SERVICE_ID ?? '',
    } as Record<'audit' | 'kit' | 'campaign', string>,

    // USDC deposited into Megaphone's wallet (dashboard display only).
    startBalance: Number(process.env.CROO_START_BALANCE ?? 2),
  },

  hires: {
    // Never hire a service listed above this price (USDC) — keeps unit costs tiny.
    maxPrice: Number(process.env.MEGAPHONE_MAX_HIRE_PRICE ?? 0.15),
    // Skip our own listings and (optionally) sibling agents to avoid self-trading.
    excludeAgentIds: (process.env.MEGAPHONE_EXCLUDE_AGENT_IDS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    // Pin a specific external serviceId per role (optional overrides).
    pinned: {
      research: process.env.MEGAPHONE_RESEARCH_SERVICE_ID ?? '',
      factcheck: process.env.MEGAPHONE_FACTCHECK_SERVICE_ID ?? '',
      summarize: process.env.MEGAPHONE_SUMMARIZE_SERVICE_ID ?? '',
      post: process.env.MEGAPHONE_POST_SERVICE_ID ?? '',
    } as Record<string, string>,
  },
};
