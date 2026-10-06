import { hasText, LANG_INFO, LANGS, sourceKey, TRANSLATIONS, type AnyDoc, type EntityType, type I18n, type ItemDoc, type Lang, type PersonDoc, type Sources } from '../src/shared/schema';
import type { Bindings } from './env';

/** One possible piece of artwork; `fields` is what gets filled in if it's chosen. */
export interface ArtCandidate {
  source: 'TMDB' | 'Wikipedia' | 'Spotify';
  label: string;
  detail?: string;
  preview: string;
  fields: Record<string, string>;
}

export class ArtError extends Error {}

export const TMDB_IMG = 'https://image.tmdb.org/t/p';

export function artStatus(env: Bindings) {
  return { tmdb: !!env.TMDB_API_KEY, wikipedia: true, spotify: true, ai: !!env.AI };
}

export async function tmdb(env: Bindings, path: string, params: Record<string, string | number | undefined> = {}) {
  if (!env.TMDB_API_KEY) throw new ArtError('TMDB isn\'t set up yet — add the TMDB_API_KEY secret (see README → Artwork).');
  const url = new URL(`https://api.themoviedb.org/3${path}`);
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') url.searchParams.set(k, String(v));
  const headers: Record<string, string> = { accept: 'application/json' };
  if (env.TMDB_API_KEY.startsWith('eyJ')) headers.authorization = `Bearer ${env.TMDB_API_KEY}`;
  else url.searchParams.set('api_key', env.TMDB_API_KEY);
  const res = await fetch(url, { headers });
  if (!res.ok) throw new ArtError(`TMDB answered ${res.status}${res.status === 401 ? ' — check the TMDB_API_KEY secret' : ''}.`);
  return res.json() as Promise<Record<string, any>>;
}

const year = (d?: string) => (d ? d.slice(0, 4) : '');

async function filmOrTv(env: Bindings, item: ItemDoc): Promise<ArtCandidate[]> {
  const type = item.kind === 'tv' ? 'tv' : 'movie';
  const toCandidate = (r: Record<string, any>, detail?: string): ArtCandidate | null => r.poster_path ? {
    source: 'TMDB',
    label: `${r.title ?? r.name} (${year(r.release_date ?? r.first_air_date)})`,
    detail: detail ?? (r.original_title && r.original_title !== r.title ? r.original_title : r.original_name !== r.name ? r.original_name : undefined),
    preview: `${TMDB_IMG}/w185${r.poster_path}`,
    fields: {
      poster: `${TMDB_IMG}/w780${r.poster_path}`,
      ...(r.backdrop_path ? { backdrop: `${TMDB_IMG}/w1280${r.backdrop_path}` } : {}),
      tmdb_id: String(r.id),
    },
  } : null;

  if (item.tmdb_id) {
    // Known title: offer its alternative posters too, including Japanese ones.
    const [details, images] = await Promise.all([
      tmdb(env, `/${type}/${item.tmdb_id}`),
      tmdb(env, `/${type}/${item.tmdb_id}/images`, { include_image_language: 'en,ja,null' }),
    ]);
    const main = toCandidate(details, 'Main poster');
    const alts = ((images.posters ?? []) as Record<string, any>[])
      .filter((p) => p.file_path !== details.poster_path)
      .slice(0, 11)
      .map((p) => toCandidate({ ...details, poster_path: p.file_path }, p.iso_639_1 === 'ja' ? '日本版ポスター · Japanese poster' : p.iso_639_1 ? `Poster (${p.iso_639_1})` : 'Textless poster'));
    return [main, ...alts].filter((c): c is ArtCandidate => !!c);
  }

  const yearKey = type === 'tv' ? 'first_air_date_year' : 'primary_release_year';
  let { results } = await tmdb(env, `/search/${type}`, { query: item.title?.en, [yearKey]: item.year });
  if (!results?.length) ({ results } = await tmdb(env, `/search/${type}`, { query: item.title?.en }));
  return (results as Record<string, any>[]).map((r) => toCandidate(r)).filter((c): c is ArtCandidate => !!c).slice(0, 12);
}

/** Lowercase letters and digits only, for comparing titles. */
const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

/** Wikimedia asks API clients to identify themselves. */
const WIKI_UA = 'TheStacks/1.0 (https://github.com/gitosaurusrex/for-your-consideration)';

export interface WikiPage {
  title: string;
  index: number;
  description?: string;
  original?: { source: string };
  thumbnail?: { source: string };
}


/**
 * Search results with a lead image, the game's own article first: the description says it's a
 * game (not a series or franchise), it mentions the release year, and the title matches.
 * Logos (SVG) are left out — they're series pages, not box art.
 */
export function rankWikiPages(pages: WikiPage[], title: string, year?: number): WikiPage[] {
  return pages
    .filter((p) => p.original?.source && !/\.svg$/i.test(p.original.source.split('?')[0]))
    .map((p) => {
      const desc = p.description ?? '';
      let score = -p.index; // Wikipedia's own relevance order breaks ties
      if (/\bgames?\b/i.test(`${p.title} ${desc}`) && !/series|franchise/i.test(desc)) score += 20;
      if (year && `${p.title} ${desc}`.includes(String(year))) score += 10;
      if (norm(p.title.replace(/\s*\([^)]*\)$/, '')) === norm(title)) score += 5;
      return { p, score };
    })
    .sort((a, b) => b.score - a.score)
    .map(({ p }) => p);
}

