/**
 * Batch ingest: compare an uploaded JSON file with what's already in the database,
 * explain every difference, and turn the admin's decisions into writes.
 * Pure functions — the Worker runs them, the tests exercise them directly.
 */
import { docLabel, ENTITY_TYPES, genreKey, today, type AnyDoc, type EntityType, type GenreDoc, type ItemDoc, type PersonDoc } from './schema';
import { normalize, referencesOf } from './validate';

export interface IngestFile {
  items?: unknown[];
  people?: unknown[];
  companies?: unknown[];
  genres?: unknown[];
}

export const SECTION: Record<EntityType, keyof IngestFile> = { genre: 'genres', company: 'companies', person: 'people', item: 'items' };

/** replace = overwrite with the file's version · fill = only add what's missing · skip = leave as is · separate = it's not the same thing, add it as new */
export type Decision = 'replace' | 'fill' | 'skip' | 'separate';
export type Status = 'new' | 'same' | 'changed' | 'error';
export type MatchVia = 'id' | 'tmdb_id' | 'igdb_id' | 'title' | 'name';

export interface Change { field: string; before: unknown; after: unknown }

export interface PlanEntry {
  /** Stable key for decisions: `type:id-from-file` (or `type#index` when there's no id). */
  key: string;
  type: EntityType;
  index: number;
  id?: string;
  label: string;
  status: Status;
  match?: { id: string; via: MatchVia; label: string };
  changes?: Change[];
  /** Fields "fill" would add (blank in the database, present in the file). */
  fillable?: string[];
  errors: string[];
  warnings: string[];
  decision?: Decision;
  /** What will be stored if this entry is written. */
  result?: AnyDoc;
  outcome?: 'added' | 'replaced' | 'filled' | 'skipped' | 'unchanged' | 'error' | 'undecided';
}

export interface Plan {
  entries: PlanEntry[];
  fileErrors: string[];
  fileWarnings: string[];
  counts: Record<NonNullable<PlanEntry['outcome']>, number>;
  undecided: number;
}

export type Existing = Record<EntityType, Map<string, AnyDoc>>;

// ───────────────────────────── utilities ─────────────────────────────

export function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${stableStringify((v as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}
const same = (a: unknown, b: unknown) => stableStringify(a) === stableStringify(b);

const norm = (s: string | undefined) => (s ?? '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

/** Flatten one level so translated fields diff as title.en / title.ja. */
function flat(doc: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(doc)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) for (const [k2, v2] of Object.entries(v)) out[`${k}.${k2}`] = v2;
    else out[k] = v;
  }
  return out;
}

function unflat(f: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(f)) {
    if (v === undefined) continue;
    // Split at the first dot only: source flags are keyed "summary.th", so they flatten to "sources.summary.th".
    const dot = k.indexOf('.');
    const a = dot < 0 ? k : k.slice(0, dot), b = dot < 0 ? '' : k.slice(dot + 1);
    if (b) {
      const group = (out[a] ??= {}) as Record<string, unknown>;
      group[b] = v;
    } else out[a] = v;
  }
  return out;
}

const empty = (v: unknown) => v == null || v === '' || (Array.isArray(v) && !v.length);

/** Field-level differences from `before` to `after`. */
export function diff(before: object, after: object, ignore: string[] = []): Change[] {
  const a = flat(before);
  const b = flat(after);
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])].filter((k) => !ignore.includes(k.split('.')[0]));
  return keys.filter((k) => !same(a[k], b[k])).map((field) => ({ field, before: a[field], after: b[field] }));
}

/** Keep everything in `existing`, adding only what it's missing from `incoming`. */
export function fillBlanks<T extends object>(existing: T, incoming: T): T {
  const a = flat(existing);
  const filled = new Set<string>();
  const incomingFlat = flat(incoming);
  for (const [k, v] of Object.entries(incomingFlat)) {
    if (k.startsWith('sources.')) continue;
    if (empty(a[k]) && !empty(v)) { a[k] = v; filled.add(k); }
  }
  // A source flag only comes along with the text it describes; existing text keeps its own (or no) flag.
  for (const [k, v] of Object.entries(incomingFlat)) {
    if (k.startsWith('sources.') && filled.has(k.slice('sources.'.length))) a[k] = v;
  }
  return unflat(a) as T;
}

// ───────────────────────────── matching ─────────────────────────────

