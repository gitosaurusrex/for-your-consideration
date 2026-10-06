import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { useNavigate } from 'react-router';
import type { Change, Decision, Plan, PlanEntry } from '../shared/ingest';
import type { EntityType } from '../shared/schema';
import example from '../../seed/example-catalog.json';
import { api } from './api';
import { useAdmin } from './context';

const TYPE_ORDER: EntityType[] = ['item', 'person', 'company', 'genre'];
const TYPE_TITLE: Record<EntityType, string> = { item: 'Items', person: 'People', company: 'Studios', genre: 'Genres' };
const VIA: Record<string, string> = { tmdb_id: 'TMDB id', igdb_id: 'IGDB id', title: 'title + year', name: 'name' };
type Filter = 'all' | 'new' | 'changed' | 'same' | 'error';

function download(name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

const show = (v: unknown) =>
  v == null ? <em className="muted">empty</em> : Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? JSON.stringify(v) : String(v);

export function IngestPage() {
  const { reload, toast } = useAdmin();
  const navigate = useNavigate();
  const [file, setFile] = useState<unknown>(null);
  const [filename, setFilename] = useState<string>();
  const [pasted, setPasted] = useState('');
  const [parseError, setParseError] = useState('');
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = (text: string, name?: string) => {
    try {
      const parsed = JSON.parse(text);
      setParseError('');
      setFile(parsed);
      setFilename(name);
      setDecisions({});
      setFilter('all');
    } catch (e) {
      setParseError(`That isn't valid JSON: ${(e as Error).message}`);
    }
  };
  const readFile = async (f?: File) => f && load(await f.text(), f.name);

  // Re-analyse on the server whenever the file or a decision changes.
  const refresh = useCallback(async () => {
    if (!file) return;
    setBusy(true);
    try { setPlan(await api.preview(file, decisions)); }
    catch (e) { toast((e as Error).message, 'error'); }
    finally { setBusy(false); }
  }, [file, decisions, toast]);
  useEffect(() => { refresh(); }, [refresh]);

  const decide = (key: string, d: Decision | undefined) =>
    setDecisions((prev) => {
      const next = { ...prev };
      if (d) next[key] = d; else delete next[key];
      return next;
    });

  const bulk = (d: Decision) => {
    if (!plan) return;
    const next = { ...decisions };
    for (const e of plan.entries) if (e.status === 'changed') next[e.key] = d;
    setDecisions(next);
  };

  const apply = async () => {
    if (!plan) return;
    setBusy(true);
    try {
      const res = await api.apply(file, decisions, filename);
      await reload();
      toast('Ingest applied');
      navigate(`/admin/ingests/${res.ingestId}`);
    } catch (e) {
      toast((e as Error).message, 'error');
      setBusy(false);
    }
  };

  const counts = useMemo(() => {
    const c = { new: 0, changed: 0, same: 0, error: 0 };
    for (const e of plan?.entries ?? []) c[e.status]++;
    return c;
  }, [plan]);

  if (!file) {
    return (
      <div className="admin-page">
        <div className="admin-head"><h1>Batch ingest</h1></div>
        <div
          className={`dropzone ${drag ? 'is-drag' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e: DragEvent) => { e.preventDefault(); setDrag(false); readFile(e.dataTransfer.files[0]); }}
          onClick={() => inputRef.current?.click()}
          role="button" tabIndex={0}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
        >
          <span className="dropzone__icon">⬆</span>
          <strong>Drop a .json file here, or click to choose one</strong>
          <span className="muted">Nothing is saved until you review the preview and click Apply.</span>
          <input ref={inputRef} type="file" accept="application/json,.json" hidden onChange={(e) => readFile(e.target.files?.[0])} />
        </div>
        <details className="panel paste">
          <summary>…or paste JSON</summary>
          <textarea rows={10} value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder='{ "items": [ … ], "people": [ … ] }' />
          <button className="btn btn--primary" disabled={!pasted.trim()} onClick={() => load(pasted, 'pasted.json')}>Preview</button>
        </details>
        {parseError && <div className="callout callout--error">{parseError}</div>}
        <section className="panel">
          <h2>File format</h2>
          <p className="muted">
            One JSON object with any of <code>items</code>, <code>people</code>, <code>companies</code> (studios) and <code>genres</code>.
            Items point at people, studios and genres by id. Translated fields take <code>{'{ "en": "…", "ja": "…" }'}</code>.
            The full field list is in <code>docs/ingest-format.md</code> in the repo.
          </p>
          <div className="admin-head__actions">
            <button className="btn btn--ghost" onClick={() => download('example-catalog.json', example)}>⬇ Example file (everything on the site at launch)</button>
            <a className="btn btn--ghost" href="/api/admin/export" download>⬇ Current database as a file</a>
          </div>
        </section>
      </div>
    );
  }

  const undecided = plan?.undecided ?? 0;
  const willWrite = plan ? plan.counts.added + plan.counts.replaced + plan.counts.filled : 0;
  const visible = (plan?.entries ?? []).filter((e) => filter === 'all' || e.status === filter);

  return (
    <div className="admin-page ingest">
      <div className="admin-head">
        <h1>Preview: {filename ?? 'upload'}</h1>
        <div className="admin-head__actions">
          <button className="btn btn--ghost" onClick={() => { setFile(null); setPlan(null); }}>Choose a different file</button>
        </div>
      </div>

      {plan?.fileErrors.map((e) => <div key={e} className="callout callout--error">{e}</div>)}
      {plan?.fileWarnings.map((w) => <div key={w} className="callout callout--warn">{w}</div>)}

      <div className="stat-tabs" role="tablist">
        {([['all', 'All', plan?.entries.length ?? 0], ['new', 'New', counts.new], ['changed', 'Already exists — changed', counts.changed], ['same', 'Unchanged', counts.same], ['error', 'Errors', counts.error]] as const).map(([f, label, n]) => (
          <button key={f} role="tab" aria-selected={filter === f} className={`stat-tab stat-tab--${f} ${filter === f ? 'is-active' : ''}`} onClick={() => setFilter(f)}>
            <strong>{n}</strong><span>{label}</span>
          </button>
        ))}
      </div>

      {counts.changed > 0 && (
        <div className="callout callout--ask">
          <strong>⚑ {counts.changed} record{counts.changed === 1 ? '' : 's'} already exist{counts.changed === 1 ? 's' : ''} with differences.</strong> Choose what to do with each below, or for all of them:
          <div className="bulk">
            <button className="btn btn--small" onClick={() => bulk('replace')}>Replace all</button>
            <button className="btn btn--small" onClick={() => bulk('fill')}>Fill blanks in all</button>
            <button className="btn btn--small" onClick={() => bulk('skip')}>Skip all</button>
          </div>
        </div>
      )}

      {TYPE_ORDER.map((type) => {
        const list = visible.filter((e) => e.type === type);
        if (!list.length) return null;
        return (
          <section key={type} className="ingest-group">
            <h2>{TYPE_TITLE[type]} <span className="muted">({list.length})</span></h2>
            {list.map((e) => <EntryRow key={e.key} entry={e} decision={decisions[e.key]} onDecide={(d) => decide(e.key, d)} />)}
          </section>
        );
      })}

      <div className="apply-bar">
        <div className="apply-bar__text">
          {busy ? 'Checking…' : plan && (
            <>
              Will add <b>{plan.counts.added}</b>, replace <b>{plan.counts.replaced}</b>, fill <b>{plan.counts.filled}</b>, skip <b>{plan.counts.skipped + plan.counts.unchanged}</b>
              {plan.counts.error > 0 && <> · <span className="text-error">{plan.counts.error} with errors won't be imported</span></>}
              {undecided > 0 && <> · <span className="text-warn">{undecided} still need a decision</span></>}
            </>
          )}
        </div>
        <button className="btn btn--primary" disabled={busy || !plan || undecided > 0 || !!plan.fileErrors.length || willWrite === 0} onClick={apply}>
          {willWrite === 0 && plan && !undecided ? 'Nothing to import' : `Apply ${willWrite} change${willWrite === 1 ? '' : 's'}`}
        </button>
      </div>
    </div>
  );
}

const STATUS_LABEL: Record<PlanEntry['status'], string> = { new: 'New', changed: 'Exists · changed', same: 'Unchanged', error: 'Error' };

function EntryRow({ entry: e, decision, onDecide }: { entry: PlanEntry; decision?: Decision; onDecide: (d: Decision | undefined) => void }) {
  const art = (e.result as { poster?: string; cover?: string; photo?: string } | undefined);
  const thumb = art?.poster ?? art?.cover ?? art?.photo;
  const fuzzy = e.match && e.match.via !== 'id';
  return (
    <article className={`entry entry--${e.status} ${e.status === 'changed' && !decision ? 'needs-decision' : ''}`}>
      <div className="entry__head">
        {thumb ? <img className="entry__thumb" src={thumb} alt="" /> : null}
        <span className={`pill pill--${e.status}`}>{STATUS_LABEL[e.status]}</span>
        <strong className="entry__label">{e.label}</strong>
        {e.id && <code className="muted small">{e.id}</code>}
        {e.status === 'new' && decision !== 'separate' && (
          <label className="field--check small entry__include">
            <input type="checkbox" checked={decision !== 'skip'} onChange={(ev) => onDecide(ev.target.checked ? undefined : 'skip')} /> Include
          </label>
        )}
      </div>

      {fuzzy && (
        <p className="entry__match">
          ↔ Looks like the existing <b>{e.match!.label}</b> (<code>{e.match!.id}</code>), matched by {VIA[e.match!.via]}. Updates will go to that record.
        </p>
      )}
      {e.errors.length > 0 && <ul className="entry__errors">{e.errors.map((x) => <li key={x}>{x}</li>)}</ul>}
      {e.warnings.length > 0 && (
        <details className="entry__warnings"><summary>{e.warnings.length} note{e.warnings.length === 1 ? '' : 's'}</summary><ul>{e.warnings.map((x) => <li key={x}>{x}</li>)}</ul></details>
      )}

      {e.status === 'changed' && (
        <>
          <DiffTable changes={e.changes ?? []} fillable={e.fillable ?? []} />
          <div className="decide" role="radiogroup" aria-label="What should happen?">
            <DecideButton current={decision} value="replace" onDecide={onDecide} title="Use the file's version (fields missing from the file are cleared; the added date is kept)">Replace</DecideButton>
            <DecideButton current={decision} value="fill" onDecide={onDecide} title="Keep what's there and only add fields that are empty" disabled={!e.fillable?.length}>
              Fill blanks{e.fillable?.length ? ` (${e.fillable.length})` : ''}
            </DecideButton>
            <DecideButton current={decision} value="skip" onDecide={onDecide} title="Leave the existing record alone">Skip</DecideButton>
            {fuzzy && <DecideButton current={decision} value="separate" onDecide={onDecide} title="It's a different thing — add it as a new record">Not the same — add as new</DecideButton>}
          </div>
        </>
      )}
      {decision === 'separate' && (
        <p className="entry__match">
          ＋ Will be added as a separate record, not merged with the similar existing one.{' '}
          <button className="link-button" onClick={() => onDecide(undefined)}>Undo</button>
        </p>
      )}
    </article>
  );
}

function DecideButton({ current, value, onDecide, children, title, disabled }: {
  current?: Decision; value: Decision; onDecide: (d: Decision) => void; children: React.ReactNode; title: string; disabled?: boolean;
}) {
  return (
    <button role="radio" aria-checked={current === value} className={`decide__btn decide__btn--${value} ${current === value ? 'is-active' : ''}`} title={title} disabled={disabled} onClick={() => onDecide(value)}>
      {children}
    </button>
  );
}

function DiffTable({ changes, fillable }: { changes: Change[]; fillable: string[] }) {
  return (
    <table className="diff">
      <thead><tr><th>Field</th><th>Now</th><th>In the file</th></tr></thead>
      <tbody>
        {changes.map((c) => (
          <tr key={c.field} className={fillable.includes(c.field) ? 'is-fill' : c.after == null ? 'is-removed' : ''}>
            <td><code>{c.field}</code>{fillable.includes(c.field) && <span className="flag flag--fill">fills a blank</span>}{c.after == null && <span className="flag">replace clears it</span>}</td>
            <td className="diff__before">{show(c.before)}</td>
            <td className="diff__after">{show(c.after)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
