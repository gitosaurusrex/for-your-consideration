import { describe, expect, it } from 'vitest';
import { analyze, diff, fillBlanks, writesFor, type Existing } from '../src/shared/ingest';
import { normalize } from '../src/shared/validate';
import type { AnyDoc } from '../src/shared/schema';

const empty = (): Existing => ({ item: new Map(), person: new Map(), company: new Map(), genre: new Map() });
const db = (docs: Partial<Record<keyof Existing, AnyDoc[]>>): Existing => {
  const e = empty();
  for (const [type, list] of Object.entries(docs)) for (const d of list!) e[type as keyof Existing].set(d.id, d);
  return e;
};

const kojima = { id: 'hideo-kojima', name: { en: 'Hideo Kojima', ja: '小島秀夫' } };
const kojimaProd = { id: 'kojima-productions', name: { en: 'Kojima Productions', ja: 'コジマプロダクション' } };
const genres = [{ medium: 'play', slug: 'action', name: { en: 'Action', ja: 'アクション' } }];
const deathStranding = {
  id: 'death-stranding', kind: 'game', title: { en: 'Death Stranding', ja: 'デス・ストランディング' },
  summary: { en: 'Deliver packages across a broken America.', ja: '分断されたアメリカを荷物を届けて歩く。' },
  genres: ['action'], release_us: '2019-11-08', release_jp: '2019-11-08', platforms: ['ps4', 'pc'],
  developers: ['kojima-productions'], creators: ['hideo-kojima'],
};

describe('normalize', () => {
  it('accepts friendly input and derives medium, year and id', () => {
    const { doc, errors } = normalize('item', { ...deathStranding, id: undefined, platforms: 'PS4, PC', title: 'Death Stranding' });
    expect(errors).toEqual([]);
    expect(doc).toMatchObject({ id: 'death-stranding', medium: 'play', year: 2019, platforms: ['ps4', 'pc'], title: { en: 'Death Stranding' } });
  });

  it('reports readable errors', () => {
    const { doc, errors } = normalize('item', { kind: 'game', title: 'X', summary: 'y', genres: ['a'], developers: ['d'], platforms: ['ps6'], release_us: '2019-13-01' });
    expect(doc).toBeNull();
    expect(errors.join('\n')).toMatch(/unknown platform "ps6"/);
    expect(errors.join('\n')).toMatch(/release_us.*should be a date/);
    expect(errors.join('\n')).toMatch(/needs a US or Japan release date/);
  });

  it('turns an availability end date into a limited-time flag', () => {
    const { doc } = normalize('item', {
      kind: 'film', title: 'A', summary: 'B', genres: ['drama'], year: 2020, directors: ['x'],
      availability: { free: true, until: '2026-12-31' },
    });
    expect((doc as { availability: unknown }).availability).toEqual({ free: true, until: '2026-12-31' });
    const { doc: d2 } = normalize('item', { kind: 'film', title: 'A', summary: 'B', genres: ['drama'], year: 2020, directors: ['x'], availability: { until: '2026-12-31' } });
    expect((d2 as { availability: unknown }).availability).toEqual({ limited_time: true, until: '2026-12-31' });
  });

  it('scopes genre ids to their medium', () => {
    expect(normalize('genre', { medium: 'play', name: 'Indie' }).doc?.id).toBe('play:indie');
    expect(normalize('genre', { medium: 'watch', name: 'Indie' }).doc?.id).toBe('watch:indie');
  });
});