function findMatch(type: EntityType, doc: AnyDoc, existing: Map<string, AnyDoc>): PlanEntry['match'] {
  const hit = existing.get(doc.id);
  if (hit) return { id: hit.id, via: 'id', label: docLabel(type, hit) };
  for (const other of existing.values()) {
    if (type === 'item') {
      const a = doc as ItemDoc, b = other as ItemDoc;
      if (a.tmdb_id && a.tmdb_id === b.tmdb_id && a.medium === b.medium) return { id: b.id, via: 'tmdb_id', label: docLabel(type, b) };
      if (a.igdb_id && a.igdb_id === b.igdb_id) return { id: b.id, via: 'igdb_id', label: docLabel(type, b) };
      if (a.kind === b.kind && a.year === b.year && norm(a.title.en) === norm(b.title.en)) return { id: b.id, via: 'title', label: docLabel(type, b) };
    } else if (type === 'genre') {
      const a = doc as GenreDoc, b = other as GenreDoc;
      if (a.medium === b.medium && norm(a.name.en) === norm(b.name.en)) return { id: b.id, via: 'name', label: docLabel(type, b) };
    } else {
      const a = doc as PersonDoc, b = other as PersonDoc;
      const sameEn = norm(a.name.en) === norm(b.name.en);
      const sameJa = !!a.name.ja && norm(a.name.ja) === norm(b.name.ja);
      if (sameEn || sameJa) return { id: b.id, via: 'name', label: docLabel(type, b) };
    }
  }
  return undefined;
}

/** Point an item's references at the ids they were matched to. */
function remapRefs(item: ItemDoc, remap: Map<string, string>): ItemDoc {
  const out = { ...item } as unknown as Record<string, unknown>;
  for (const field of ['directors', 'cast', 'artists', 'creators'] as const)
    if (item[field]) out[field] = item[field]!.map((id) => remap.get(`person:${id}`) ?? id);
  for (const field of ['developers', 'publishers'] as const)
    if (item[field]) out[field] = item[field]!.map((id) => remap.get(`company:${id}`) ?? id);
  out.genres = item.genres.map((slug) => {
    const to = remap.get(`genre:${genreKey(item.medium, slug)}`);
    return to ? to.split(':')[1] : slug;
  });
  return out as unknown as ItemDoc;
}

// ───────────────────────────── analysis ─────────────────────────────