/** Box art from the English Wikipedia article's lead image. No key needed. */
async function game(item: ItemDoc): Promise<ArtCandidate[]> {
  const title = item.title?.en ?? '';
  const url = new URL('https://en.wikipedia.org/w/api.php');
  url.search = new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2', origin: '*',
    generator: 'search', gsrsearch: `${title} video game`, gsrlimit: '10',
    // pilicense=any: box art is non-free, and the default only returns freely licensed images.
    prop: 'pageimages|description', piprop: 'original|thumbnail', pithumbsize: '300', pilicense: 'any',
  }).toString();
  const res = await fetch(url, { headers: { 'User-Agent': WIKI_UA, accept: 'application/json' } });
  if (res.status === 429) throw new ArtError('Wikipedia is busy right now — try again in a minute.');
  if (!res.ok) throw new ArtError(`Wikipedia answered ${res.status}.`);
  const pages = (((await res.json()) as { query?: { pages?: WikiPage[] } }).query?.pages ?? []);
  const yr = Number(year(item.release_us ?? item.release_jp)) || undefined;
  return rankWikiPages(pages, title, yr).slice(0, 12).map((p) => {
    const cover = p.original!.source.split('?')[0];
    return {
      source: 'Wikipedia' as const,
      label: p.title,
      detail: p.description,
      preview: p.thumbnail?.source.split('?')[0] ?? cover,
      fields: { cover },
    };
  });
}

