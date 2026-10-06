import {
  LANG_INFO, LANGS, sourceKey, TRANSLATIONS,
  type AnyDoc, type EntityType, type GenreDoc, type I18n, type ItemDoc, type Lang, type PersonDoc, type Sources,
} from '../src/shared/schema';
import { ArtError, bioFields, matchTmdbPerson, namesFromTmdb, tmdb, TMDB_IMG, translatedDetails, type Credit } from './art';
import { fillPlan, planKeys } from '../src/shared/fill';
import type { Bindings } from './env';

/**
 * Fills missing translations: TMDB first (official titles, names and bios), then Cloudflare AI for what's
 * still empty. Only empty fields are ever filled, and each filled field is flagged with where it came from.
 */

const AI_MODEL = '@cf/meta/m2m100-1.2b';

/**
 * Which translated fields can be filled, and how:
 * - titles only from TMDB (machine-translating a title or proper name gives nonsense),
 * - people's names from TMDB, else AI for Thai and Japanese (Spanish uses the same spelling as English),
 * - summaries, bios and genre names from AI (bios: TMDB first).
 * Studio names, album names and game titles are left alone.
 */
const FIELDS: Record<EntityType, { field: string; langs: readonly Lang[]; ai: boolean }[]> = {
  item: [{ field: 'title', langs: TRANSLATIONS, ai: false }, { field: 'summary', langs: TRANSLATIONS, ai: true }],
  person: [{ field: 'name', langs: ['ja', 'th'], ai: true }, { field: 'bio', langs: TRANSLATIONS, ai: true }],
  genre: [{ field: 'name', langs: TRANSLATIONS, ai: true }],
  company: [],
};

/** "field.lang" keys this record could still have filled. Titles don't count: many keep their original title. */
export function gapsOf(type: EntityType, doc: AnyDoc): string[] {
  const out: string[] = [];
  for (const { field, langs } of FIELDS[type]) {
    if (field === 'title') continue;
    const v = (doc as unknown as Record<string, I18n | undefined>)[field];
    if (!v?.en) continue;
    for (const l of langs) if (!v[l]) out.push(sourceKey(field, l));
  }
  return out;
}

export class TranslateError extends Error {}

/** Translate English text with Cloudflare AI. Returns undefined when the result doesn't look like that language. */
export async function aiTranslate(env: Bindings, text: string, to: Lang): Promise<string | undefined> {
  if (!env.AI) throw new TranslateError('Cloudflare AI isn\'t set up yet. Add the "ai" binding (see README → Translations).');
  let out: string | undefined;
  try {
    const r = (await env.AI.run(AI_MODEL as Parameters<Ai['run']>[0], { text, source_lang: 'en', target_lang: to } as never)) as { translated_text?: string };
    out = r.translated_text?.trim();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/run remotely|remote/i.test(msg)) {
      throw new TranslateError('Cloudflare AI only runs on the deployed site, not in local development (to try it locally: FYC_REMOTE_AI=true npm run dev).');
    }
    if (/neuron|daily|limit|quota|capacity|429|4006/i.test(msg)) {
      throw new TranslateError('Cloudflare AI\'s free daily allowance is used up. It resets at midnight UTC; run this again after that.');
    }
    throw new TranslateError(`Cloudflare AI couldn't translate: ${msg}`);
  }
  if (!out || out === text) return undefined;
  // Thai and Japanese must come back in their own script; otherwise the model just echoed or transliterated badly.
  if (to === 'th' && !/\p{Script=Thai}/u.test(out)) return undefined;
  if (to === 'ja' && !/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(out)) return undefined;
  return out;
}

/** Official titles from TMDB's translations; an empty title there means that country uses the original. */
async function tmdbTitles(env: Bindings, item: ItemDoc): Promise<Partial<Record<Lang, string>>> {
  if (!item.tmdb_id || (item.kind !== 'film' && item.kind !== 'tv')) return {};
  const type = item.kind === 'tv' ? 'tv' : 'movie';
  const { translations = [] } = await tmdb(env, `/${type}/${item.tmdb_id}/translations`);
  const out: Partial<Record<Lang, string>> = {};
  for (const l of TRANSLATIONS) {
    const region = LANG_INFO[l].locale.split('-')[1];
    const forLang = (translations as Record<string, any>[]).filter((t) => t.iso_639_1 === l);
    const t = forLang.find((x) => x.iso_3166_1 === region) ?? forLang[0];
    const title = String(t?.data?.title ?? t?.data?.name ?? '').trim();
    if (title && title !== item.title.en) out[l] = title;
  }
  return out;
}

export interface FillResult {
  /** The filled fields, merged with what was there (only empty values filled). */
  patch: Record<string, unknown>;
  /** Keys that were filled ("photo", "summary.th"), with their source. */
  filled: Record<string, 'tmdb' | 'ai'>;
  /** Why some things weren't filled (e.g. no TMDB match); not errors. */
  notes: string[];
  /** Set when Cloudflare AI stopped working (e.g. the daily allowance ran out); later records shouldn't try. */
  aiStopped?: string;
}

