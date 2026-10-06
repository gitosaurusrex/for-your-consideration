import { describe, expect, it } from 'vitest';
import app from '../worker/index';
import { sniffImage } from '../worker/media';
import { normalize } from '../src/shared/validate';

// Smallest valid-looking headers for each format.
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const WEBP = new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 ');
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

/** In-memory stand-in for an R2 bucket. */
function fakeR2() {
  const store = new Map<string, { bytes: Uint8Array; type: string }>();
  return {
    store,
    async head(key: string) { return store.has(key) ? {} : null; },
    async put(key: string, bytes: Uint8Array, opts: { httpMetadata: { contentType: string } }) { store.set(key, { bytes, type: opts.httpMetadata.contentType }); },
    async get(key: string) {
      const o = store.get(key);
      if (!o) return null;
      return { body: o.bytes, httpEtag: '"e"', writeHttpMetadata: (h: Headers) => h.set('content-type', o.type) };
    },
  };
}

const env = (r2 = fakeR2()) => ({ MEDIA: r2, DEV_AUTH_BYPASS: 'true' }) as never;
const local = 'http://localhost:5173';

describe('sniffImage', () => {
  it('recognises raster formats by their bytes', () => {
    expect(sniffImage(PNG)?.ext).toBe('png');
    expect(sniffImage(JPG)?.ext).toBe('jpg');
    expect(sniffImage(WEBP)?.ext).toBe('webp');
  });
  it('refuses SVG and anything else', () => {
    expect(sniffImage(SVG)).toBeNull();
    expect(sniffImage(new TextEncoder().encode('hello'))).toBeNull();
  });
});

describe('upload and serve', () => {
  it('stores an image once under its content hash and serves it', async () => {
    const r2 = fakeR2();
    const e = env(r2);
    const up = await app.request(`${local}/api/admin/media`, { method: 'POST', body: PNG }, e);
    const { url } = (await up.json()) as { url: string };
    expect(url).toMatch(/^\/media\/[a-f0-9]{24}\.png$/);
    const again = (await (await app.request(`${local}/api/admin/media`, { method: 'POST', body: PNG }, e)).json()) as { url: string };
    expect(again.url).toBe(url);
    expect(r2.store.size).toBe(1);

    const res = await app.request(`${local}${url}`, {}, e);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('cache-control')).toMatch(/immutable/);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG);
  });

  it('rejects non-images, including SVG', async () => {
    const res = await app.request(`${local}/api/admin/media`, { method: 'POST', body: SVG }, env());
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/Only JPEG, PNG/);
  });

  it('requires admin login to upload', async () => {
    const res = await app.request('https://fyc.example/api/admin/media', { method: 'POST', body: PNG }, { MEDIA: fakeR2() } as never);
    expect(res.status).toBe(503);
  });

  it('404s unknown or malformed media keys', async () => {
    expect((await app.request(`${local}/media/../../secret`, {}, env())).status).toBe(404);
    expect((await app.request(`${local}/media/${'a'.repeat(24)}.png`, {}, env())).status).toBe(404);
  });
});

describe('image fields', () => {
  const film = { kind: 'film', title: 'A', summary: 'B', genres: ['drama'], year: 2020, directors: ['x'] };
  it('accept stored images and full links', () => {
    expect(normalize('item', { ...film, poster: `/media/${'a'.repeat(24)}.jpg` }).errors).toEqual([]);
    expect(normalize('item', { ...film, poster: 'https://image.tmdb.org/t/p/w780/x.jpg' }).errors).toEqual([]);
  });
  it('reject anything else', () => {
    expect(normalize('item', { ...film, poster: '/media/../x.svg' }).errors[0]).toMatch(/not a valid stored image/);
    expect(normalize('item', { ...film, poster: 'javascript:alert(1)' }).errors[0]).toMatch(/full https/);
  });
});
