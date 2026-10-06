import { useCallback, useRef, useState } from 'react';
import { IMAGE_FIELDS, isStoredImage, type AnyDoc } from '../shared/schema';
import { api, type MirrorResult } from './api';
import { useAdmin } from './context';

/** How many images are still linked from other sites rather than stored here. */
export function countLinked(docs: AnyDoc[]) {
  let linked = 0, stored = 0;
  for (const d of docs) for (const f of IMAGE_FIELDS) {
    const v = (d as unknown as Record<string, string | undefined>)[f];
    if (!v) continue;
    if (isStoredImage(v)) stored++; else linked++;
  }
  return { linked, stored };
}

/** Copy every linked image into storage, a few at a time, reporting progress. */
export function useMirror() {
  const { reload } = useAdmin();
  const [state, setState] = useState<{ running: boolean; done: number; total: number; failed: MirrorResult['failed'] }>({ running: false, done: 0, total: 0, failed: [] });
  const running = useRef(false);

  const run = useCallback(async (total: number) => {
    if (running.current || total === 0) return;
    running.current = true;
    const failed: MirrorResult['failed'] = [];
    let done = 0;
    setState({ running: true, done, total, failed });
    try {
      for (;;) {
        const r = await api.mirror(failed.map((f) => f.url));
        done += r.copied + r.failed.length;
        failed.push(...r.failed);
        setState({ running: true, done, total: Math.max(total, done + r.remaining), failed: [...failed] });
        if (r.remaining === 0) break;
      }
    } catch (e) {
      failed.push({ label: 'Stopped', field: '', url: '', error: (e as Error).message });
    } finally {
      running.current = false;
      setState((s) => ({ ...s, running: false, failed: [...failed] }));
      await reload();
    }
  }, [reload]);

  return { ...state, run };
}

export function MirrorProgress({ running, done, total, failed }: ReturnType<typeof useMirror>) {
  if (!running && !done && !failed.length) return null;
  const saved = done - failed.filter((f) => f.url).length;
  return (
    <div className="mirror-progress" role="status">
      <div className="mirror-progress__bar"><span style={{ width: `${total ? Math.round((done / total) * 100) : 100}%` }} /></div>
      <p className="small">
        {running ? `Saving copies of artwork… ${done} / ${total}` : saved ? `Saved ${saved} image${saved === 1 ? '' : 's'} to your site.` : 'Nothing could be copied this time.'}
      </p>
      {failed.length > 0 && (
        <details className="small">
          <summary className="text-warn">{failed.length} couldn't be copied (they stay linked)</summary>
          <ul>{failed.map((f, i) => <li key={i}><b>{f.label}</b>{f.field && ` · ${f.field}`}: {f.error}</li>)}</ul>
        </details>
      )}
    </div>
  );
}
