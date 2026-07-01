/**
 * CODE-GENERATED PROMO BANNER (SVG) — zero-cost, no image agent needed.
 *
 * Produces a clean 1200x630 (X/OG card size) banner personalized for the
 * customer's agent. Shipped as an SVG string inside the deliverable; it
 * renders in any browser and converts to PNG with one screenshot.
 */

export interface BannerInput {
  agentName: string;
  headline: string; // short value proposition
  price: string; // e.g. "$0.10 USDC"
  stat?: string; // e.g. "100% completion · 57 orders"
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Wrap a headline into <=3 lines of roughly even length. */
function wrap(text: string, maxChars = 26): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > maxChars && line) {
      lines.push(line.trim());
      line = w;
    } else {
      line = (line + ' ' + w).trim();
    }
  }
  if (line) lines.push(line.trim());
  return lines.slice(0, 3);
}

export function makeBanner(input: BannerInput): string {
  const lines = wrap(input.headline);
  const headlineSvg = lines
    .map(
      (l, i) =>
        `<text x="80" y="${300 + i * 72}" font-size="58" font-weight="800" fill="#eafbe7" font-family="Segoe UI, Arial, sans-serif">${esc(l)}</text>`,
    )
    .join('\n    ');

  return `<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#07130a"/>
      <stop offset="100%" stop-color="#0d2b16"/>
    </linearGradient>
    <linearGradient id="glow" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#3ef06b"/>
      <stop offset="100%" stop-color="#b7ff5e"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <circle cx="1050" cy="90" r="260" fill="#1a4d28" opacity="0.35"/>
  <circle cx="1120" cy="560" r="180" fill="#1a4d28" opacity="0.25"/>
  <text x="80" y="120" font-size="30" font-weight="700" fill="#7de99a" letter-spacing="6" font-family="Segoe UI, Arial, sans-serif">AI AGENT · CROO STORE</text>
  <text x="80" y="200" font-size="72" font-weight="900" fill="url(#glow)" font-family="Segoe UI, Arial, sans-serif">${esc(input.agentName)}</text>
    ${headlineSvg}
  <rect x="80" y="490" rx="14" width="${Math.max(220, input.price.length * 22 + 60)}" height="64" fill="#3ef06b"/>
  <text x="110" y="533" font-size="32" font-weight="800" fill="#07130a" font-family="Segoe UI, Arial, sans-serif">${esc(input.price)}</text>
  ${input.stat ? `<text x="${Math.max(220, input.price.length * 22 + 60) + 110}" y="531" font-size="26" fill="#9fd8ae" font-family="Segoe UI, Arial, sans-serif">${esc(input.stat)}</text>` : ''}
  <text x="1120" y="600" text-anchor="end" font-size="22" fill="#6aa87c" font-family="Segoe UI, Arial, sans-serif">made by Megaphone 📣 — the growth agency for agents</text>
</svg>`;
}
