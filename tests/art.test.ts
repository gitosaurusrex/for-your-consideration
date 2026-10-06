import { afterEach, describe, expect, it, vi } from 'vitest';
import { fillPerson, findArt, rankWikiPages, shortBio } from '../worker/art';
import { fillDoc } from '../worker/translate';

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

  it('offers headshots only (bios come from Fill in missing)', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: URL | string) => {
      const url = new URL(String(input));
      calls.push(url.pathname);
      return new Response(JSON.stringify({ results: [{ id: 525, name: 'Christopher Nolan', profile_path: '/nolan.jpg', known_for_department: 'Directing', known_for: [{ title: 'Inception' }] }] }));
    }));
    const [c] = await findArt({ TMDB_API_KEY: 'k' } as never, 'person', { id: 'christopher-nolan', name: { en: 'Christopher Nolan' } });
    expect(c.fields).toEqual({ photo: 'https://image.tmdb.org/t/p/w342/nolan.jpg' });
    expect(c.detail).toBe('Directing · Inception');
    // Just the search: no per-person details calls for bios.
    expect(calls).toEqual(['/3/search/person']);
  });
});

describe('bios from TMDB (Fill in missing)', () => {
  afterEach(() => vi.unstubAllGlobals());
  const credits = [{ title: 'Inception', tmdb_id: '27205', kind: 'film' }];
  const tmdbNolan = (byLang: Record<string, string>) => vi.fn(async (input: URL | string) => {
    const url = new URL(String(input));
    const json = (b: unknown) => new Response(JSON.stringify(b));
    if (url.pathname.endsWith('/search/person')) return json({ results: [{ id: 525 }] });
    const lang = url.searchParams.get('language');
    if (lang) return json({ biography: byLang[lang] ?? '' });
    return json({ id: 525, name: 'Christopher Nolan', biography: byLang.en, combined_credits: { crew: [{ id: 27205, title: 'Inception' }] } });
  });

  it('trims each language and credits Wikipedia', async () => {
    vi.stubGlobal('fetch', tmdbNolan({ en: NOLAN_EN, 'ja-JP': NOLAN_JA }));
    const r = await fillDoc({ TMDB_API_KEY: 'k' } as never, 'person', { id: 'cn', name: { en: 'Christopher Nolan' }, photo: '/media/n.jpg' } as never, { credits });
    expect(r.patch.bio).toMatchObject({ en: expect.stringMatching(/^Christopher Edward Nolan/), ja: expect.stringMatching(/^クリストファー/) });
    expect(r.patch.bio_credit).toBe('Bio: Wikipedia via TMDB, CC BY-SA');
  });

  it('leaves out a translation when TMDB only has the English text', async () => {
    vi.stubGlobal('fetch', tmdbNolan({ en: 'A is an actor. She was born in Ohio.', 'ja-JP': 'A is an actor. She was born in Ohio.' }));
    const r = await fillDoc({ TMDB_API_KEY: 'k' } as never, 'person', { id: 'cn', name: { en: 'Christopher Nolan' }, photo: '/media/n.jpg' } as never, { credits, only: ['bio.en', 'bio.ja'] });
    expect(r.patch.bio).toEqual({ en: 'A is an actor. She was born in Ohio.' });
    expect(r.patch.bio_credit).toBe('Bio: TMDB');
  });
});

