import { afterEach, describe, expect, it, vi } from 'vitest';
import { fillPlan, planKeys } from '../src/shared/fill';
import { aiTranslate, fillDoc, gapsOf } from '../worker/translate';

/** A stand-in for Cloudflare AI: tags the text with the target language, or fails like a used-up allowance. */
function fakeAI({ failAfter = Infinity, reply }: { failAfter?: number; reply?: (text: string, to: string) => string } = {}) {
  let calls = 0;
  return {
    calls: () => calls,
    run: vi.fn(async (_model: string, input: { text: string; target_lang: string }) => {
      if (++calls > failAfter) throw new Error('4006: you have used up your daily free allocation of 10,000 neurons');
      const to = input.target_lang;
      const byLang: Record<string, string> = { th: `แปล ${input.text}`, ja: `訳 ${input.text}`, es: `ES ${input.text}` };
      return { translated_text: reply ? reply(input.text, to) : byLang[to] };
    }),
  };
}

const film = {
  id: 'memento', kind: 'film', medium: 'watch', tmdb_id: '77', year: 2000, genres: ['mystery'], directors: ['nolan'],
  title: { en: 'Memento', ja: 'メメント' },
  summary: { en: 'A man with no short-term memory hunts a killer.', ja: '記憶が続かない男が犯人を追う。' },
} as never;

afterEach(() => vi.unstubAllGlobals());

describe('fillDoc', () => {
  it('takes official titles from TMDB and AI-translates only the empty summaries', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ translations: [
      { iso_639_1: 'th', iso_3166_1: 'TH', data: { title: 'ภาพหลอนซ่อนรอยฆาตกร' } },
      { iso_639_1: 'es', iso_3166_1: 'MX', data: { title: 'Amnesia' } },
      { iso_639_1: 'es', iso_3166_1: 'ES', data: { title: '' } }, // Spain keeps the original title
      { iso_639_1: 'ja', iso_3166_1: 'JP', data: { title: 'メメント' } },
    ] }))));
    const ai = fakeAI();
    const r = await fillDoc({ TMDB_API_KEY: 'k', AI: ai } as never, 'item', film);
    expect(r.patch.title).toEqual({ en: 'Memento', ja: 'メメント', th: 'ภาพหลอนซ่อนรอยฆาตกร' });
    expect(r.patch.summary).toMatchObject({ ja: '記憶が続かない男が犯人を追う。', th: 'แปล A man with no short-term memory hunts a killer.', es: 'ES A man with no short-term memory hunts a killer.' });
    expect(r.filled).toEqual({ 'title.th': 'tmdb', 'summary.th': 'ai', 'summary.es': 'ai' });
    expect(r.patch.sources).toEqual(r.filled);
    // The existing Japanese summary was left alone, so only two AI calls.
    expect(ai.calls()).toBe(2);
  });

  it('never machine-translates titles', async () => {
    const ai = fakeAI();
    const game = { id: 'ds', kind: 'game', title: { en: 'Dead Space' }, summary: { en: 'Survival horror in space.' } } as never;
    const r = await fillDoc({ AI: ai } as never, 'item', game);
    expect(r.patch).not.toHaveProperty('title');
    expect(Object.keys(r.filled)).toEqual(['summary.ja', 'summary.th', 'summary.es']);
  });

  it('keeps flags already on the record', async () => {
    const r = await fillDoc({ AI: fakeAI() } as never, 'genre', { id: 'watch:drama', medium: 'watch', slug: 'drama', name: { en: 'Drama', ja: 'ドラマ' }, sources: { 'name.ja': 'ai' } } as never);
    expect(r.patch.sources).toEqual({ 'name.ja': 'ai', 'name.th': 'ai', 'name.es': 'ai' });
  });

  it('stops asking AI when the daily allowance runs out, keeping what it already filled', async () => {
    const r = await fillDoc({ AI: fakeAI({ failAfter: 1 }) } as never, 'genre', { id: 'g', medium: 'watch', slug: 'g', name: { en: 'Horror' } } as never);
    expect(r.filled).toEqual({ 'name.ja': 'ai' });
    expect(r.aiStopped).toMatch(/daily allowance is used up/);
  });

  it('only uses TMDB names in Thai or Japanese script for people, then AI', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: URL | string) => {
      const url = new URL(String(input));
      const json = (b: unknown) => new Response(JSON.stringify(b));
      if (url.pathname.endsWith('/search/person')) return json({ results: [{ id: 5 }] });
      return json({ id: 5, name: 'Guy Pearce', also_known_as: ['盖·皮尔斯', 'กาย เพียร์ซ'], combined_credits: { cast: [{ id: 77, title: 'Memento' }] } });
    }));
    const r = await fillDoc({ TMDB_API_KEY: 'k', AI: fakeAI() } as never, 'person', { id: 'guy-pearce', name: { en: 'Guy Pearce' }, photo: '/media/x.jpg', bio: { en: 'An actor.', ja: '俳優。', th: 'นักแสดง', es: 'Actor.' } } as never, { credits: [{ title: 'Memento', tmdb_id: '77', kind: 'film' }] });
    expect(r.patch.name).toEqual({ en: 'Guy Pearce', th: 'กาย เพียร์ซ', ja: '訳 Guy Pearce' });
    expect(r.filled).toEqual({ 'name.th': 'tmdb', 'name.ja': 'ai' });
  });
});

