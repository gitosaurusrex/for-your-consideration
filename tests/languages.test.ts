import { afterEach, describe, expect, it, vi } from 'vitest';
import { graphemes, greetingWords } from '../src/pages/Home';
import { DEFAULT_SETTINGS, LANGS, PERIODS } from '../src/shared/schema';
import { normalize } from '../src/shared/validate';
import { findArt, shortBio } from '../worker/art';
import { getSettings } from '../worker/db';

const film = { kind: 'film', summary: 'B', genres: ['drama'], year: 2020, directors: ['x'] };

describe('translated fields', () => {
  it('accept Thai and Spanish alongside English and Japanese', () => {
    const { doc, errors } = normalize('item', { ...film, title: { en: 'Memento', ja: 'メメント', th: 'ภาพหลอนซ่อนรอยฆาตกร', es: 'Memento' } });
    expect(errors).toEqual([]);
    expect(doc).toMatchObject({ title: { en: 'Memento', ja: 'メメント', th: 'ภาพหลอนซ่อนรอยฆาตกร', es: 'Memento' } });
  });
  it('need English, and say which languages were given', () => {
    const { errors } = normalize('item', { ...film, title: { th: 'ไทย', es: 'Hola' } });
    expect(errors[0]).toMatch(/has Thai and Spanish but no English/);
  });
  it('warn about an unknown language code', () => {
    const { warnings } = normalize('item', { ...film, title: { en: 'A', ja: 'エー', fr: 'Un' } });
    expect(warnings).toContain('unknown language "title.fr" was ignored (use en, ja, th, es)');
  });
  it('only nudge about missing Japanese; Thai and Spanish are optional', () => {
    const { warnings } = normalize('item', { ...film, title: { en: 'A', ja: 'エー' }, summary: { en: 'B', ja: 'ビー' } });
    expect(warnings).toEqual([]);
  });
});

describe('default home page text', () => {
  it('has every greeting, the intro and the sign-off in every language', () => {
    for (const k of [...PERIODS, 'intro', 'signoff'] as const) for (const l of LANGS) expect(DEFAULT_SETTINGS.text[k][l], `${k}.${l}`).toBeTruthy();
  });
  it('stays friendly without romantic wording in any language', () => {
    expect(JSON.stringify(DEFAULT_SETTINGS.text)).not.toMatch(/love|♡|愛|あなた|darling|dear|amor|cariño|querid|รัก/i);
  });
});

describe('saved home page text', () => {
  const db = (rows: { key: string; value: string }[]) => ({ prepare: () => ({ all: async () => ({ results: rows }) }) }) as never;

  it('picks up new translations when the text was never edited', async () => {
    // Saved before Thai and Spanish existed: same English as the default.
    const s = await getSettings(db([{ key: 'text', value: JSON.stringify({ morning: { en: 'Good morning', ja: 'おはようございます' } }) }]));
    expect(s.text.morning.th).toBe('สวัสดีตอนเช้า');
    expect(s.text.morning.es).toBe('Buenos días');
  });
  it('keeps edited text as written (English shows where there is no translation)', async () => {
    const s = await getSettings(db([{ key: 'text', value: JSON.stringify({ morning: { en: 'Morning!', ja: 'おはよう！' } }) }]));
    expect(s.text.morning).toEqual({ en: 'Morning!', ja: 'おはよう！' });
  });
});

describe('Thai and Spanish in the greeting', () => {
  it('keeps Thai vowel and tone marks with their letters', () => {
    const chars = graphemes('สวัสดีตอนเช้า');
    // A wave letter must never start with a combining mark (it would float away from its letter).
    for (const c of chars) expect(c).not.toMatch(/^\p{M}/u);
    expect(chars.join('')).toBe('สวัสดีตอนเช้า');
    expect(chars.length).toBeLessThan('สวัสดีตอนเช้า'.length);
  });
  it('keeps Spanish words whole', () => {
    expect(greetingWords('Buenas noches').map((w) => w.text)).toEqual(['Buenas', 'noches']);
  });
});

describe('bios in Thai and Spanish', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('trims Spanish at sentence ends, including ones that start with ¿ or an accent', () => {
    const bio = shortBio('Ana es actriz. Él la conoce. ¿Quién no? Óscar también. Fin.', 'es');
    expect(bio).toBe('Ana es actriz. Él la conoce. ¿Quién no?');
  });
  it('trims Thai at the spaces between phrases', () => {
    const phrase = 'นักแสดงชาวอเมริกัน';
    const bio = shortBio(Array(30).fill(phrase).join(' '), 'th')!;
    expect(bio.length).toBeLessThanOrEqual(260);
    expect(bio.split(' ').every((p) => p === phrase)).toBe(true);
  });
  it('Find art brings each translation TMDB has', async () => {
    const bios: Record<string, string> = { '': 'Ana is an actor. She lives in Ohio.', 'ja-JP': '', 'th-TH': 'อานาเป็นนักแสดง', 'es-ES': 'Ana es actriz.' };
    vi.stubGlobal('fetch', vi.fn(async (input: URL | string) => {
      const url = new URL(String(input));
      const json = (b: unknown) => new Response(JSON.stringify(b));
      if (url.pathname.endsWith('/search/person')) return json({ results: [{ id: 7, name: 'Ana', profile_path: '/a.jpg' }] });
      return json({ biography: bios[url.searchParams.get('language') ?? ''] });
    }));
    const [c] = await findArt({ TMDB_API_KEY: 'k' } as never, 'person', { id: 'ana', name: { en: 'Ana' } });
    expect(c.fields.bio).toEqual({ en: 'Ana is an actor. She lives in Ohio.', th: 'อานาเป็นนักแสดง', es: 'Ana es actriz.' });
  });
});