export function analyze(file: unknown, existing: Existing, decisions: Record<string, Decision> = {}, now = today()): Plan {
  const fileErrors: string[] = [];
  const fileWarnings: string[] = [];
  const entries: PlanEntry[] = [];
  const counts = { added: 0, replaced: 0, filled: 0, skipped: 0, unchanged: 0, error: 0, undecided: 0 };

  if (!file || typeof file !== 'object' || Array.isArray(file)) {
    fileErrors.push('The file should be a JSON object like { "items": [...], "people": [...], "companies": [...], "genres": [...] }.');
    return { entries, fileErrors, fileWarnings, counts, undecided: 0 };
  }
  const f = file as Record<string, unknown>;
  const allowed = Object.values(SECTION) as string[];
  for (const k of Object.keys(f)) if (!allowed.includes(k) && k !== '$schema' && k !== 'version') fileWarnings.push(`Unknown section "${k}" was ignored (expected ${allowed.join(', ')}).`);

  const remap = new Map<string, string>();

  for (const type of ENTITY_TYPES) {
    const list = f[SECTION[type]];
    if (list == null) continue;
    if (!Array.isArray(list)) { fileErrors.push(`"${SECTION[type]}" should be a list.`); continue; }
    const seen = new Map<string, number>();
    const targeted = new Map<string, string>(); // existing id → label of the file entry already updating it

    list.forEach((raw, index) => {
      const { doc, errors, warnings } = normalize(type, raw);
      const rawObj = (raw ?? {}) as Record<string, unknown>;
      const rawLabel = typeof rawObj.title === 'string' ? rawObj.title : typeof rawObj.name === 'string' ? rawObj.name
        : ((rawObj.title ?? rawObj.name) as { en?: string } | undefined)?.en;
      const entry: PlanEntry = {
        key: doc ? `${type}:${doc.id}` : `${type}#${index}`,
        type, index, id: doc?.id,
        label: doc ? docLabel(type, doc) : rawLabel || `${SECTION[type]}[${index}]`,
        status: 'error', errors: [...errors], warnings,
      };
      entries.push(entry);
      if (!doc) return;

      const dupe = seen.get(doc.id);
      if (dupe != null) { entry.errors.push(`duplicate id "${doc.id}" (also ${SECTION[type]}[${dupe}] in this file)`); return; }
      seen.set(doc.id, index);

      let incoming = type === 'item' ? remapRefs(doc as ItemDoc, remap) : doc;
      let match = findMatch(type, incoming, existing[type]);
      if (match && match.via !== 'id' && decisions[entry.key] === 'separate') match = undefined;
      if (match && targeted.has(match.id)) {
        // Another entry in this file already updates that record — never let two entries overwrite each other.
        if (match.via === 'id') { entry.errors.push(`"${match.id}" is already updated by “${targeted.get(match.id)}” earlier in this file`); return; }
        entry.warnings.push(`looks like “${match.label}”, which this file already updates — it will be added as a separate record (remove it from the file if it's the same)`);
        match = undefined;
      }
      if (match) targeted.set(match.id, entry.label);
      if (match && match.via !== 'id') {
        remap.set(`${type}:${doc.id}`, match.id);
        incoming = { ...incoming, id: match.id };
        if (type === 'genre') (incoming as GenreDoc).slug = match.id.split(':')[1];
      }
      entry.match = match;
      entry.id = incoming.id;

      if (!match) {
        entry.status = 'new';
        entry.result = type === 'item' ? { ...(incoming as ItemDoc), added: (incoming as ItemDoc).added ?? now } : incoming;
        return;
      }

      const current = existing[type].get(match.id)!;
      const replaced = type === 'item' ? { ...(incoming as ItemDoc), added: (incoming as ItemDoc).added ?? (current as ItemDoc).added } : incoming;
      const changes = diff(current, replaced);
      if (!changes.length) { entry.status = 'same'; return; }
      entry.status = 'changed';
      entry.changes = changes;
      entry.fillable = changes.filter((c) => empty(c.before)).map((c) => c.field);
      const decision = decisions[entry.key];
      if (decision === 'replace') entry.result = replaced;
      else if (decision === 'fill') entry.result = fillBlanks(current, replaced);
      entry.decision = decision;
    });
  }

  // References: everything an item points at must exist after this ingest.
  const willExist = new Set<string>();
  for (const type of ENTITY_TYPES) for (const id of existing[type].keys()) willExist.add(`${type}:${id}`);
  for (const e of entries) if (e.status === 'new' && decisions[e.key] !== 'skip' && !e.errors.length) willExist.add(`${e.type}:${e.id}`);
  for (const e of entries) {
    if (e.type !== 'item' || !e.result) continue;
    const missing = referencesOf('item', e.result).filter((r) => !willExist.has(r.key));
    for (const m of missing) {
      const what = m.key.split(':')[0];
      e.errors.push(`${m.field} → "${m.id}" doesn't exist (add it to "${SECTION[what as EntityType]}" in this file, or create it first)`);
    }
  }

  for (const e of entries) {
    if (e.errors.length) { e.status = 'error'; e.result = undefined; e.outcome = 'error'; }
    else if (e.status === 'same') e.outcome = 'unchanged';
    else if (e.status === 'new') e.outcome = decisions[e.key] === 'skip' ? 'skipped' : 'added';
    else if (e.decision === 'replace') e.outcome = 'replaced';
    else if (e.decision === 'fill') e.outcome = e.fillable?.length ? 'filled' : 'unchanged';
    else if (e.decision === 'skip') e.outcome = 'skipped';
    else e.outcome = 'undecided';
    if (e.outcome === 'skipped' || e.outcome === 'unchanged') e.result = undefined;
    counts[e.outcome!]++;
  }

  return { entries, fileErrors, fileWarnings, counts, undecided: counts.undecided };
}

/** The writes to perform for a fully-decided plan. */
export function writesFor(plan: Plan) {
  return plan.entries
    .filter((e) => e.result && (e.outcome === 'added' || e.outcome === 'replaced' || e.outcome === 'filled'))
    .map((e) => ({ type: e.type, id: e.result!.id, doc: e.result!, op: e.outcome === 'added' ? ('insert' as const) : ('update' as const) }));
}

export interface IngestSummary {
  filename?: string;
  counts: Plan['counts'];
  entries: { type: EntityType; id?: string; label: string; outcome: PlanEntry['outcome']; match?: PlanEntry['match']; errors?: string[] }[];
}

export function summarize(plan: Plan, filename?: string): IngestSummary {
  return {
    filename,
    counts: plan.counts,
    entries: plan.entries.map((e) => ({
      type: e.type, id: e.id, label: e.label, outcome: e.outcome,
      ...(e.match && e.match.via !== 'id' ? { match: e.match } : {}),
      ...(e.errors.length ? { errors: e.errors } : {}),
    })),
  };
}
