import { useId, useMemo, useState } from 'react';
import { flag } from '../i18n';
import { PLATFORMS, type Availability, type FieldSpec, type I18n, type Medium } from '../shared/schema';
import { api } from './api';
import { useAction, useAdmin } from './context';

type Value = unknown;

/** All ISO country codes the browser can name, A–Z by English name. */
const COUNTRIES: { code: string; name: string }[] = (() => {
  const dn = new Intl.DisplayNames(['en'], { type: 'region' });
  const out: { code: string; name: string }[] = [];
  for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) {
    const code = String.fromCharCode(a, b);
    try {
      const name = dn.of(code);
      if (name && name !== code && !/unknown/i.test(name)) out.push({ code, name });
    } catch { /* not a region */ }
  }
  return out.sort((x, y) => x.name.localeCompare(y.name));
})();

export function I18nInput({ label, value, onChange, multiline, required, hint }: {
  label: string; value?: I18n; onChange: (v: I18n | undefined) => void; multiline?: boolean; required?: boolean; hint?: string;
}) {
  const id = useId();
  const v = value ?? { en: '' };
  const set = (lang: 'en' | 'ja', s: string) => {
    const next = { ...v, [lang]: s };
    onChange(next.en || next.ja ? next : undefined);
  };
  const Input = multiline ? 'textarea' : 'input';
  return (
    <div className="field">
      <label className="field__label" htmlFor={`${id}-en`}>{label}{required && <span className="req">*</span>}</label>
      <div className="i18n">
        <div className="i18n__col">
          <span className="i18n__lang">EN</span>
          <Input id={`${id}-en`} value={v.en ?? ''} rows={multiline ? 5 : undefined} onChange={(e) => set('en', e.target.value)} />
        </div>
        <div className="i18n__col" lang="ja">
          <span className="i18n__lang">日本語</span>
          <Input value={v.ja ?? ''} rows={multiline ? 5 : undefined} onChange={(e) => set('ja', e.target.value)}
            className={v.en && !v.ja ? 'is-missing' : ''} placeholder={v.en ? '未翻訳 — English will be shown' : ''} />
        </div>
      </div>
      {hint && <p className="field__hint">{hint}</p>}
    </div>
  );
}

function Labelled({ spec, children, htmlFor }: { spec: FieldSpec; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={htmlFor}>{spec.label}{spec.required && <span className="req">*</span>}</label>
      {children}
      {spec.hint && <p className="field__hint">{spec.hint}</p>}
    </div>
  );
}

const IMAGE_KEYS = ['poster', 'backdrop', 'cover', 'photo', 'logo'];

export function FieldInput({ spec, value, onChange, medium, locked }: {
  spec: FieldSpec; value: Value; onChange: (v: Value) => void; medium: Medium; locked?: boolean;
}) {
  const id = useId();
  if (spec.i18n) {
    return <I18nInput label={spec.label} value={value as I18n} onChange={onChange} multiline={spec.type === 'textarea'} required={spec.required} hint={spec.hint} />;
  }
  switch (spec.type) {
    case 'id':
      return (
        <Labelled spec={locked ? { ...spec, hint: 'Ids are permanent once created (links use them).' } : spec} htmlFor={id}>
          <input id={id} value={(value as string) ?? ''} disabled={locked} placeholder="auto" onChange={(e) => onChange(e.target.value || undefined)} />
        </Labelled>
      );
    case 'text':
      return <Labelled spec={spec} htmlFor={id}><input id={id} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value || undefined)} /></Labelled>;
    case 'textarea':
      return <Labelled spec={spec} htmlFor={id}><textarea id={id} rows={4} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value || undefined)} /></Labelled>;
    case 'number':
      return (
        <Labelled spec={spec} htmlFor={id}>
          <input id={id} type="number" min={spec.min} max={spec.max} value={(value as number) ?? ''} className="input--short"
            onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))} />
        </Labelled>
      );
    case 'date':
      return <Labelled spec={spec} htmlFor={id}><input id={id} type="date" className="input--short" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value || undefined)} /></Labelled>;
    case 'url': {
      const url = (value as string) ?? '';
      return (
        <Labelled spec={spec} htmlFor={id}>
          <div className="url-field">
            <input id={id} type="url" value={url} placeholder="https://…" onChange={(e) => onChange(e.target.value || undefined)} />
            {url && IMAGE_KEYS.includes(spec.key) && <img className="url-field__thumb" src={url} alt="" onError={(e) => (e.currentTarget.style.opacity = '0.2')} />}
            {url && !IMAGE_KEYS.includes(spec.key) && <a href={url} target="_blank" rel="noreferrer" className="url-field__open">Open ↗</a>}
          </div>
        </Labelled>
      );
    }
    case 'bool':
      return (
        <label className="field field--check">
          <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked || undefined)} />
          <span>{spec.label}</span>
        </label>
      );
    case 'select':
      return (
        <Labelled spec={spec} htmlFor={id}>
          <select id={id} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value || undefined)}>
            {!spec.required && <option value="">—</option>}
            {spec.options!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Labelled>
      );
    case 'country':
      return (
        <Labelled spec={spec} htmlFor={id}>
          <select id={id} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value || undefined)}>
            <option value="">—</option>
            {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{flag(c.code)} {c.name}</option>)}
          </select>
        </Labelled>
      );
    case 'countries': {
      const list = (value as string[]) ?? [];
      return (
        <Labelled spec={spec} htmlFor={id}>
          <div className="picked">
            {list.map((c) => (
              <span key={c} className="picked__chip">{flag(c)} {COUNTRIES.find((x) => x.code === c)?.name ?? c}
                <button type="button" aria-label={`Remove ${c}`} onClick={() => onChange(list.filter((x) => x !== c))}>×</button>
              </span>
            ))}
            <select id={id} value="" className="picked__add" onChange={(e) => e.target.value && onChange([...list, e.target.value])}>
              <option value="">+ Add country…</option>
              {COUNTRIES.filter((c) => !list.includes(c.code)).map((c) => <option key={c.code} value={c.code}>{flag(c.code)} {c.name}</option>)}
            </select>
          </div>
        </Labelled>
      );
    }
    case 'platforms': {
      const list = (value as string[]) ?? [];
      return (
        <Labelled spec={spec}>
          <div className="platform-grid">
            {Object.entries(PLATFORMS).map(([code, name]) => (
              <label key={code} className={`check-chip ${list.includes(code) ? 'is-on' : ''}`}>
                <input type="checkbox" checked={list.includes(code)} onChange={(e) => onChange(e.target.checked ? [...list, code] : list.filter((x) => x !== code))} />
                {name}
              </label>
            ))}
          </div>
        </Labelled>
      );
    }
    case 'availability': {
      const a = (value as Availability) ?? {};
      const set = (patch: Partial<Availability>) => {
        const next = { ...a, ...patch };
        onChange(next.free || next.limited_time || next.until ? next : undefined);
      };
      return (
        <Labelled spec={spec}>
          <div className="availability-field">
            <label className="field--check"><input type="checkbox" checked={!!a.free} onChange={(e) => set({ free: e.target.checked || undefined })} /> 🎟 Free to watch</label>
            <label className="field--check"><input type="checkbox" checked={!!a.limited_time} onChange={(e) => set({ limited_time: e.target.checked || undefined })} /> ⏳ Limited time</label>
            <label className="availability-field__until">until <input type="date" value={a.until ?? ''} onChange={(e) => set({ until: e.target.value || undefined })} /></label>
          </div>
        </Labelled>
      );
    }
    case 'refs':
      return <RefPicker spec={spec} value={(value as string[]) ?? []} onChange={onChange} medium={medium} />;
  }
}

