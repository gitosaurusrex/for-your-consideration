import { motion } from 'motion/react';
import { useMemo, type CSSProperties } from 'react';
import { useSearchParams } from 'react-router';
import { music, search, titles } from '../data';
import { useLang, type Strings } from '../i18n';
import { Grid } from '../components/Grid';
import { usePageHue } from '../components/Layout';
import type { Item } from '../types';

const config = {
  watch: { items: titles as Item[], kinds: ['film', 'tv'] as const, hue: 268, icon: '🎬', title: (t: Strings) => t.navWatch, plural: { film: 'films', tv: 'tvs' } as const },
  listen: { items: music as Item[], kinds: ['song', 'album'] as const, hue: 320, icon: '🎧', title: (t: Strings) => t.navListen, plural: { song: 'songs', album: 'albums' } as const },
};

export function Browse({ section }: { section: 'watch' | 'listen' }) {
  const { lang, t } = useLang();
  const cfg = config[section];
  usePageHue(cfg.hue);
  const [params, setParams] = useSearchParams();
  const kind = params.get('type') ?? 'all';
  const q = params.get('q') ?? '';

  const items = useMemo(() => {
    const base = q ? search(q, lang).filter((i) => i.section === section) : cfg.items;
    return kind === 'all' ? base : base.filter((i) => i.en.kind === kind);
  }, [q, kind, lang, section, cfg.items]);

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (!value || value === 'all') next.delete(key); else next.set(key, value);
    setParams(next, { replace: true, preventScrollReset: true });
  };

  const filters = ['all', ...cfg.kinds] as const;
  const label = (f: (typeof filters)[number]) =>
    f === 'all' ? t.all : t[(cfg.plural as Record<string, keyof Strings>)[f]] as string;

  return (
    <div className="page browse">
      <header className="page-head">
        <p className="eyebrow reveal" style={{ '--i': 0 } as CSSProperties}>{t.recsCount(cfg.items.length)}</p>
        <h1 className="page-title reveal" style={{ '--i': 1 } as CSSProperties}><span aria-hidden>{cfg.icon}</span> {cfg.title(t)}</h1>
      </header>
      <div className="toolbar reveal" style={{ '--i': 2 } as CSSProperties}>
        <div className="segmented" role="tablist">
          {filters.map((f) => (
            <button key={f} role="tab" aria-selected={kind === f} className={kind === f ? 'is-active' : ''} onClick={() => update('type', f)}>
              {kind === f && <motion.span layoutId={`filter-${section}`} className="segmented__thumb" transition={{ type: 'spring', stiffness: 400, damping: 32 }} />}
              <span className="segmented__label">{label(f)}</span>
            </button>
          ))}
        </div>
        <label className="search">
          <span aria-hidden>⌕</span>
          <input type="search" value={q} placeholder={t.searchPlaceholder} onChange={(e) => update('q', e.target.value)} aria-label={t.searchPlaceholder} />
        </label>
      </div>
      <Grid items={items} instance={`grid-${section}`} />
    </div>
  );
}
