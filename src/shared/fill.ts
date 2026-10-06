/**
 * What "Fill in missing" can fill for a record: only things that are empty, only where a source exists.
 * Shared by the admin (to show the choices) and the Worker (to fill only what was chosen).
 *
 * Keys are "photo" or "field.lang" ("bio.en", "summary.th"), the same shape as source flags.
 */
import { sourceKey, TRANSLATIONS, type AnyDoc, type EntityType, type I18n, type ItemDoc, type Lang, type PersonDoc } from './schema';

/** tmdb: from TMDB only. translate: TMDB where it has it, then Cloudflare AI from the English. */
export type FillVia = 'tmdb' | 'translate';

export interface FillRow {
  /** Record field this row fills. */
  field: string;
  label: string;
  via: FillVia;
  /** Languages that can be filled (each its own toggle); absent for a non-text field such as the photo. */
  langs?: Lang[];
}

/** Keys for one row: "photo", or "summary.th" per language. */
export const rowKeys = (r: FillRow) => (r.langs ? r.langs.map((l) => sourceKey(r.field, l)) : [r.field]);

/** Every key in a plan. */
export const planKeys = (plan: FillRow[]) => plan.flatMap(rowKeys);

const missing = (v: I18n | undefined, langs: readonly Lang[]) => langs.filter((l) => !v?.[l]);

/**
 * What can be filled for this record. `canTmdb`: a TMDB key is set (rows that only TMDB can fill are left out
 * without it; translation rows stay, since Cloudflare AI covers them).
 */
export function fillPlan(type: EntityType, doc: Partial<AnyDoc>, canTmdb: boolean): FillRow[] {
  const rows: FillRow[] = [];
  const add = (row: FillRow) => { if (!row.langs || row.langs.length) rows.push(row); };

  if (type === 'person') {
    const p = doc as Partial<PersonDoc>;
    if (canTmdb && !p.photo) add({ field: 'photo', label: 'Headshot', via: 'tmdb' });
    if (canTmdb && !p.bio?.en) add({ field: 'bio', label: 'English bio', via: 'tmdb', langs: ['en'] });
    // Spanish uses the same spelling of a name as English, so only Japanese and Thai.
    if (p.name?.en) add({ field: 'name', label: 'Name', via: 'translate', langs: missing(p.name, ['ja', 'th']) });
    // Bios can be translated once there's an English one (or one is about to come from TMDB).
    if (p.bio?.en || (canTmdb && !p.bio?.en)) add({ field: 'bio', label: 'Bio', via: 'translate', langs: missing(p.bio, TRANSLATIONS) });
  } else if (type === 'item') {
    const i = doc as Partial<ItemDoc>;
    // Official titles only come from TMDB (machine-translating a title gives nonsense), so only films and TV with a TMDB id.
    if (canTmdb && i.tmdb_id && (i.kind === 'film' || i.kind === 'tv') && i.title?.en) {
      add({ field: 'title', label: 'Official title', via: 'tmdb', langs: missing(i.title, TRANSLATIONS) });
    }
    if (i.summary?.en) add({ field: 'summary', label: 'Summary', via: 'translate', langs: missing(i.summary, TRANSLATIONS) });
  } else if (type === 'genre') {
    const g = doc as { name?: I18n };
    if (g.name?.en) add({ field: 'name', label: 'Name', via: 'translate', langs: missing(g.name, TRANSLATIONS) });
  }
  // Studios: names are brand names, left as they are.
  return rows;
}