describe('analyze', () => {
  const file = { genres, companies: [kojimaProd], people: [kojima], items: [deathStranding] };

  it('adds everything to an empty database, with today as the added date', () => {
    const plan = analyze(file, empty(), {}, '2026-10-06');
    expect(plan.counts).toMatchObject({ added: 4, error: 0, undecided: 0 });
    const game = plan.entries.find((e) => e.type === 'item')!;
    expect(game.result).toMatchObject({ added: '2026-10-06', medium: 'play' });
    expect(writesFor(plan)).toHaveLength(4);
  });

  it('flags missing references', () => {
    const plan = analyze({ items: [deathStranding] }, empty());
    const game = plan.entries[0];
    expect(game.status).toBe('error');
    expect(game.errors.join('\n')).toMatch(/developers → "kojima-productions" doesn't exist/);
    expect(game.errors.join('\n')).toMatch(/genres → "play:action" doesn't exist/);
  });

  it('marks identical records unchanged and asks about changed ones', () => {
    const first = analyze(file, empty(), {}, '2026-10-01');
    const existing = db({});
    for (const w of writesFor(first)) existing[w.type].set(w.id, w.doc);

    const again = analyze(file, existing);
    expect(again.counts).toMatchObject({ unchanged: 4, added: 0 });

    const edited = { ...file, people: [{ ...kojima, bio: { en: 'Game designer.' } }] };
    const plan = analyze(edited, existing);
    const person = plan.entries.find((e) => e.type === 'person')!;
    expect(person.status).toBe('changed');
    expect(person.outcome).toBe('undecided');
    expect(person.changes).toEqual([{ field: 'bio.en', before: undefined, after: 'Game designer.' }]);
    expect(plan.undecided).toBe(1);

    const decided = analyze(edited, existing, { 'person:hideo-kojima': 'fill' });
    expect(decided.undecided).toBe(0);
    expect(writesFor(decided)).toEqual([{ type: 'person', id: 'hideo-kojima', op: 'update', doc: { ...kojima, bio: { en: 'Game designer.' } } }]);
  });

  it('keeps the original added date when replacing', () => {
    const existing = db({ genre: [{ id: 'play:action', medium: 'play', slug: 'action', name: { en: 'Action' } }] as AnyDoc[],
      company: [kojimaProd] as AnyDoc[], person: [kojima] as AnyDoc[],
      item: [{ ...deathStranding, medium: 'play', year: 2019, added: '2026-01-01' }] as AnyDoc[] });
    const plan = analyze({ items: [{ ...deathStranding, summary: { en: 'New text', ja: '新しい' } }] }, existing, { 'item:death-stranding': 'replace' });
    expect(plan.entries[0].result).toMatchObject({ added: '2026-01-01', summary: { en: 'New text' } });
  });

  it('matches a person by name under a different id and remaps references', () => {
    const existing = db({ person: [kojima] as AnyDoc[], company: [kojimaProd] as AnyDoc[], genre: [{ id: 'play:action', medium: 'play', slug: 'action', name: { en: 'Action' } }] as AnyDoc[] });
    const plan = analyze({ people: [{ id: 'kojima-hideo', name: { en: 'Kojima Hideo', ja: '小島秀夫' } }], items: [{ ...deathStranding, creators: ['kojima-hideo'] }] }, existing);
    const person = plan.entries[0];
    expect(person.match).toMatchObject({ id: 'hideo-kojima', via: 'name' });
    const game = plan.entries[1];
    expect(game.status).toBe('new');
    expect((game.result as { creators: string[] }).creators).toEqual(['hideo-kojima']);

    // …unless the admin says they're different people.
    const separate = analyze({ people: [{ id: 'kojima-hideo', name: { en: 'Kojima Hideo', ja: '小島秀夫' } }] }, existing, { 'person:kojima-hideo': 'separate' });
    expect(separate.entries[0]).toMatchObject({ status: 'new', id: 'kojima-hideo' });
  });

  it('never lets two file entries update the same existing record', () => {
    const existing = db({ person: [kojima] as AnyDoc[] });
    const plan = analyze({ people: [{ ...kojima, bio: { en: 'x' } }, { id: 'kojima-hideo', name: { en: 'Kojima Hideo', ja: '小島秀夫' } }] }, existing);
    expect(plan.entries[0].status).toBe('changed');
    expect(plan.entries[1]).toMatchObject({ status: 'new', id: 'kojima-hideo' });
    expect(plan.entries[1].warnings.join()).toMatch(/already updates/);
  });

  it('rejects duplicate ids within a file', () => {
    const plan = analyze({ people: [kojima, kojima] }, empty());
    expect(plan.entries[1].errors[0]).toMatch(/duplicate id/);
    expect(plan.counts).toMatchObject({ added: 1, error: 1 });
  });

  it('explains a malformed file', () => {
    expect(analyze([], empty()).fileErrors[0]).toMatch(/should be a JSON object/);
    expect(analyze({ movies: [] }, empty()).fileWarnings[0]).toMatch(/Unknown section "movies"/);
  });
});

describe('diff / fillBlanks', () => {
  it('diffs translated fields per language and only fills blanks', () => {
    const before = { id: 'a', name: { en: 'A' }, bio: { en: 'old' } };
    const after = { id: 'a', name: { en: 'A', ja: 'エー' }, bio: { en: 'new' } };
    expect(diff(before, after).map((c) => c.field)).toEqual(['name.ja', 'bio.en']);
    expect(fillBlanks(before, after)).toEqual({ id: 'a', name: { en: 'A', ja: 'エー' }, bio: { en: 'old' } });
  });
});
