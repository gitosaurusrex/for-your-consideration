import { useEffect, useMemo, useRef, useState } from 'react';
import { fillPlan, planKeys, rowKeys, type FillRow } from '../shared/fill';
import { LANG_INFO, type EntityType } from '../shared/schema';
import { api, type FillResult } from './api';

/**
 * "Fill in missing": shows what can be filled for this record, grouped by where it comes from, with a toggle for
 * each piece (all on to start). Filling puts the results in the form; nothing is saved until the editor saves.
 */
export function FillDialog({ type, form, onFilled, onClose }: {
  type: EntityType; form: Record<string, unknown>; onFilled: (r: FillResult) => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [status, setStatus] = useState<{ tmdb: boolean; ai: boolean } | null>(null);
  const [chosen, setChosen] = useState<Set<string> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    dialog.current?.showModal();
    api.artStatus().then((s) => setStatus({ tmdb: s.tmdb, ai: s.ai })).catch(() => setStatus({ tmdb: false, ai: false }));
  }, []);

  const plan = useMemo(() => (status ? fillPlan(type, form, status.tmdb) : []), [type, form, status]);
  // Everything starts switched on.
  useEffect(() => { if (status) setChosen(new Set(planKeys(plan))); }, [plan, status]);

  const toggle = (key: string) => setChosen((c) => {
    const next = new Set(c);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const fill = async () => {
    if (!chosen?.size) return;
    setBusy(true);
    setError(undefined);
    try {
      onFilled(await api.fill(type, form, [...chosen]));
      dialog.current?.close();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const title = (form.title as { en?: string })?.en ?? (form.name as { en?: string })?.en;
  const tmdbRows = plan.filter((r) => r.via === 'tmdb');
  const translateRows = plan.filter((r) => r.via === 'translate');
  // A plain render function (not a component), so toggling doesn't remount the row and lose keyboard focus.
  const renderRow = (row: FillRow) => (
    <div key={row.field + row.label} className="fill-row">
      <span className="fill-row__label">{row.label}</span>
      <div className="fill-row__choices">
        {rowKeys(row).map((key, i) => {
          const lang = row.langs?.[i];
          return (
            <label key={key} className={`fill-chip ${chosen?.has(key) ? 'is-on' : ''}`}>
              <input type="checkbox" checked={!!chosen?.has(key)} onChange={() => toggle(key)} disabled={busy} />
              {lang ? <span lang={lang}>{LANG_INFO[lang].short}</span> : 'Add'}
            </label>
          );
        })}
      </div>
    </div>
  );

  return (
    <dialog ref={dialog} className="find-art fill-dialog" onClose={onClose} onClick={(e) => e.target === dialog.current && !busy && dialog.current?.close()}>
      <header className="find-art__head">
        <h2>Fill in missing{title ? ` — ${title}` : ''}</h2>
        <button type="button" className="btn btn--small btn--quiet" onClick={() => dialog.current?.close()} disabled={busy}>Close</button>
      </header>
      {!status && <p className="muted">Checking what's available…</p>}
      {status && !plan.length && <p className="muted">Nothing to fill: everything this can fill is already there.</p>}
      {status && plan.length > 0 && (
        <>
          <p className="muted small">Only empty fields are filled, and everything filled is marked “From TMDB” or “AI-translated”. Nothing is saved until you save the form.</p>
          {tmdbRows.length > 0 && (
            <section className="fill-group">
              <h3>From TMDB</h3>
              {tmdbRows.map(renderRow)}
            </section>
          )}
          {translateRows.length > 0 && (
            <section className="fill-group">
              <h3>Translations</h3>
              <p className="muted small">{status.tmdb ? 'TMDB first where it has them, then Cloudflare AI translates from the English.' : 'Cloudflare AI translates from the English.'}</p>
              {translateRows.map(renderRow)}
            </section>
          )}
          {!status.tmdb && <p className="small text-warn">TMDB isn't set up, so headshots, English bios and official titles aren't offered (see README → Artwork).</p>}
          {!status.ai && <p className="small text-warn">Cloudflare AI isn't connected, so empty translations stay empty unless TMDB has them.</p>}
          {error && <p className="callout callout--warn">{error}</p>}
          <footer className="fill-dialog__bar">
            <button type="button" className="btn btn--primary" onClick={fill} disabled={busy || !chosen?.size}>
              {busy ? 'Filling…' : `Fill ${chosen?.size ?? 0} field${chosen?.size === 1 ? '' : 's'}`}
            </button>
            {busy && <span className="muted small">Looking things up and translating can take a few seconds.</span>}
          </footer>
        </>
      )}
    </dialog>
  );
}

/** A one-line summary of a fill, for the toast. */
export function describeFill(r: FillResult): string {
  const keys = Object.keys(r.filled);
  if (!keys.length) return 'Nothing could be filled this time.';
  const tmdb = keys.filter((k) => r.filled[k] === 'tmdb').length;
  return `Filled ${keys.length} field${keys.length === 1 ? '' : 's'} (${tmdb} from TMDB, ${keys.length - tmdb} by AI). Check them, then save.`;
}
