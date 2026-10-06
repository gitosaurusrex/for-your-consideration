import { afterEach, describe, expect, it, vi } from 'vitest';
import { findArt, shortBio } from '../worker/art';

const NOLAN_EN = 'Christopher Edward Nolan is a British and American filmmaker. Known for his Hollywood blockbusters with complex storytelling, he is considered a leading filmmaker of the 21st century. His films have grossed over $6 billion worldwide. He was born in London.\n\nNolan developed an interest in filmmaking from a young age.\n\nDescription above from the Wikipedia article Christopher Nolan, licensed under CC-BY-SA.';
const NOLAN_JA = 'クリストファー・ノーランは、イギリス出身の映画監督。複雑な構成の作品で知られる。21世紀を代表する映画監督の一人とされる。ロンドン生まれ。';

describe('shortBio', () => {
  it('keeps the opening sentences and drops Wikipedia boilerplate', () => {
    const bio = shortBio(NOLAN_EN, 'en')!;
    expect(bio.startsWith('Christopher Edward Nolan is a British and American filmmaker.')).toBe(true);
    expect(bio).not.toMatch(/Wikipedia|young age/);
    expect(bio.length).toBeLessThanOrEqual(450);
  });
  it('splits Japanese on 。 and stops at three sentences', () => {
    expect(shortBio(NOLAN_JA, 'ja')).toBe('クリストファー・ノーランは、イギリス出身の映画監督。複雑な構成の作品で知られる。21世紀を代表する映画監督の一人とされる。');
  });
  it('returns nothing for an empty bio', () => {
    expect(shortBio('', 'en')).toBeUndefined();
    expect(shortBio(undefined, 'ja')).toBeUndefined();
  });
});

describe('Find art for a person', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('offers the photo and a short bio in both languages, with a credit', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: URL | string) => {
      const url = new URL(String(input));
      const json = (b: unknown) => new Response(JSON.stringify(b), { headers: { 'content-type': 'application/json' } });
      if (url.pathname.endsWith('/search/person')) return json({ results: [{ id: 525, name: 'Christopher Nolan', profile_path: '/nolan.jpg', known_for_department: 'Directing', known_for: [{ title: 'Inception' }] }] });
      if (url.pathname.endsWith('/person/525')) return json({ biography: url.searchParams.get('language') === 'ja-JP' ? NOLAN_JA : NOLAN_EN });
      return new Response('not found', { status: 404 });
    }));
    const [c] = await findArt({ TMDB_API_KEY: 'k' } as never, 'person', { id: 'christopher-nolan', name: { en: 'Christopher Nolan' } });
    expect(c.fields.photo).toBe('https://image.tmdb.org/t/p/w342/nolan.jpg');
    expect(c.fields.bio).toMatchObject({ en: expect.stringMatching(/^Christopher Edward Nolan/), ja: expect.stringMatching(/^クリストファー/) });
    expect(c.fields.bio_credit).toBe('Bio: Wikipedia via TMDB, CC BY-SA');
    expect(c.detail).toMatch(/\+ bio/);
  });

  it('leaves out Japanese when TMDB only has the English text', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: URL | string) => {
      const url = new URL(String(input));
      const json = (b: unknown) => new Response(JSON.stringify(b));
      if (url.pathname.endsWith('/search/person')) return json({ results: [{ id: 1, name: 'A', profile_path: '/a.jpg' }] });
      return json({ biography: 'A is an actor. She was born in Ohio.' });
    }));
    const [c] = await findArt({ TMDB_API_KEY: 'k' } as never, 'person', { id: 'a', name: { en: 'A' } });
    expect(c.fields.bio).toEqual({ en: 'A is an actor. She was born in Ohio.' });
    expect(c.fields.bio_credit).toBe('Bio: TMDB');
  });
});
