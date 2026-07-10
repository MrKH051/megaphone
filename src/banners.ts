import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { config } from './config.js';
import { emit } from './bus.js';
import type { Uploader } from './rail/types.js';

/**
 * BANNER HOSTING — hand customers a LINK, not a wall of raw SVG.
 *
 * The promo banner used to be dumped into the deliverable as an inline SVG
 * string, which buries the readable part of the delivery under thousands of
 * characters of XML. Instead we save it to a statically-served file and put a
 * clean clickable URL in the deliverable. In croo mode the banner is ALSO
 * shipped to CROO file storage as a PNG, so the buyer's link doesn't depend
 * on Megaphone's own dashboard server being reachable.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BANNER_DIR = path.join(__dirname, '..', 'public', 'banners');

/** Save an SVG banner to a served file and return its public URL. */
export function saveBanner(svg: string): string {
  fs.mkdirSync(BANNER_DIR, { recursive: true });
  const id = randomUUID().slice(0, 12);
  fs.writeFileSync(path.join(BANNER_DIR, `${id}.svg`), svg);
  return `${config.publicUrl}/banners/${id}.svg`;
}

export interface HostedBanner {
  localUrl: string; // dashboard copy — always present
  downloadUrl?: string; // CROO signed URL (PNG), valid ~30 min
  fileKey?: string; // permanent CROO storage key
}

/**
 * Host a banner: always keep the local SVG for the dashboard; when the rail
 * provides an uploader (croo mode), also convert it to PNG and push it to
 * CROO file storage (storage rejects .svg — png/jpg/pdf/txt/json only).
 * Conversion or upload failure degrades gracefully to the local link.
 */
export async function hostBanner(svg: string, uploader?: Uploader): Promise<HostedBanner> {
  const localUrl = saveBanner(svg);
  if (!uploader) return { localUrl };
  try {
    // Dynamic import so the sim rail never loads the native resvg module.
    const { Resvg } = await import('@resvg/resvg-js');
    const font = process.env.BANNER_FONT ?? 'Arial';
    const png = new Resvg(svg, {
      fitTo: { mode: 'width', value: 2400 }, // 2x the 1200x630 SVG for crisp text
      font: { loadSystemFonts: true, defaultFontFamily: font, sansSerifFamily: font },
    })
      .render()
      .asPng();
    const uploaded = await uploader(`banner-${randomUUID().slice(0, 12)}.png`, Buffer.from(png));
    return { localUrl, downloadUrl: uploaded?.url, fileKey: uploaded?.key };
  } catch (err) {
    emit({ type: 'log', level: 'warn', message: `Banner PNG hosting failed — using local link (${String(err)})` });
    return { localUrl };
  }
}
