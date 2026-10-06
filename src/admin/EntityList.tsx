import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { LANG_INFO, MEDIA, MEDIUM_KINDS, type AnyDoc, type EntityType, type GenreDoc, type I18n, type ItemDoc, type Lang, type Medium } from '../shared/schema';
import { referencesOf } from '../shared/validate';
import { api } from './api';
import { useAction, useAdmin } from './context';
import { adminEditPath, sitePath, TYPE_LABEL } from './links';

const MEDIUM_LABEL: Record<Medium, string> = { watch: '🎬 Film & TV', listen: '🎧 Music', play: '🎮 Games' };
const KIND_LABEL: Record<string, string> = { film: 'Film', tv: 'TV show', song: 'Song', album: 'Album', game: 'Game' };

/** Quick health flags so gaps are easy to spot. */
function flagsFor(type: EntityType, doc: AnyDoc): string[] {
  const out: string[] = [];
  const missingJa = (v?: I18n) => v?.en && !v.ja;
  if (type === 'item') {
    const i = doc as ItemDoc;
    if (missingJa(i.title) || missingJa(i.summary)) out.push('needs Japanese');
    if (!i.poster && !i.cover) out.push('no art');
    if (i.medium === 'watch' && !i.watch_url) out.push('no watch link');
    if (i.medium === 'listen' && !i.spotify_url) out.push('no Spotify link');
  } else {
    const named = doc as { name: I18n; bio?: I18n; photo?: string };
    if (missingJa(named.name) || missingJa(named.bio)) out.push('needs Japanese');
    if (type === 'person' && !named.photo) out.push('no photo');
    if (type === 'person' && !named.bio) out.push('no bio');
  }
  return out;
}

/**
 * Fields whose AI-translated box is still ticked, grouped by field: { summary: ['th', 'es'] }.
 * Relies only on that checkbox, so unticking the last one removes the AI chip.
 */
export function aiFields(doc: AnyDoc): Record<string, Lang[]> {
  const out: Record<string, Lang[]> = {};
  for (const [key, src] of Object.entries(doc.sources ?? {})) {
    if (src !== 'ai') continue;
    const dot = key.lastIndexOf('.');
    (out[key.slice(0, dot)] ??= []).push(key.slice(dot + 1) as Lang);
  }
  return out;
}

/** The AI chip for the Flags column, with the fields and languages still to review in its tooltip. */
function AiChip({ doc }: { doc: AnyDoc }) {
  const fields = aiFields(doc);
  const count = Object.values(fields).flat().length;
  if (!count) return null;
  const detail = Object.entries(fields).map(([f, langs]) => `${f} (${langs.map((l) => LANG_INFO[l].short).join(', ')})`).join('; ');
  return (
    <span className="flag flag--ai" title={`AI-translated, not yet reviewed: ${detail}`}>
      AI{count > 1 && <span className="flag__count"> · {count}</span>}
    </span>
  );
}

