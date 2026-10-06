import type {
  Entry, Genre, GenreFields, Item, Lang, Localized, Music, MusicFields, Person, PersonFields,
  SiteFields, Title, TitleFields,
} from './types';
import siteRaw from '../content/site.json';

type Glob = Record<string, Localized<unknown>>;

const slugOf = (path: string) => path.split('/').pop()!.replace(/\.json$/, '');

/** Drop empty strings / empty arrays so a blank Japanese field falls back to English. */
function compact<T extends object>(obj: Partial<T> = {}): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== '' && v != null && !(Array.isArray(v) && v.length === 0)),
  ) as Partial<T>;
}

function load<T extends object>(glob: Glob): Entry<T>[] {
  return Object.entries(glob).map(([path, raw]) => {
    const file = raw as Localized<T>;
    const en = file.en;
    return { slug: slugOf(path), en, ja: { ...en, ...compact<T>(file.ja) } };
  });
}

const byAddedDesc = (a: Item, b: Item) => (b.en.added ?? '').localeCompare(a.en.added ?? '') || b.en.year - a.en.year;

export const titles: Title[] = load<TitleFields>(import.meta.glob('../content/titles/*.json', { eager: true, import: 'default' }))
  .map((e) => ({ ...e, section: 'watch' as const }));
export const music: Music[] = load<MusicFields>(import.meta.glob('../content/music/*.json', { eager: true, import: 'default' }))
  .map((e) => ({ ...e, section: 'listen' as const }));
export const people: Person[] = load<PersonFields>(import.meta.glob('../content/people/*.json', { eager: true, import: 'default' }));
export const genres: Genre[] = load<GenreFields>(import.meta.glob('../content/genres/*.json', { eager: true, import: 'default' }));
export const site = load<SiteFields>({ 'site.json': siteRaw as Localized<SiteFields> })[0];

export const allItems: Item[] = [...titles, ...music].sort(byAddedDesc);
titles.sort(byAddedDesc);
music.sort(byAddedDesc);

const index = <T extends { slug: string }>(list: T[]) => new Map(list.map((x) => [x.slug, x]));
const titleMap = index(titles);
const musicMap = index(music);
const personMap = index(people);
const genreMap = index(genres);

export const getTitle = (slug: string) => titleMap.get(slug);
export const getMusic = (slug: string) => musicMap.get(slug);
export const getPerson = (slug: string) => personMap.get(slug);
export const getGenre = (slug: string) => genreMap.get(slug);

export const itemPath = (item: Item) => (item.section === 'watch' ? `/title/${item.slug}` : `/music/${item.slug}`);
export const itemArt = (item: Item) => (item.section === 'watch' ? item.en.poster : item.en.cover);
export const itemKey = (item: Item) => `${item.section}:${item.slug}`;

/** People credited on an item, in billing order, with their role. */
export function creditsOf(item: Item): { slug: string; role: 'director' | 'cast' | 'artist' }[] {
  if (item.section === 'listen') return item.en.artists.map((slug) => ({ slug, role: 'artist' as const }));
  return [
    ...item.en.directors.map((slug) => ({ slug, role: 'director' as const })),
    ...(item.en.cast ?? []).map((slug) => ({ slug, role: 'cast' as const })),
  ];
}

export function worksOf(personSlug: string) {
  const directed = titles.filter((t) => t.en.directors.includes(personSlug));
  const starred = titles.filter((t) => t.en.cast?.includes(personSlug));
  const recorded = music.filter((m) => m.en.artists.includes(personSlug));
  return { directed, starred, recorded };
}

export const itemsInGenre = (genreSlug: string) => allItems.filter((i) => i.en.genres.includes(genreSlug));
export const itemsFromCountry = (code: string) => allItems.filter((i) => i.en.countries.includes(code));

/**
 * "More like this": score other items by shared people (strongest signal),
 * shared genres, same section and a similar era.
 */
export function related(item: Item, limit = 8): Item[] {
  const people = new Set(creditsOf(item).map((c) => c.slug));
  const gs = new Set(item.en.genres);
  return allItems
    .filter((o) => itemKey(o) !== itemKey(item))
    .map((o) => {
      let score = 0;
      for (const c of creditsOf(o)) if (people.has(c.slug)) score += 3;
      for (const g of o.en.genres) if (gs.has(g)) score += 2;
      if (o.section === item.section) score += 1;
      if (Math.abs(o.en.year - item.en.year) <= 5) score += 0.5;
      return { o, score };
    })
    .filter((x) => x.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.o);
}

/** Stable hue for items/people without a configured colour. */
export function hueOf(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h % 360;
}

export function itemHue(item: Item): number {
  const g = item.en.genres.map(getGenre).find((x) => x?.en.hue != null);
  const base = g?.en.hue ?? hueOf(item.slug);
  return (base + (hueOf(item.slug) % 40) - 20 + 360) % 360;
}

export function search(query: string, lang: Lang): Item[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return allItems.filter((item) => {
    const hay = [
      item.en.title, item.ja.title, String(item.en.year),
      ...creditsOf(item).flatMap((c) => { const p = getPerson(c.slug); return p ? [p.en.name, p.ja.name] : []; }),
      ...item.en.genres.flatMap((g) => { const x = getGenre(g); return x ? [x.en.name, x.ja.name] : []; }),
      item[lang].summary,
    ].join(' ').toLowerCase();
    return hay.includes(q);
  });
}
