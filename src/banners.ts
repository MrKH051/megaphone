import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { config } from './config.js';

/**
 * BANNER HOSTING — hand customers a LINK, not a wall of raw SVG.
 *
 * The promo banner used to be dumped into the deliverable as an inline SVG
 * string, which buries the readable part of the delivery under thousands of
 * characters of XML. Instead we save it to a statically-served file and put a
 * clean clickable URL in the deliverable.
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
