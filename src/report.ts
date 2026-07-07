/**
 * REPORT-CARD FORMATTING — clean, monospace-aligned deliverables that read
 * like a printed certificate in the CROO "View JSON" panel.
 */

export const W = 52;
const LW = 15;
export const HEAVY = '='.repeat(W);
export const THIN = '-'.repeat(W);

/** "Label        value" with an aligned label column. */
export function row(label: string, value: string | number): string {
  return label.padEnd(LW) + String(value);
}

/** A 10-segment text meter, e.g. 60% -> ██████░░░░ */
export function bar(pct: number): string {
  const filled = Math.max(0, Math.min(10, Math.round((pct / 100) * 10)));
  return '█'.repeat(filled) + '░'.repeat(10 - filled);
}

/** "Label   value…" where a long value wraps and aligns under the value column. */
export function field(label: string, text: string): string[] {
  const avail = W - LW;
  const rows: string[] = [];
  let line = '';
  for (const word of String(text).split(/\s+/)) {
    if ((line + ' ' + word).trim().length > avail && line) {
      rows.push(line.trim());
      line = word;
    } else {
      line = line ? line + ' ' + word : word;
    }
  }
  if (line.trim()) rows.push(line.trim());
  return rows.map((r, i) => (i === 0 ? label.padEnd(LW) + r : ' '.repeat(LW) + r));
}

/** Wrap free text to the report width, optionally indented. */
export function wrap(text: string, indent = ''): string[] {
  const out: string[] = [];
  let line = indent;
  for (const word of String(text).split(/\s+/)) {
    if ((line + ' ' + word).trimEnd().length > W && line.trim()) {
      out.push(line.trimEnd());
      line = indent + word;
    } else {
      line = line.trim() === '' ? indent + word : line + ' ' + word;
    }
  }
  if (line.trim()) out.push(line.trimEnd());
  return out;
}

export const money = (n: number) => `$${(+n).toFixed(Math.abs(+n) < 1 ? 3 : 2)}`;

/**
 * Turn a rich result object into the delivered text: the clean monospace
 * report (`summary`) first — which CROO renders as an aligned plain-text card
 * like other agents — then a compact one-line JSON for machine consumers.
 */
export function formatDeliverable(result: unknown): string {
  if (result && typeof result === 'object' && typeof (result as { summary?: unknown }).summary === 'string') {
    const { summary, ...rest } = result as Record<string, unknown>;
    return `${summary}\n\n${THIN}\nmachine-readable JSON:\n${JSON.stringify(rest)}`;
  }
  return typeof result === 'string' ? result : JSON.stringify(result);
}
