import { useCallback, useRef, useState } from 'react';
import { hasText, type PersonDoc } from '../shared/schema';
import { api, type FillPeopleResult } from './api';
import { useAdmin } from './context';

/** People with no headshot or no bio (in either language). Same rule as the server's needsFill. */
export const missingPhotoOrBio = (people: PersonDoc[]) => people.filter((p) => !p.photo || !hasText(p.bio));

type State = { running: boolean; done: number; total: number; filled: FillPeopleResult['filled']; failed: FillPeopleResult['failed'] };

/** Fill in missing headshots and bios from TMDB, a few people at a time, reporting progress. */
export function useFillPeople() {
  const { reload } = useAdmin();
  const [state, setState] = useState<State>({ running: false, done: 0, total: 0, filled: [], failed: [] });
  const running = useRef(false);

  const run = useCallback(async (total: number) => {
    if (running.current || total === 0) return;
    running.current = true;
    const filled: State['filled'] = [];
    const failed: State['failed'] = [];
    setState({ running: true, done: 0, total, filled, failed });
    try {
      for (;;) {
        // Skipped people are passed back so the next batch moves on to someone new.
        const r = await api.fillPeople(failed.map((f) => f.id));
        filled.push(...r.filled);
        failed.push(...r.failed);
        const done = filled.length + failed.length;
        setState({ running: true, done, total: Math.max(total, done + r.remaining), filled: [...filled], failed: [...failed] });
        if (r.remaining === 0) break;
      }
    } catch (e) {
      failed.push({ id: '', label: 'Stopped', error: (e as Error).message });
    } finally {
      running.current = false;
      setState((s) => ({ ...s, running: false, failed: [...failed] }));
      await reload();
    }
  }, [reload]);

  return { ...state, run };
}

export function FillPeopleProgress({ running, done, total, filled, failed }: ReturnType<typeof useFillPeople>) {
  if (!running && !done && !failed.length) return null;
  return (
    <div className="mirror-progress" role="status">
      <div className="mirror-progress__bar"><span style={{ width: `${total ? Math.round((done / total) * 100) : 100}%` }} /></div>
      <p className="small">
        {running
          ? `Looking people up on TMDB… ${done} / ${total}`
          : filled.length ? `Filled in ${filled.length} ${filled.length === 1 ? 'person' : 'people'}. Check them on their pages.` : 'Nobody could be filled in this time.'}
      </p>
      {filled.length > 0 && (
        <details className="small">
          <summary>{filled.length} filled in</summary>
          <ul>{filled.map((f) => <li key={f.id}><b>{f.label}</b>: {f.got.join(' + ')}</li>)}</ul>
        </details>
      )}
      {failed.length > 0 && (
        <details className="small">
          <summary className="text-warn">{failed.length} skipped</summary>
          <ul>{failed.map((f, i) => <li key={f.id || i}><b>{f.label}</b>: {f.error}</li>)}</ul>
        </details>
      )}
    </div>
  );
}