export interface FillOptions {
  /** What this record is credited on, to confirm which TMDB person it is. */
  credits?: Credit[];
  /** Only these keys ("photo", "bio.en", "summary.th"); default: everything in the record's fill plan. */
  only?: string[];
  /** Store a copy of a filled photo on the site (the "Keep a copy of artwork" setting). */
  copyImage?: (url: string) => Promise<string>;
}

/**
 * Fill this record's empty fields from its fill plan: TMDB first (a person's photo and bios, official titles,
 * names), then Cloudflare AI for translations still empty. Nothing is saved here; callers save `patch`
 * (the Dashboard) or put it in the form (the edit page).
 */
export async function fillDoc(env: Bindings, type: EntityType, doc: AnyDoc, opts: FillOptions = {}): Promise<FillResult> {
  const d = doc as unknown as Record<string, unknown>;
  const allowed = new Set(opts.only ?? planKeys(fillPlan(type, doc, !!env.TMDB_API_KEY)));
  const want = (key: string) => allowed.has(key);
  const fields: Record<string, I18n> = {};
  const edit = (field: string) => (fields[field] ??= { en: '', ...((d[field] as I18n | undefined) ?? {}) });
  const sources: Sources = { ...(doc.sources ?? {}) };
  const filled: FillResult['filled'] = {};
  const extra: Record<string, unknown> = {};
  const notes: string[] = [];
  const put = (field: string, l: Lang, text: string | undefined, src: 'tmdb' | 'ai') => {
    const key = sourceKey(field, l);
    if (!text || !want(key) || (d[field] as I18n | undefined)?.[l] || fields[field]?.[l]) return;
    edit(field)[l] = text;
    sources[key] = src;
    filled[key] = src;
  };

  // 1. TMDB.
  if (env.TMDB_API_KEY) {
    try {
      if (type === 'item' && LANGS.some((l) => want(sourceKey('title', l)))) {
        const titles = await tmdbTitles(env, doc as ItemDoc);
        for (const l of TRANSLATIONS) put('title', l, titles[l], 'tmdb');
      } else if (type === 'person') {
        const p = doc as PersonDoc;
        const wantsPhoto = want('photo') && !p.photo;
        const wantsName = (['ja', 'th'] as const).some((l) => want(sourceKey('name', l)) && !p.name?.[l]);
        const wantsBio = LANGS.some((l) => want(sourceKey('bio', l)) && !p.bio?.[l]);
        if (wantsPhoto || wantsName || wantsBio) {
          const match = await matchTmdbPerson(env, p, opts.credits ?? []);
          if (wantsPhoto && match.profile_path) {
            const url = `${TMDB_IMG}/w342${match.profile_path}`;
            extra.photo = opts.copyImage ? await opts.copyImage(url).catch(() => url) : url;
            filled.photo = 'tmdb';
          }
          const names = namesFromTmdb(match);
          for (const l of ['ja', 'th'] as const) put('name', l, names[l], 'tmdb');
          if (wantsBio) {
            const bios = bioFields(match, await translatedDetails(env, match.id));
            for (const l of LANGS) put('bio', l, bios?.bio[l], 'tmdb');
            // Credit the bio's source when its English text came from TMDB (Wikipedia text requires it).
            if (filled['bio.en'] && bios) extra.bio_credit = bios.bio_credit;
          }
        }
      }
    } catch (e) {
      if (!(e instanceof ArtError)) throw e;
      notes.push(`TMDB: ${e.message}`);
    }
  }

  // 2. Cloudflare AI, from the English text (including an English bio TMDB just filled), for what's still empty.
  let aiStopped: string | undefined;
  ai: for (const { field, langs, ai } of FIELDS[type]) {
    const en = fields[field]?.en || (d[field] as I18n | undefined)?.en;
    if (!ai || !en) continue;
    for (const l of langs) {
      const key = sourceKey(field, l);
      if (!want(key) || (d[field] as I18n | undefined)?.[l] || fields[field]?.[l]) continue;
      try {
        put(field, l, await aiTranslate(env, en, l), 'ai');
      } catch (e) {
        if (!(e instanceof TranslateError)) throw e;
        // Keep what TMDB and AI already filled; stop asking AI.
        aiStopped = e.message;
        break ai;
      }
    }
  }

  // A translation needs its English text; drop any field that ended up with translations but no English.
  for (const [field, v] of Object.entries(fields)) {
    if (v.en) continue;
    delete fields[field];
    for (const l of LANGS) { delete filled[sourceKey(field, l)]; delete sources[sourceKey(field, l)]; }
    delete extra.bio_credit;
  }

  const patch: FillResult['patch'] = { ...fields, ...extra };
  if (Object.keys(sources).length) patch.sources = sources;
  return { patch, filled, notes, ...(aiStopped ? { aiStopped } : {}) };
}

/** A short label for a record, for progress reports. */
export const labelOf = (type: EntityType, doc: AnyDoc) =>
  (type === 'item' ? (doc as ItemDoc).title?.en : (doc as PersonDoc | GenreDoc).name?.en) ?? doc.id;
