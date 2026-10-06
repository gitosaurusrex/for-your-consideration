import { MEDIA_PREFIX } from '../src/shared/schema';
import type { Bindings } from './env';

export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

const TYPES = {
  jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif',
} as const;
export type ImageExt = keyof typeof TYPES;

/**
 * Identify an image by its first bytes rather than trusting a file name or header.
 * Only raster formats are accepted — SVG can carry scripts, so it's refused.
 */
export function sniffImage(bytes: Uint8Array): { ext: ImageExt; type: string } | null {
  const b = bytes;
  const ascii = (from: number, len: number) => String.fromCharCode(...b.subarray(from, from + len));
  let ext: ImageExt | null = null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) ext = 'jpg';
  else if (b[0] === 0x89 && ascii(1, 3) === 'PNG') ext = 'png';
  else if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') ext = 'webp';
  else if (ascii(0, 4) === 'GIF8') ext = 'gif';
  else if (ascii(4, 4) === 'ftyp' && /^avi[fs]$/.test(ascii(8, 4))) ext = 'avif';
  return ext ? { ext, type: TYPES[ext] } : null;
}

export class MediaError extends Error {}

/** Store image bytes under a content hash (so the same image is only stored once) and return its site path. */
export async function storeImage(env: Bindings, bytes: Uint8Array): Promise<string> {
  if (!bytes.byteLength) throw new MediaError('The file is empty.');
  if (bytes.byteLength > MAX_IMAGE_BYTES) throw new MediaError('Images must be 15 MB or smaller.');
  const kind = sniffImage(bytes);
  if (!kind) throw new MediaError('Only JPEG, PNG, WebP, GIF or AVIF images can be stored.');
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const hash = [...digest.subarray(0, 12)].map((x) => x.toString(16).padStart(2, '0')).join('');
  const key = `${hash}.${kind.ext}`;
  if (env.MEDIA) {
    if (!(await env.MEDIA.head(key))) await env.MEDIA.put(key, bytes, { httpMetadata: { contentType: kind.type } });
  } else if (env.MEDIA_KV) {
    // KV's free tier allows 1,000 writes a day, so skip images that are already stored.
    const existing = await env.MEDIA_KV.get(key, 'stream');
    if (existing) await existing.cancel();
    else await env.MEDIA_KV.put(key, bytes, { metadata: { type: kind.type } });
  } else {
    throw new MediaError('Image storage isn\'t set up (no R2 bucket or KV namespace). Link images instead.');
  }
  return `${MEDIA_PREFIX}${key}`;
}

/** Download an image from another site and keep a copy. */
export async function importImage(env: Bindings, url: string): Promise<string> {
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new MediaError('Not a valid link.'); }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new MediaError('Only http(s) links can be copied.');
  const res = await fetch(parsed, { headers: { 'User-Agent': 'TheStacks/1.0 (+image copy)', Accept: 'image/*' }, redirect: 'follow' });
  if (!res.ok) throw new MediaError(`The image link answered ${res.status}.`);
  const declared = Number(res.headers.get('content-length') ?? 0);
  if (declared > MAX_IMAGE_BYTES) throw new MediaError('That image is larger than 15 MB.');
  return storeImage(env, new Uint8Array(await res.arrayBuffer()));
}

/** Public GET /media/<key>. Keys are content hashes, so responses can be cached forever. */
export async function serveImage(env: Bindings, key: string, req: Request): Promise<Response> {
  if (!/^[a-f0-9]{24}\.(jpg|png|webp|gif|avif)$/.test(key)) return new Response('Not found', { status: 404 });
  const headers = new Headers();
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('X-Content-Type-Options', 'nosniff');
  if (env.MEDIA) {
    const obj = await env.MEDIA.get(key, { onlyIf: req.headers });
    if (!obj) return new Response('Not found', { status: 404 });
    obj.writeHttpMetadata(headers);
    headers.set('etag', obj.httpEtag);
    if (!('body' in obj)) return new Response(null, { status: 304, headers });
    return new Response(obj.body, { headers });
  }
  if (env.MEDIA_KV) {
    // The key is a content hash, so it doubles as the ETag.
    const etag = `"${key}"`;
    headers.set('etag', etag);
    if (req.headers.get('If-None-Match') === etag) return new Response(null, { status: 304, headers });
    const { value, metadata } = await env.MEDIA_KV.getWithMetadata<{ type?: string }>(key, 'stream');
    if (!value) return new Response('Not found', { status: 404 });
    headers.set('content-type', metadata?.type ?? 'application/octet-stream');
    return new Response(value, { headers });
  }
  return new Response('Not found', { status: 404 });
}
