import { useEffect, useState, type CSSProperties } from 'react';
import { Link, useParams } from 'react-router';
import { getItem, itemHue } from '../data';
import { Art } from '../components/Art';
import type { IngestSummary } from '../shared/ingest';
import type { EntityType } from '../shared/schema';
import { api } from './api';
import { useAdmin } from './context';
import { adminEditPath, sitePath } from './links';

const OUTCOME: Record<string, string> = { added: 'Added', replaced: 'Replaced', filled: 'Filled blanks', skipped: 'Skipped', unchanged: 'Unchanged', error: 'Error' };
const TYPE_TITLE: Record<EntityType, string> = { item: 'Items', person: 'People', company: 'Studios', genre: 'Genres' };

export function IngestSummaryPage() {
  const { id } = useParams();
  const { data } = useAdmin();
  const [row, setRow] = useState<{ created_at: string; filename: string | null; summary: IngestSummary } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { api.ingest(Number(id)).then(setRow).catch((e) => setError(e.message)); }, [id]);

  if (error) return <div className="admin-page"><p className="text-error">{error}</p></div>;
  if (!row) return <div className="admin-page"><p className="muted">Loading…</p></div>;

  const { counts, entries } = row.summary;
  const changed = entries.filter((e) => e.outcome === 'added' || e.outcome === 'replaced' || e.outcome === 'filled');
  const items = changed.filter((e) => e.type === 'item');
  const others = changed.filter((e) => e.type !== 'item');
  const hidden = new Set((['watch', 'listen', 'play'] as const).filter((m) => !data.settings.media[m]));

  return (
    <div className="admin-page">
      <p className="crumbs"><Link to="/admin">← Dashboard</Link></p>
      <div className="admin-head">
        <h1>Ingest #{id} summary</h1>
        <span className="muted">{row.filename ?? 'upload'} · {new Date(row.created_at).toLocaleString()}</span>
      </div>

      <div className="stat-tabs">
        {(['added', 'replaced', 'filled', 'skipped', 'unchanged', 'error'] as const).map((k) => (
          <div key={k} className={`stat-tab stat-tab--${k}`}><strong>{counts[k]}</strong><span>{OUTCOME[k]}</span></div>
        ))}
      </div>

      {items.length > 0 && (
        <section className="panel">
          <h2>What's new on the site</h2>
          <p className="muted small">Exactly as visitors will see them. Click to open the page in a new tab, or edit straight away.</p>
          <div className="preview-grid">
            {items.map((e) => {
              const item = e.id ? getItem(e.id) : undefined;
              if (!item) return null;
              return (
                <div key={e.id} className="preview-card" style={{ '--h': itemHue(item) } as CSSProperties}>
                  <a href={sitePath('item', item.doc)} target="_blank" rel="noreferrer"><Art item={item} /></a>
                  <span className={`pill pill--${e.outcome}`}>{OUTCOME[e.outcome!]}</span>
                  <strong>{item.en.title}</strong>
                  {item.ja.title !== item.en.title && <span className="muted small" lang="ja">{item.ja.title}</span>}
                  {hidden.has(item.section) && <span className="flag">section hidden on site</span>}
                  <span className="preview-card__links">
                    <a href={sitePath('item', item.doc)} target="_blank" rel="noreferrer">View ↗</a>
                    <Link to={adminEditPath('item', item.slug)}>Edit</Link>
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {others.length > 0 && (
        <section className="panel">
          <h2>People, studios & genres</h2>
          <div className="chip-cloud">
            {others.map((e) => (
              <Link key={`${e.type}:${e.id}`} to={adminEditPath(e.type, e.id!)} className="admin-chip">
                <span className={`dot dot--${e.outcome}`} />{e.label} <span className="muted small">{TYPE_TITLE[e.type]}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="panel">
        <h2>Everything in the file</h2>
        <table className="table">
          <thead><tr><th>Type</th><th>Name</th><th>Result</th><th>Notes</th></tr></thead>
          <tbody>
            {entries.map((e, i) => (
              <tr key={i}>
                <td>{TYPE_TITLE[e.type]}</td>
                <td>{e.id && e.outcome !== 'error' ? <Link to={adminEditPath(e.type, e.id)}>{e.label}</Link> : e.label}</td>
                <td><span className={`pill pill--${e.outcome}`}>{OUTCOME[e.outcome!]}</span></td>
                <td className="small">
                  {e.match && <>Matched existing “{e.match.label}” by {e.match.via}. </>}
                  {e.errors?.map((x) => <div key={x} className="text-error">{x}</div>)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
