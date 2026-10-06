import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { ENTITY_TYPES, fieldsFor, KIND_MEDIUM, type AnyDoc, type EntityType, type ItemKind, type Medium } from '../shared/schema';
import { api, ApiError, type FillResult, type RefList } from './api';
import { describeFill, FillDialog } from './FillDialog';
import { useAdmin } from './context';
import { FieldInput } from './fields';
import { adminEditPath, sitePath, TYPE_LABEL } from './links';

type Form = Record<string, unknown>;

export function EditPage() {
  const { type = '', id } = useParams();
  const [params] = useSearchParams();
  if (!(ENTITY_TYPES as string[]).includes(type)) return <p>Unknown type.</p>;
  // Remount when switching records so form state never leaks between them.
  return <Editor key={`${type}/${id ?? 'new'}`} type={type as EntityType} id={id} initialKind={params.get('kind') as ItemKind | null} initialMedium={params.get('medium') as Medium | null} />;
}

function Editor({ type, id, initialKind, initialMedium }: { type: EntityType; id?: string; initialKind: ItemKind | null; initialMedium: Medium | null }) {
  const { reload, toast } = useAdmin();
  const navigate = useNavigate();
  const isNew = !id;
  const [form, setForm] = useState<Form | null>(isNew ? (type === 'item' ? { kind: initialKind ?? 'film' } : type === 'genre' ? { medium: initialMedium ?? 'watch' } : {}) : null);
  const [saved, setSaved] = useState<AnyDoc | null>(null);
  const [usedBy, setUsedBy] = useState<RefList[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [filling, setFilling] = useState(false);

  useEffect(() => {
    if (isNew) return;
    api.get(type, id!)
      .then((r) => { setForm(r.doc as unknown as Form); setSaved(r.doc); setUsedBy(r.referencedBy); })
      .catch((e) => setErrors([(e as Error).message]));
  }, [type, id, isNew]);

  const kind = form?.kind as ItemKind | undefined;
  const medium: Medium = type === 'item' ? KIND_MEDIUM[kind ?? 'film'] : ((form?.medium as Medium) ?? 'watch');
  const fields = useMemo(() => fieldsFor(type, kind), [type, kind]);
  const dirty = !!form && JSON.stringify(form) !== JSON.stringify(saved ?? {});

  if (!form) return <div className="admin-page">{errors.length ? <p className="text-error">{errors[0]}</p> : <p className="muted">Loading…</p>}</div>;

  const title = type === 'item' ? (form.title as { en?: string })?.en : (form.name as { en?: string })?.en;

  const save = async () => {
    setBusy(true);
    setErrors([]);
    try {
      const res = isNew ? await api.create(type, form) : await api.update(type, id!, form);
      setWarnings(res.warnings);
      setSaved(res.doc);
      setForm(res.doc as unknown as Form);
      await reload();
      toast(isNew ? `Created “${title}”` : 'Saved');
      if (isNew) navigate(adminEditPath(type, res.doc.id), { replace: true });
    } catch (e) {
      const body = e instanceof ApiError ? e.body : {};
      setErrors((body.errors as string[]) ?? [(e as Error).message]);
      setWarnings((body.warnings as string[]) ?? []);
    } finally {
      setBusy(false);
    }
  };

  /** Put a "Fill in missing" result into the form (not saved until the editor saves). */
  const applyFill = (r: FillResult) => {
    if (Object.keys(r.filled).length) setForm((f) => ({ ...f!, ...r.patch }));
    toast(describeFill(r));
    for (const note of [...r.notes, ...(r.aiStopped ? [r.aiStopped] : [])]) toast(note, 'error');
  };

  const remove = async () => {
    if (!confirm(`Delete “${title}”? This can't be undone.`)) return;
    try {
      await api.remove(type, id!);
      await reload();
      toast(`Deleted “${title}”`);
      navigate(TYPE_LABEL[type].list);
    } catch (e) {
      const refs = (e instanceof ApiError ? e.body.referencedBy : undefined) as RefList[] | undefined;
      if (refs) setUsedBy(refs);
      setErrors([(e as Error).message]);
    }
  };

  return (
    <div className="admin-page">
      <p className="crumbs"><Link to={TYPE_LABEL[type].list}>← {TYPE_LABEL[type].many}</Link></p>
      <div className="admin-head">
        <h1>{isNew ? `New ${TYPE_LABEL[type].one}` : title || id}</h1>
        <div className="admin-head__actions">
          {type !== 'company' && (
            <button className="btn btn--find" onClick={() => setFilling(true)}
              title="Choose what to fill from TMDB and Cloudflare AI. Nothing is saved until you save.">
              ✨ Fill in missing
            </button>
          )}
          {saved && <a className="btn btn--ghost" href={sitePath(type, saved)} target="_blank" rel="noreferrer">View on site ↗</a>}
          {!isNew && <button className="btn btn--danger" onClick={remove}>Delete</button>}
        </div>
      </div>

      {errors.length > 0 && (
        <div className="callout callout--error" role="alert">
          <strong>Couldn't save:</strong>
          <ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="callout callout--warn">
          <ul>{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </div>
      )}

      {filling && <FillDialog type={type} form={form} onFilled={applyFill} onClose={() => setFilling(false)} />}

      <form className="panel form" onSubmit={(e) => { e.preventDefault(); save(); }}>
        {fields.map((spec) => (
          <FieldInput
            key={spec.key}
            spec={spec}
            medium={medium}
            value={form[spec.key]}
            locked={!isNew && (spec.type === 'id' || (type === 'genre' && spec.key === 'medium'))}
            onChange={(v) => setForm((f) => ({ ...f!, [spec.key]: v }))}
            entityType={type}
            form={form}
            setFields={(patch) => setForm((f) => ({ ...f!, ...patch }))}
          />
        ))}
        <div className="form__bar">
          <button className="btn btn--primary" disabled={busy || (!dirty && !isNew)}>{busy ? 'Saving…' : isNew ? 'Create' : 'Save changes'}</button>
          {dirty && !isNew && <button type="button" className="btn btn--ghost" onClick={() => setForm(saved as unknown as Form)}>Discard changes</button>}
          {dirty && <span className="muted small">Unsaved changes</span>}
        </div>
      </form>

      {type !== 'item' && !isNew && (
        <section className="panel">
          <h2>Used by {usedBy.length} item{usedBy.length === 1 ? '' : 's'}</h2>
          {usedBy.length ? (
            <ul className="used-by">
              {usedBy.map((r) => <li key={r.id}><Link to={adminEditPath('item', r.id)}>{r.title.en}</Link> <span className="muted small">{r.kind}</span></li>)}
            </ul>
          ) : <p className="muted">Not used by anything — safe to delete. It won't appear on the public site until an item links to it.</p>}
        </section>
      )}
    </div>
  );
}
