import { useEffect, useId, useRef, useState, type DragEvent } from 'react';
import { isStoredImage, KIND_MEDIUM, type EntityType, type FieldSpec, type I18n, type ItemKind } from '../shared/schema';
import { api, type ArtCandidate } from './api';
import { useAdmin } from './context';

/** Which image field gets the "Find art" button for this record. */
export function primaryArtField(type: EntityType, kind?: ItemKind): string | null {
  if (type === 'person') return 'photo';
  if (type !== 'item') return null;
  return KIND_MEDIUM[kind ?? 'film'] === 'watch' ? 'poster' : 'cover';
}

const host = (url: string) => { try { return new URL(url).hostname; } catch { return ''; } };

export function ImageField({ spec, value, onChange, entityType, form, setFields }: {
  spec: FieldSpec;
  value?: string;
  onChange: (v: string | undefined) => void;
  entityType: EntityType;
  form: Record<string, unknown>;
  setFields: (patch: Record<string, unknown>) => void;
}) {
  const { data, toast } = useAdmin();
  const id = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [finding, setFinding] = useState(false);
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [value]);

  const isPrimary = primaryArtField(entityType, form.kind as ItemKind | undefined) === spec.key;
  const stored = isStoredImage(value);

  const uploadFile = async (file?: File) => {
    if (!file) return;
    setBusy('Uploading…');
    try { onChange((await api.upload(file)).url); toast('Image uploaded'); }
    catch (e) { toast((e as Error).message, 'error'); }
    finally { setBusy(null); }
  };

  const saveCopy = async () => {
    if (!value) return;
    setBusy('Saving a copy…');
    try { onChange((await api.importImage(value)).url); toast('Saved a copy on your site'); }
    catch (e) { toast(`Couldn't copy it: ${(e as Error).message}`, 'error'); }
    finally { setBusy(null); }
  };

  /** Apply a Find-art choice, copying its images into storage first when "keep copies" is on. */
  const choose = async (c: ArtCandidate) => {
    setFinding(false);
    const patch: Record<string, unknown> = { ...c.fields };
    // A bio already written (by hand or earlier) is kept; Find art only fills an empty one.
    const bio = form.bio as I18n | undefined;
    const keptBio = !!(bio?.en || bio?.ja) && 'bio' in patch;
    if (keptBio) { delete patch.bio; delete patch.bio_credit; }
    if (data.settings.keepCopies) {
      setBusy('Saving a copy…');
      for (const [k, v] of Object.entries(c.fields)) {
        if (!['poster', 'backdrop', 'cover', 'photo', 'logo'].includes(k) || typeof v !== 'string') continue;
        try { patch[k] = (await api.importImage(v)).url; }
        catch (e) { toast(`Linked ${k} instead of copying it: ${(e as Error).message}`, 'error'); }
      }
      setBusy(null);
    }
    setFields(patch);
    const what = 'bio' in patch ? 'Artwork and bio' : 'Artwork';
    toast(`${what} set from ${c.source}${keptBio ? ' (kept your existing bio)' : ''} — remember to save`);
  };

  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>{spec.label}</label>
      <div
        className={`image-field ${drag ? 'is-drag' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e: DragEvent) => { e.preventDefault(); setDrag(false); uploadFile(e.dataTransfer.files[0]); }}
      >
        <div className={`image-field__preview image-field__preview--${spec.key}`}>
          {value && !broken ? <img src={value} alt="" onError={() => setBroken(true)} /> : <span>{broken ? '⚠ can’t load' : 'No image'}</span>}
          {busy && <span className="image-field__busy">{busy}</span>}
        </div>
        <div className="image-field__body">
          <input id={id} type="text" value={value ?? ''} placeholder="Paste an image link, upload, or drop a file here"
            onChange={(e) => onChange(e.target.value.trim() || undefined)} />
          <div className="image-field__actions">
            <button type="button" className="btn btn--small" onClick={() => fileRef.current?.click()} disabled={!!busy}>⬆ Upload…</button>
            {isPrimary && <button type="button" className="btn btn--small btn--find" onClick={() => setFinding(true)} disabled={!!busy}>✨ Find art</button>}
            {value && !stored && <button type="button" className="btn btn--small" onClick={saveCopy} disabled={!!busy} title="Download it into your site's storage so it never disappears">⤓ Save a copy</button>}
            {value && <button type="button" className="btn btn--small btn--quiet" onClick={() => onChange(undefined)} disabled={!!busy}>Remove</button>}
          </div>
          <p className="field__hint">
            {value ? (stored ? '✓ Stored on your site' : `Linked from ${host(value)}`) : 'JPEG, PNG, WebP, GIF or AVIF, up to 15 MB.'}
          </p>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" hidden
            onChange={(e) => { uploadFile(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
      </div>
      {finding && <FindArt entityType={entityType} form={form} onChoose={choose} onClose={() => setFinding(false)} />}
    </div>
  );
}

function FindArt({ entityType, form, onChoose, onClose }: {
  entityType: EntityType; form: Record<string, unknown>; onChoose: (c: ArtCandidate) => void; onClose: () => void;
}) {
  const [state, setState] = useState<{ loading: boolean; error?: string; candidates: ArtCandidate[] }>({ loading: true, candidates: [] });
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialog.current?.showModal();
    api.findArt(entityType, form)
      .then((r) => setState({ loading: false, candidates: r.candidates }))
      .catch((e) => setState({ loading: false, error: (e as Error).message, candidates: [] }));
    // Search once, with the form as it was when the dialog opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const title = (form.title as { en?: string })?.en ?? (form.name as { en?: string })?.en;
  return (
    <dialog ref={dialog} className="find-art" onClose={onClose} onClick={(e) => e.target === dialog.current && dialog.current?.close()}>
      <header className="find-art__head">
        <h2>Artwork for “{title}”</h2>
        <button type="button" className="btn btn--small btn--quiet" onClick={() => dialog.current?.close()}>Close</button>
      </header>
      {state.loading && <p className="muted">Searching…</p>}
      {state.error && <p className="callout callout--warn">{state.error}</p>}
      {!state.loading && !state.error && !state.candidates.length && <p className="muted">Nothing found. Try adjusting the English title or year, or add the TMDB/IGDB id, then search again.</p>}
      <div className="find-art__grid">
        {state.candidates.map((c, i) => (
          <button type="button" key={i} className="find-art__pick" onClick={() => onChoose(c)}>
            <img src={c.preview} alt="" loading="lazy" />
            <strong>{c.label}</strong>
            {c.detail && <span className="muted small">{c.detail}</span>}
            <span className="find-art__source">{c.source}{c.fields.backdrop ? ' · poster + backdrop' : ''}</span>
          </button>
        ))}
      </div>
    </dialog>
  );
}
