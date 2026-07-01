import { config } from './config.js';

interface LlmOptions {
  temperature?: number;
  maxTokens?: number;
}

/**
 * Calls the shared AI brain (an OpenAI-compatible chat endpoint, Groq by default).
 *
 * If no API key is configured we fall back to an offline "demo brain" so the whole
 * system still runs end-to-end with zero setup. Add LLM_API_KEY to .env for real output.
 */
export async function llm(system: string, user: string, opts: LlmOptions = {}): Promise<string> {
  if (!config.llm.apiKey) {
    return demoBrain(system, user);
  }

  const res = await fetch(`${config.llm.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.llm.apiKey}`,
    },
    body: JSON.stringify({
      model: config.llm.model,
      temperature: opts.temperature ?? 0.5,
      max_tokens: opts.maxTokens ?? 1400,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LLM request failed (${res.status}): ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content?.trim() ?? '';
}

/**
 * Ask the brain for strict JSON and parse it. Retries once with a "JSON only"
 * nudge if the first reply isn't parseable. Falls back to `fallback` on failure.
 */
export async function llmJson<T>(system: string, user: string, fallback: T, opts: LlmOptions = {}): Promise<T> {
  const jsonSystem = `${system}\nReply with a single valid JSON object and nothing else — no markdown fences, no commentary.`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await llm(jsonSystem, attempt === 0 ? user : `${user}\n\nIMPORTANT: valid JSON only.`, opts);
    const parsed = extractJson<T>(raw);
    if (parsed !== undefined) return parsed;
  }
  return fallback;
}

function extractJson<T>(raw: string): T | undefined {
  const stripped = raw.replace(/^```(?:json)?/m, '').replace(/```\s*$/m, '').trim();
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start === -1 || end <= start) return undefined;
  try {
    return JSON.parse(stripped.slice(start, end + 1)) as T;
  } catch {
    return undefined;
  }
}

/**
 * A tiny offline stand-in so the app works without any API key.
 */
function demoBrain(system: string, user: string): string {
  const tag = '[demo brain — set a free LLM_API_KEY in .env for real AI output]';
  const s = system.toLowerCase();
  if (s.includes('json')) {
    // Covers the keys of every llmJson() prompt in the app so the offline
    // demo produces a complete (clearly labelled) deliverable.
    return JSON.stringify({
      issues: [
        `Demo issue: the first sentence buries the benefit. ${tag}`,
        'Demo issue: no example input/output, so buyers cannot predict what they get.',
        'Demo issue: price is not justified against cheaper look-alikes.',
      ],
      rewriteName: 'Sharper Listing Name (demo)',
      rewriteDescription: `A benefit-first rewrite of the listing would appear here, stating the exact input and output. ${tag}`,
      pricingAdvice: `Pricing guidance versus real competitors would appear here. ${tag}`,
      score: 55,
      thread: [
        `Hook tweet introducing the agent (demo). ${tag}`,
        'Tweet 2: what it does, in one concrete example (demo).',
        'Tweet 3: call to action → https://agent.croo.network (demo).',
      ],
      readmePitch: `## Why use this\n\nA concise README pitch would appear here. ${tag}`,
      bannerHeadline: 'Your agent, discovered.',
    });
  }
  return `${tag}\n\nResponse to: ${user.slice(0, 160)}`;
}