async function music(item: ItemDoc): Promise<ArtCandidate[]> {
  if (!/^https:\/\/open\.spotify\.com\/(intl-[a-z]+\/)?(track|album)\//.test(item.spotify_url ?? '')) {
    throw new ArtError('Add the Spotify link first (in Spotify: Share → Copy link to song/album) — the cover comes from there.');
  }
  const res = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(item.spotify_url!)}`);
  if (!res.ok) throw new ArtError(`Spotify answered ${res.status} — is the link right?`);
  const j = (await res.json()) as { title?: string; thumbnail_url?: string };
  if (!j.thumbnail_url) throw new ArtError('Spotify didn\'t return a cover for that link.');
  return [{ source: 'Spotify', label: j.title ?? 'Spotify cover', preview: j.thumbnail_url, fields: { cover: j.thumbnail_url } }];
}

/**
 * The first few sentences of a TMDB biography. TMDB bios are often long and copied from
 * Wikipedia, so this keeps a short opening and notes where it came from.
 */
export function shortBio(text: string | undefined, lang: Lang): string | undefined {
  const para = text?.split(/\n+/).map((s) => s.trim())
    .find((s) => s && !/^from wikipedia/i.test(s) && !/^description above from/i.test(s));
  if (!para) return undefined;
  const sentences =
    lang === 'ja' ? para.match(/[^。！？]+[。！？」]*/g) ?? [para]
    // Thai has no full stops; a space separates phrases and sentences.
    : lang === 'th' ? para.split(/\s+/)
    : para.split(/(?<=[.!?]["”’)]?)\s+(?=[A-ZÁÉÍÓÚÑ¿¡"“(])/);
  const limit = lang === 'ja' ? 220 : lang === 'th' ? 260 : 450;
  const join = lang === 'ja' ? '' : ' ';
  let out = '';
  for (const s of sentences.slice(0, lang === 'th' ? 40 : 3)) {
    const next = out ? out + join + s : s;
    if (out && next.length > limit) break;
    out = next;
  }
  return out.trim() || undefined;
}

type Details = Record<string, any>;

/** The bio fields for a person, from TMDB's English details and its details in each other site language. */
export function bioFields(en: Details, translated: Partial<Record<Lang, Details>>): { bio: I18n; bio_credit: string; sources: Sources } | undefined {
  const bioEn = shortBio(en.biography, 'en');
  if (!bioEn) return undefined;
  const bio: I18n = { en: bioEn };
  for (const l of TRANSLATIONS) {
    const text = translated[l]?.biography;
    // TMDB can return the English text when there's no translation; only keep a real one.
    const short = text && text !== en.biography ? shortBio(text, l) : undefined;
    if (short) bio[l] = short;
  }
  const all = [en.biography, ...TRANSLATIONS.map((l) => translated[l]?.biography ?? '')].join(' ');
  const sources = Object.fromEntries(LANGS.filter((l) => bio[l]).map((l) => [sourceKey('bio', l), 'tmdb' as const]));
  return { bio, bio_credit: /wikipedia/i.test(all) ? 'Bio: Wikipedia via TMDB, CC BY-SA' : 'Bio: TMDB', sources };
}

/** A person's TMDB details in each non-English site language (a failed one is just left out). */
export async function translatedDetails(env: Bindings, id: number): Promise<Partial<Record<Lang, Details>>> {
  const got = await Promise.all(TRANSLATIONS.map((l) =>
    tmdb(env, `/person/${id}`, { language: LANG_INFO[l].locale }).catch((): Details => ({}))));
  return Object.fromEntries(TRANSLATIONS.map((l, i) => [l, got[i]]));
}

/** Something a person is credited on in this catalog, used to confirm which TMDB person they are. */
export interface Credit { title: string; tmdb_id?: string; kind: string }


/**
 * Finds a person on TMDB and returns what's missing from their record (photo, bio).
 * A search result only counts as a match if their TMDB credits include something they're credited on here
 * (same TMDB id, or the same title), so a common name never picks up a stranger's photo or bio.
 */
/**
 * Finds this person on TMDB. A search result only counts as a match if their TMDB credits include something
 * they're credited on here (same TMDB id, or the same title), so a common name never picks up a stranger.
 * Returns their TMDB details, or throws an ArtError saying why there's no match.
 */
export async function matchTmdbPerson(env: Bindings, p: PersonDoc, credits: Credit[]): Promise<Details> {
  if (!p.name?.en) throw new ArtError('No English name to search for.');
  const { results } = await tmdb(env, '/search/person', { query: p.name.en });
  const ids = new Set(credits.map((c) => c.tmdb_id).filter(Boolean).map(String));
  const titles = new Set(credits.map((c) => norm(c.title)).filter(Boolean));
  // The top few results by popularity; one details call each (with their credits).
  for (const r of (results as Details[]).slice(0, 3)) {
    const d = await tmdb(env, `/person/${r.id}`, { append_to_response: 'combined_credits' });
    const theirs = [...(d.combined_credits?.cast ?? []), ...(d.combined_credits?.crew ?? [])] as Details[];
    if (theirs.some((c) => ids.has(String(c.id)) || titles.has(norm(c.title ?? c.name)) || titles.has(norm(c.original_title ?? c.original_name)))) return d;
  }
  throw new ArtError(results?.length
    ? 'No TMDB person with matching credits. Use Find art on their page to pick one by hand.'
    : 'Not found on TMDB (musicians often aren\'t listed). Add a photo and bio by hand.');
}

/**
 * A person's name as TMDB lists it in other scripts ("also known as"): Thai script for Thai, kana for Japanese.
 * Han-only names are skipped for Japanese, since they're as likely to be Chinese.
 */
export function namesFromTmdb(d: Details): Partial<Record<Lang, string>> {
  const aka = ((d.also_known_as ?? []) as string[]).map((s) => s.trim()).filter(Boolean);
  const th = aka.find((s) => /\p{Script=Thai}/u.test(s));
  const ja = aka.find((s) => /[\p{Script=Katakana}\p{Script=Hiragana}]/u.test(s));
  return { ...(th ? { th } : {}), ...(ja ? { ja } : {}) };
}

/** Finds a person on TMDB and returns what's missing from their record (photo, bio), with source flags. */
export async function fillPerson(env: Bindings, p: PersonDoc, credits: Credit[]): Promise<Partial<PersonDoc>> {
  const match = await matchTmdbPerson(env, p, credits);
  const out: Partial<PersonDoc> = {};
  if (!p.photo && match.profile_path) out.photo = `${TMDB_IMG}/w342${match.profile_path}`;
  if (!hasText(p.bio)) {
    const got = bioFields(match, await translatedDetails(env, match.id));
    if (got) { out.bio = got.bio; out.bio_credit = got.bio_credit; out.sources = { ...p.sources, ...got.sources }; }
  }
  if (!Object.keys(out).length) throw new ArtError(`TMDB has no photo or bio for ${match.name}.`);
  return out;
}

/** Headshots to choose from. (Bios come from "Fill in missing", not from here.) */
async function person(env: Bindings, p: PersonDoc): Promise<ArtCandidate[]> {
  const { results } = await tmdb(env, '/search/person', { query: p.name?.en });
  return (results as Record<string, any>[]).filter((r) => r.profile_path).slice(0, 12).map((r) => ({
    source: 'TMDB' as const,
    label: r.name,
    detail: [r.known_for_department, ...(r.known_for ?? []).slice(0, 2).map((k: Record<string, any>) => k.title ?? k.name)].filter(Boolean).join(' · '),
    preview: `${TMDB_IMG}/w185${r.profile_path}`,
    fields: { photo: `${TMDB_IMG}/w342${r.profile_path}` },
  }));
}

export async function findArt(env: Bindings, type: EntityType, doc: AnyDoc): Promise<ArtCandidate[]> {
  if (type === 'person') return person(env, doc as PersonDoc);
  if (type !== 'item') throw new ArtError('There\'s no automatic artwork for this — upload an image instead.');
  const item = doc as ItemDoc;
  if (!item.title?.en) throw new ArtError('Fill in the English title first.');
  if (item.kind === 'game') return game(item);
  if (item.kind === 'song' || item.kind === 'album') return music(item);
  return filmOrTv(env, item);
}