describe('aiTranslate', () => {
  it('rejects output that is not in the target script', async () => {
    const ai = fakeAI({ reply: (text) => text.toUpperCase() });
    expect(await aiTranslate({ AI: ai } as never, 'Drama', 'th')).toBeUndefined();
  });
  it('explains when Cloudflare AI is not set up', async () => {
    await expect(aiTranslate({} as never, 'Drama', 'es')).rejects.toThrow(/"ai" binding/);
  });
});

describe('gapsOf', () => {
  it('counts empty translations it could fill, but not titles or Spanish names', () => {
    expect(gapsOf('item', film)).toEqual(['summary.th', 'summary.es']);
    expect(gapsOf('person', { id: 'p', name: { en: 'A' } } as never)).toEqual(['name.ja', 'name.th']);
    expect(gapsOf('company', { id: 'c', name: { en: 'Konami' } } as never)).toEqual([]);
  });
});

describe('fillPlan', () => {
  it('offers a person headshot and English bio from TMDB, and translations', () => {
    const plan = fillPlan('person', { id: 'p', name: { en: 'Guy Pearce', ja: 'ガイ・ピアース' } }, true);
    expect(plan.map((r) => [r.label, r.via, r.langs])).toEqual([
      ['Headshot', 'tmdb', undefined], ['English bio', 'tmdb', ['en']], ['Name', 'translate', ['th']], ['Bio', 'translate', ['ja', 'th', 'es']],
    ]);
  });
  it('leaves out TMDB-only rows without a TMDB key, and anything already filled', () => {
    const plan = fillPlan('person', { id: 'p', name: { en: 'A', ja: 'エー', th: 'เอ' }, photo: '/media/a.jpg' }, false);
    expect(plan).toEqual([]);
  });
  it('offers official titles only for films and TV with a TMDB id', () => {
    expect(planKeys(fillPlan('item', { kind: 'film', tmdb_id: '77', title: { en: 'Memento', ja: 'メメント' }, summary: { en: 'S' } } as never, true)))
      .toEqual(['title.th', 'title.es', 'summary.ja', 'summary.th', 'summary.es']);
    expect(planKeys(fillPlan('item', { kind: 'game', title: { en: 'Dead Space' }, summary: { en: 'S', ja: 'エス' } } as never, true)))
      .toEqual(['summary.th', 'summary.es']);
  });
  it('offers nothing for studios', () => {
    expect(fillPlan('company', { id: 'c', name: { en: 'Konami' } }, true)).toEqual([]);
  });
});

describe('fillDoc for a person', () => {
  const tmdbPerson = () => vi.fn(async (input: URL | string) => {
    const url = new URL(String(input));
    const json = (b: unknown) => new Response(JSON.stringify(b));
    if (url.pathname.endsWith('/search/person')) return json({ results: [{ id: 5 }] });
    const lang = url.searchParams.get('language');
    if (lang) return json({ biography: lang === 'es-ES' ? 'Guy Pearce es un actor.' : '' });
    return json({ id: 5, name: 'Guy Pearce', profile_path: '/gp.jpg', biography: 'Guy Pearce is an actor. He was born in England.', combined_credits: { cast: [{ id: 77, title: 'Memento' }] } });
  });
  const credits = [{ title: 'Memento', tmdb_id: '77', kind: 'film' }];

  it('fills the headshot and English bio from TMDB, then translates the bio', async () => {
    vi.stubGlobal('fetch', tmdbPerson());
    const r = await fillDoc({ TMDB_API_KEY: 'k', AI: fakeAI() } as never, 'person', { id: 'gp', name: { en: 'Guy Pearce', ja: 'ガイ・ピアース', th: 'กาย เพียร์ซ' } } as never, { credits });
    expect(r.patch.photo).toBe('https://image.tmdb.org/t/p/w342/gp.jpg');
    expect(r.patch.bio).toEqual({ en: 'Guy Pearce is an actor. He was born in England.', es: 'Guy Pearce es un actor.', ja: '訳 Guy Pearce is an actor. He was born in England.', th: 'แปล Guy Pearce is an actor. He was born in England.' });
    expect(r.patch.bio_credit).toBe('Bio: TMDB');
    expect(r.filled).toEqual({ photo: 'tmdb', 'bio.en': 'tmdb', 'bio.es': 'tmdb', 'bio.ja': 'ai', 'bio.th': 'ai' });
  });

  it('fills only what was chosen', async () => {
    vi.stubGlobal('fetch', tmdbPerson());
    const ai = fakeAI();
    const r = await fillDoc({ TMDB_API_KEY: 'k', AI: ai } as never, 'person', { id: 'gp', name: { en: 'Guy Pearce' } } as never, { credits, only: ['bio.en', 'bio.th'] });
    expect(r.filled).toEqual({ 'bio.en': 'tmdb', 'bio.th': 'ai' });
    expect(r.patch).not.toHaveProperty('photo');
    expect(ai.calls()).toBe(1);
  });

  it('stores a copy of the headshot when asked to', async () => {
    vi.stubGlobal('fetch', tmdbPerson());
    const r = await fillDoc({ TMDB_API_KEY: 'k' } as never, 'person', { id: 'gp', name: { en: 'Guy Pearce' } } as never,
      { credits, only: ['photo'], copyImage: async () => '/media/abc.jpg' });
    expect(r.patch.photo).toBe('/media/abc.jpg');
  });
});
