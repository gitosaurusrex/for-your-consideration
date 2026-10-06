import { useCallback, useRef, useState } from 'react';
import { api, type TranslateFillResult } from './api';
import { useAdmin } from './context';

type State = {
  running: boolean; done: number; total: number;
  filled: TranslateFillResult['filled']; notes: TranslateFillResult['notes']; stopped?: string;
};

/** Fill empty translations everywhere (TMDB, then Cloudflare AI), a few records at a time, reporting progress. */
export function useTranslateFill(onDone: () => void) {
  const { reload } = useAdmin();
  const [state, setState] = useState<State>({ running: false, done: 0, total: 0, filled: [], notes: [] });
  const running = useRef(false);

  const run = useCallback(async (total: number) => {
    if (running.current || total === 0) return;
    running.current = true;
    const done: string[] = [];
    const filled: State['filled'] = [];
    const notes: State['notes'] = [];
    let stopped: string | undefined;
    setState({ running: true, done: 0, total, filled, notes });
    try {
      for (;;) {
        // Every record already done this pass is skipped, so each is tried once.
        const r = await api.translateFill(done);
        done.push(...r.done);
        filled.push(...r.filled);
        notes.push(...r.notes);
        stopped = r.stopped;
        setState({ running: true, done: done.length, total: Math.max(total, done.length + r.remaining), filled: [...filled], notes: [...notes], stopped });
        if (r.remaining === 0 || stopped || !r.done.length) break;
      }
    } catch (e) {
      stopped = (e as Error).message;
    } finally {
      running.current = false;
      setState((s) => ({ ...s, running: false, stopped }));
      await reload();
      onDone();
    }
  }, [reload, onDone]);

  return { ...state, run };
}

const count = (got: Record<string, string>, src: string) => Object.values(got).filter((s) => s === src).length;

export function TranslateFillProgress({ running, done, total, filled, notes, stopped }: ReturnType<typeof useTranslateFill>) {
  if (!running && !done && !stopped) return null;
  const fields = filled.reduce((n, f) => n + Object.keys(f.got).length, 0);
  const fromTmdb = filled.reduce((n, f) => n + count(f.got, 'tmdb'), 0);
  return (
    <div className="mirror-progress" role="status">
      <div className="mirror-progress__bar"><span style={{ width: `${total ? Math.round((done / total) * 100) : 100}%` }} /></div>
      <p className="small">
        {running
          ? `Translating… ${done} / ${total}`
          : fields ? `Filled ${fields} translation${fields === 1 ? '' : 's'} in ${filled.length} record${filled.length === 1 ? '' : 's'}: ${fromTmdb} from TMDB, ${fields - fromTmdb} by AI. AI translations are flagged for review.`
          : 'Nothing could be filled this time.'}
      </p>
      {stopped && <p className="small text-warn">{stopped}</p>}
      {filled.length > 0 && (
        <details className="small">
          <summary>{filled.length} filled in</summary>
          <ul>{filled.map((f) => <li key={f.key}><b>{f.label}</b>: {Object.entries(f.got).map(([k, s]) => `${k} (${s === 'ai' ? 'AI' : 'TMDB'})`).join(', ')}</li>)}</ul>
        </details>
      )}
      {notes.length > 0 && (
        <details className="small">
          <summary className="text-warn">{notes.length} note{notes.length === 1 ? '' : 's'}</summary>
          <ul>{notes.map((n, i) => <li key={i}><b>{n.label}</b>: {n.note}</li>)}</ul>
        </details>
      )}
    </div>
  );
}