export function EntityList({ type }: { type: EntityType }) {
  const { data, reload } = useAdmin();
  const run = useAction();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const medium = params.get('m') as Medium | null;
  const onlyFlagged = params.get('flagged') === '1';
  const onlyAi = params.get('ai') === '1';

  const docs: AnyDoc[] = type === 'item' ? data.items : type === 'person' ? data.people : type === 'company' ? data.companies : data.genres;

  const usage = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of data.items) for (const r of referencesOf('item', i)) m.set(r.key, (m.get(r.key) ?? 0) + 1);
    return m;
  }, [data.items]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return docs
      .filter((d) => !medium || (d as ItemDoc | GenreDoc).medium === medium)
      .filter((d) => !needle || JSON.stringify(d).toLowerCase().includes(needle))
      .map((d) => ({ d, flags: flagsFor(type, d), ai: Object.keys(aiFields(d)).length > 0, uses: usage.get(`${type}:${d.id}`) ?? 0 }))
      .filter((r) => !onlyFlagged || r.flags.length || r.ai)
      .filter((r) => !onlyAi || r.ai)
      .sort((a, b) =>
        type === 'item'
          ? ((b.d as ItemDoc).added ?? '').localeCompare((a.d as ItemDoc).added ?? '')
          : nameOf(a.d).localeCompare(nameOf(b.d)));
  }, [docs, q, medium, onlyFlagged, onlyAi, type, usage]);

  const del = async (d: AnyDoc) => {
    if (!confirm(`Delete “${nameOf(d)}”? This can't be undone.`)) return;
    if (await run(() => api.remove(type, d.id), `Deleted “${nameOf(d)}”`)) await reload();
  };

  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    setParams(next, { replace: true });
  };

  return (
    <div className="admin-page">
      <div className="admin-head">
        <h1>{TYPE_LABEL[type].many} <span className="muted">({docs.length})</span></h1>
        <div className="admin-head__actions">
          {type === 'item' ? (
            <select className="btn btn--primary" value="" onChange={(e) => e.target.value && navigate(`/admin/new/item?kind=${e.target.value}`)} aria-label="New item">
              <option value="">＋ New item…</option>
              {MEDIA.flatMap((m) => MEDIUM_KINDS[m]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
            </select>
          ) : (
            <Link className="btn btn--primary" to={`/admin/new/${type}${type === 'genre' && medium ? `?medium=${medium}` : ''}`}>＋ New {TYPE_LABEL[type].one}</Link>
          )}
        </div>
      </div>

      <div className="list-tools">
        {(type === 'item' || type === 'genre') && (
          <div className="tabs">
            <button className={!medium ? 'is-active' : ''} onClick={() => setParam('m', null)}>All</button>
            {MEDIA.map((m) => <button key={m} className={medium === m ? 'is-active' : ''} onClick={() => setParam('m', m)}>{MEDIUM_LABEL[m]}</button>)}
          </div>
        )}
        <input className="list-tools__search" type="search" placeholder="Filter…" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="field--check small"><input type="checkbox" checked={onlyFlagged} onChange={(e) => setParam('flagged', e.target.checked ? '1' : null)} /> Only ones needing attention</label>
        {type !== 'company' && (
          <label className="field--check small"><input type="checkbox" checked={onlyAi} onChange={(e) => setParam('ai', e.target.checked ? '1' : null)} /> Only with AI translations</label>
        )}
      </div>

      <table className="table table--list">
        <thead>
          <tr>
            {type === 'item' && <th />}
            <th>Name</th>
            {type === 'item' && <><th>Type</th><th>Year</th><th>Added</th></>}
            {type === 'genre' && <th>Section</th>}
            {type !== 'item' && <th>Used by</th>}
            <th>Flags</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map(({ d, flags, uses }) => {
            const item = d as ItemDoc;
            const art = item.poster ?? item.cover ?? (d as { photo?: string }).photo;
            return (
              <tr key={d.id}>
                {type === 'item' && <td className="thumb-cell">{art ? <img src={art} alt="" loading="lazy" /> : <span className="thumb-empty" />}</td>}
                <td>
                  <Link to={adminEditPath(type, d.id)} className="row-title">{nameOf(d)}</Link>
                  {jaOf(d) && jaOf(d) !== nameOf(d) && <div className="muted small" lang="ja">{jaOf(d)}</div>}
                </td>
                {type === 'item' && <><td>{KIND_LABEL[item.kind]}</td><td>{item.year}</td><td className="nowrap">{item.added}</td></>}
                {type === 'genre' && <td>{MEDIUM_LABEL[(d as GenreDoc).medium]}</td>}
                {type !== 'item' && <td>{uses}</td>}
                <td><AiChip doc={d} />{flags.map((f) => <span key={f} className="flag">{f}</span>)}</td>
                <td className="row-actions">
                  <Link to={adminEditPath(type, d.id)}>Edit</Link>
                  <a href={sitePath(type, d)} target="_blank" rel="noreferrer">View ↗</a>
                  <button onClick={() => del(d)} disabled={type !== 'item' && uses > 0} title={uses ? 'Still used by items' : undefined}>Delete</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!rows.length && <p className="muted">Nothing matches.</p>}
    </div>
  );
}

function nameOf(d: AnyDoc) {
  const v = (d as { title?: I18n; name?: I18n }).title ?? (d as { name?: I18n }).name;
  return v?.en ?? d.id;
}
function jaOf(d: AnyDoc) {
  const v = (d as { title?: I18n; name?: I18n }).title ?? (d as { name?: I18n }).name;
  return v?.ja;
}
