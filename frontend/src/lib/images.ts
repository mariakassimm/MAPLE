const CLOUDINARY = '/image/upload/';

/** Adds automatic format and quality to Cloudinary URLs; any other host is returned unchanged. */
export function optimizeImage(url: string, width?: number): string {
  if (!url.includes('res.cloudinary.com') || !url.includes(CLOUDINARY)) return url;
  const t = ['f_auto', 'q_auto', width ? `w_${width}` : null, width ? 'c_limit' : null].filter(Boolean).join(',');
  return url.replace(CLOUDINARY, `${CLOUDINARY}${t}/`);
}

export function imageSrcSet(url: string, widths: number[] = [400, 800, 1200, 1600]): string | undefined {
  if (!url.includes('res.cloudinary.com')) return undefined;
  return widths.map((w) => `${optimizeImage(url, w)} ${w}w`).join(', ');
}

/* ---- Local photographs ---------------------------------------------------------------------------------------
 * `npm run images` (scripts/optimize-images.py) writes <name>-<width>.webp copies of every photograph in public/ and
 * records the original's size in imageManifest.json. The original stays the <img src> fallback. */
import manifestData from './imageManifest.json';

export interface LocalImageInfo {
  w: number;
  h: number;
  widths: number[];
}
const manifest = manifestData as Record<string, LocalImageInfo>;

export const localImageInfo = (url: string): LocalImageInfo | undefined => manifest[url];

const variant = (url: string, w: number) => url.replace(/\.[a-z]+$/i, `-${w}.webp`);

/** WebP srcset for a photograph bundled in /public, or undefined when it has no generated variants. */
export function localSrcSet(url: string): string | undefined {
  const info = manifest[url];
  if (!info) return undefined;
  return info.widths.map((w) => `${variant(url, w)} ${w}w`).join(', ');
}
