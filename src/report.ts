/**
 * REPORT-CARD FORMATTING — clean, monospace-aligned deliverables that read
 * like a printed certificate in the CROO "View JSON" panel.
 */

export const W = 68;
const LW = 15;
export const HEAVY = '='.repeat(W);
export const THIN = '-'.repeat(W);

/** A numbered section header, e.g. "[ 1 ]  X / TWITTER THREAD  —  post in order". */
export function section(n: number, title: string, hint = ''): string[] {
  return ['', `[ ${n} ]  ${title.toUpperCase()}${hint ? `  —  ${hint}` : ''}`, THIN];
}

/**
 * Emit text EXACTLY as written — newlines kept, nothing re-flowed.
 *
 * Anything the customer is meant to copy (tweets, Markdown) must go through
 * here, never through wrap(): re-wrapping injects line breaks that survive the
 * paste and break the asset.
 */
export function verbatim(text: string, indent = ''): string[] {
  return String(text)
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => (line.trim() ? indent + line : ''));
}

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
 * Turn a rich result object into the text CROO delivers to the buyer.
 *
 * This is the ONLY thing the customer sees on the CROO platform, so it ships
 * the human report and nothing else. We used to append the whole result object
 * as "machine-readable JSON" — for a campaign that is the full audit, kit, and
 * store snapshot, tens of KB of noise below the report, and enough to risk the
 * deliverableText size cap that would make the delivery fail outright.
 * Machine consumers read the same object from /api/deliverable instead.
 */
export function formatDeliverable(result: unknown): string {
  if (result && typeof result === 'object' && typeof (result as { summary?: unknown }).summary === 'string') {
    return (result as { summary: string }).summary;
  }
  return typeof result === 'string' ? result : JSON.stringify(result);
}