describe('fillPerson (Dashboard: fill in from TMDB)', () => {
  afterEach(() => vi.unstubAllGlobals());

  // Two TMDB people share the name; only #2 worked on the film credited here.
  const tmdbWith = (calls: string[] = []) => vi.fn(async (input: URL | string) => {
    const url = new URL(String(input));
    calls.push(url.pathname + (url.searchParams.get('language') ? '?ja' : ''));
    const json = (b: unknown) => new Response(JSON.stringify(b));
    if (url.pathname.endsWith('/search/person')) return json({ results: [{ id: 1, name: 'Chris Cooper' }, { id: 2, name: 'Chris Cooper' }] });
    if (url.pathname.endsWith('/person/1')) return json({ id: 1, name: 'Chris Cooper', profile_path: '/wrong.jpg', biography: 'A different Chris Cooper.', combined_credits: { cast: [{ id: 999, title: 'Something Else' }] } });
    if (url.pathname.endsWith('/person/2')) {
      if (url.searchParams.get('language') === 'ja-JP') return json({ biography: 'アメリカの俳優。' });
      return json({ id: 2, name: 'Chris Cooper', profile_path: '/right.jpg', biography: 'Chris Cooper is an American actor.', combined_credits: { cast: [{ id: 2501, title: 'The Bourne Identity' }] } });
    }
    return new Response('nope', { status: 404 });
  });
  const env = { TMDB_API_KEY: 'k' } as never;
  const person = { id: 'chris-cooper', name: { en: 'Chris Cooper' } };

  it('picks the TMDB person whose credits match, not just the first name match', async () => {
    vi.stubGlobal('fetch', tmdbWith());
    const out = await fillPerson(env, person, [{ title: 'The Bourne Identity', tmdb_id: '2501', kind: 'film' }]);
    expect(out.photo).toBe('https://image.tmdb.org/t/p/w342/right.jpg');
    expect(out.bio).toEqual({ en: 'Chris Cooper is an American actor.', ja: 'アメリカの俳優。' });
  });

  it('matches on the title when the item has no TMDB id', async () => {
    vi.stubGlobal('fetch', tmdbWith());
    const out = await fillPerson(env, person, [{ title: 'the bourne identity', kind: 'film' }]);
    expect(out.photo).toBe('https://image.tmdb.org/t/p/w342/right.jpg');
  });

  it('refuses to guess when no credits match', async () => {
    vi.stubGlobal('fetch', tmdbWith());
    await expect(fillPerson(env, person, [{ title: 'Unrelated Film', kind: 'film' }])).rejects.toThrow(/No TMDB person with matching credits/);
  });

  it('only fills what is empty', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', tmdbWith(calls));
    const out = await fillPerson(env, { ...person, bio: { en: 'My own words.' } }, [{ title: 'The Bourne Identity', tmdb_id: '2501', kind: 'film' }]);
    expect(out).toEqual({ photo: 'https://image.tmdb.org/t/p/w342/right.jpg' });
    expect(calls.some((c) => c.endsWith('?ja'))).toBe(false);
  });
});

// What Wikipedia's search returned for "Dead Space video game" (trimmed).
const WIKI = 'https://upload.wikimedia.org/wikipedia';
const DEAD_SPACE_PAGES = [
  { index: 1, title: 'Dead Space', description: 'Video game series', original: { source: `${WIKI}/commons/8/8a/Dead_Space_logo_%282023%29.svg?utm_source=en.wikipedia.org` } },
  { index: 2, title: 'Dead Space (2008 video game)', description: 'Survival horror game', original: { source: `${WIKI}/en/5/57/Dead_Space_Box_Art.jpg?utm_source=en.wikipedia.org` }, thumbnail: { source: `${WIKI}/en/thumb/5/57/Dead_Space_Box_Art.jpg/250px-Dead_Space_Box_Art.jpg?utm_source=x` } },
  { index: 3, title: 'Dead Space (2023 video game)', description: 'Video game remake', original: { source: `${WIKI}/en/3/36/Dead_Space_2022_Teaser_Art.jpg` } },
  { index: 4, title: 'Dead Space 2', description: '2011 video game', original: { source: `${WIKI}/en/0/0c/Dead_Space_2_Box_Art.jpg` } },
  { index: 5, title: 'Dead Space: Martyr', description: '2010 novel' },
];

describe('rankWikiPages', () => {
  it('puts the game from the release year first and drops series logos and pages without images', () => {
    const ranked = rankWikiPages(DEAD_SPACE_PAGES, 'Dead Space', 2008).map((p) => p.title);
    expect(ranked[0]).toBe('Dead Space (2008 video game)');
    expect(ranked).not.toContain('Dead Space');
    expect(ranked).not.toContain('Dead Space: Martyr');
  });
  it('prefers the year it was asked for', () => {
    expect(rankWikiPages(DEAD_SPACE_PAGES, 'Dead Space', 2011)[0].title).toBe('Dead Space 2');
  });
});

describe('Find art for a game', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('offers Wikipedia box art without any keys', async () => {
    const fetchMock = vi.fn(async (_input: URL | string, _init?: RequestInit) => new Response(JSON.stringify({ query: { pages: DEAD_SPACE_PAGES } })));
    vi.stubGlobal('fetch', fetchMock);
    const [c] = await findArt({} as never, 'item', { id: 'dead-space', kind: 'game', title: { en: 'Dead Space' }, release_us: '2008-10-14' } as never);
    expect(c).toMatchObject({
      source: 'Wikipedia',
      label: 'Dead Space (2008 video game)',
      preview: `${WIKI}/en/thumb/5/57/Dead_Space_Box_Art.jpg/250px-Dead_Space_Box_Art.jpg`,
      fields: { cover: `${WIKI}/en/5/57/Dead_Space_Box_Art.jpg` },
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(new URL(String(url)).searchParams.get('pilicense')).toBe('any');
    expect((init?.headers as Record<string, string>)['User-Agent']).toMatch(/TheStacks/);
  });

  it('says so when Wikipedia is rate-limiting', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 429 })));
    await expect(findArt({} as never, 'item', { id: 'x', kind: 'game', title: { en: 'X' } } as never)).rejects.toThrow(/busy/);
  });
});
