import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { setCatalog, type Catalog } from '../data';
import { api, ApiError } from './api';

interface AdminCtx {
  data: Catalog;
  email: string;
  reload: () => Promise<void>;
  toast: (msg: string, kind?: 'ok' | 'error') => void;
}

const Ctx = createContext<AdminCtx | null>(null);

export function useAdmin() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAdmin outside AdminProvider');
  return c;
}

/** Load everything (including hidden sections) and keep the public data store in sync so previews render. */
export function AdminProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Catalog | null>(null);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<ApiError | Error | null>(null);
  const [toasts, setToasts] = useState<{ id: number; msg: string; kind: 'ok' | 'error' }[]>([]);

  const reload = useCallback(async () => {
    const all = await api.all();
    // Previews show every section, even ones switched off on the public site.
    setCatalog({ ...all, settings: { ...all.settings, media: { watch: true, listen: true, play: true } } });
    setData(all);
  }, []);

  useEffect(() => {
    Promise.all([api.me(), reload()])
      .then(([me]) => setEmail(me.email))
      .catch(setError);
  }, [reload]);

  const toast = useCallback((msg: string, kind: 'ok' | 'error' = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 7000 : 3500);
  }, []);

  if (error) {
    return (
      <div className="admin-gate">
        <h1>🔒 Admin</h1>
        <p>{error.message}</p>
        {error instanceof ApiError && error.status === 401 && <button className="btn btn--primary" onClick={() => location.reload()}>Sign in again</button>}
      </div>
    );
  }
  if (!data) return <div className="boot"><span className="boot__mark">FYC</span><span className="boot__msg">Loading admin…</span></div>;

  return (
    <Ctx.Provider value={{ data, email, reload, toast }}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className={`toast toast--${t.kind}`}>{t.msg}</div>)}
      </div>
    </Ctx.Provider>
  );
}

/** Run an API call, showing failures as a toast. */
export function useAction() {
  const { toast } = useAdmin();
  return useCallback(async <T,>(fn: () => Promise<T>, success?: string): Promise<T | undefined> => {
    try {
      const r = await fn();
      if (success) toast(success);
      return r;
    } catch (e) {
      toast((e as Error).message, 'error');
      return undefined;
    }
  }, [toast]);
}