/** Pick people / studios / genres by name, in order, with "create new" for anything missing. */
function RefPicker({ spec, value, onChange, medium }: { spec: FieldSpec; value: string[]; onChange: (v: Value) => void; medium: Medium }) {
  const { data, reload } = useAdmin();
  const run = useAction();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const id = useId();

  const options = useMemo(() => {
    if (spec.to === 'person') return data.people.map((p) => ({ id: p.id, en: p.name.en, ja: p.name.ja }));
    if (spec.to === 'company') return data.companies.map((p) => ({ id: p.id, en: p.name.en, ja: p.name.ja }));
    return data.genres.filter((g) => g.medium === medium).map((g) => ({ id: g.slug, en: g.name.en, ja: g.name.ja }));
  }, [data, spec.to, medium]);

  const label = (ref: string) => {
    const o = options.find((x) => x.id === ref);
    return o ? `${o.en}${o.ja && o.ja !== o.en ? ` · ${o.ja}` : ''}` : `⚠ ${ref} (missing)`;
  };
  const q = query.trim().toLowerCase();
  const matches = q ? options.filter((o) => !value.includes(o.id) && `${o.en} ${o.ja ?? ''} ${o.id}`.toLowerCase().includes(q)).slice(0, 8) : [];
  const exact = options.some((o) => o.en.toLowerCase() === q || o.ja === query.trim());

  const add = (ref: string) => { onChange([...value, ref]); setQuery(''); };
  const move = (i: number, d: -1 | 1) => {
    const next = [...value];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange(next);
  };
  const create = async () => {
    const name = query.trim();
    const type = spec.to!;
    const body = type === 'genre' ? { medium, name: { en: name } } : { name: { en: name } };
    const res = await run(() => api.create(type, body), `Created “${name}” — add its Japanese name later`);
    if (!res) return;
    await reload();
    add(type === 'genre' ? (res.doc as { slug: string }).slug : res.doc.id);
  };

  return (
    <Labelled spec={spec} htmlFor={id}>
      <div className="picked">
        {value.map((ref, i) => (
          <span key={ref} className={`picked__chip ${options.some((o) => o.id === ref) ? '' : 'is-missing'}`}>
            {spec.to === 'genre' ? '# ' : ''}{label(ref)}
            {value.length > 1 && i > 0 && <button type="button" aria-label="Move earlier" onClick={() => move(i, -1)}>‹</button>}
            {value.length > 1 && i < value.length - 1 && <button type="button" aria-label="Move later" onClick={() => move(i, 1)}>›</button>}
            <button type="button" aria-label={`Remove ${ref}`} onClick={() => onChange(value.filter((x) => x !== ref))}>×</button>
          </span>
        ))}
        <div className="combo">
          <input id={id} value={query} placeholder={`+ Add ${spec.to === 'genre' ? 'genre' : spec.to === 'company' ? 'studio' : 'person'}…`}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); if (matches[0]) add(matches[0].id); else if (q && !exact) create(); }
            }} />
          {open && q && (
            <ul className="combo__list" role="listbox">
              {matches.map((o) => (
                <li key={o.id}><button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => add(o.id)}>
                  {o.en}{o.ja && o.ja !== o.en && <span className="muted"> · {o.ja}</span>} <span className="muted small">{o.id}</span>
                </button></li>
              ))}
              {!exact && (
                <li><button type="button" className="combo__create" onMouseDown={(e) => e.preventDefault()} onClick={create}>
                  ＋ Create {spec.to === 'genre' ? `genre in this section` : spec.to === 'company' ? 'studio' : 'person'} “{query.trim()}”
                </button></li>
              )}
            </ul>
          )}
        </div>
      </div>
    </Labelled>
  );
}

