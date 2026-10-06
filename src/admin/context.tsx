import { createContext, useCallback, useContext, useEffect, useState, type FormEvent, type ReactNode } from 'react';
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

  const load = useCallback(() => {
    setError(null);
    return Promise.all([api.me(), reload()])
      .then(([me]) => setEmail(me.email))
      .catch(setError);
  }, [reload]);

  useEffect(() => { load(); }, [load]);

  const toast = useCallback((msg: string, kind: 'ok' | 'error' = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 7000 : 3500);
  }, []);

  if (error instanceof ApiError && error.status === 401) return <Login onSignedIn={load} />;
  if (error) {
    return (
      <div className="admin-gate">
        <h1>🔒 Admin</h1>
        <p>{error.message}</p>
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

function Login({ onSignedIn }: { onSignedIn: () => Promise<void> }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      await api.login(password);
      await onSignedIn();
    } catch (err) {
      setMessage((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="admin">
      <form className="admin-gate" onSubmit={submit}>
        <h1>🔒 Admin</h1>
        <label className="field admin-gate__field">
          <span className="field__label">Password</span>
          <input type="password" autoComplete="current-password" autoFocus required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {message && <p className="text-error" role="alert">{message}</p>}
        <button className="btn btn--primary" disabled={busy || !password}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
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
