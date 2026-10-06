import { useState, type CSSProperties } from 'react';
import { genrePath, getCompany, getGenre, getPerson, hueOf } from '../data';
import { countryName, flag, useLang } from '../i18n';
import { PLATFORMS, type Medium } from '../shared/schema';
import { VLink } from './VLink';

export function initials(name: string) {
  const parts = name.replace(/[（(].*?[)）]/g, '').split(/[\s・＝=-]+/).filter(Boolean);
  if (!parts.length) return '?';
  // Japanese names: use the first character.
  if (/[぀-ヿ一-鿿]/.test(parts[0])) return parts[0][0];
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function Avatar({ slug, size = 36 }: { slug: string; size?: number }) {
  const p = getPerson(slug);
  const [failed, setFailed] = useState(false);
  return (
    <span className="avatar" style={{ '--h': hueOf(slug), width: size, height: size } as CSSProperties} aria-hidden>
      {p?.doc.photo && !failed ? <img src={p.doc.photo} alt="" loading="lazy" onError={() => setFailed(true)} /> : initials(p?.en.name ?? slug)}
    </span>
  );
}

export function PersonChip({ slug }: { slug: string }) {
  const { lang } = useLang();
  const p = getPerson(slug);
  if (!p) return null;
  return (
    <VLink to={`/person/${slug}`} className="person-chip">
      <Avatar slug={slug} />
      <span>{p[lang].name}</span>
    </VLink>
  );
}

export function StudioChip({ slug }: { slug: string }) {
  const { lang } = useLang();
  const c = getCompany(slug);
  if (!c) return null;
  return (
    <VLink to={`/studio/${slug}`} className="person-chip studio-chip">
      <span className="studio-chip__mark" style={{ '--h': hueOf(slug) } as CSSProperties} aria-hidden>
        {c.doc.logo ? <img src={c.doc.logo} alt="" loading="lazy" /> : '◆'}
      </span>
      <span>{c[lang].name}</span>
    </VLink>
  );
}

export function GenreTag({ medium, slug, count }: { medium: Medium; slug: string; count?: number }) {
  const { lang } = useLang();
  const g = getGenre(medium, slug);
  if (!g) return null;
  return (
    <VLink to={genrePath(medium, slug)} className="tag" style={{ '--h': g.doc.hue ?? hueOf(slug) } as CSSProperties}>
      <span className="tag__hash" aria-hidden>#</span>
      {g[lang].name}
      {count != null && <span className="tag__count">{count}</span>}
    </VLink>
  );
}

export function CountryTag({ code }: { code: string }) {
  const { lang } = useLang();
  return (
    <VLink to={`/country/${code}`} className="tag tag--country">
      <span aria-hidden>{flag(code)}</span>
      {countryName(code, lang)}
    </VLink>
  );
}

export function PlatformTag({ code }: { code: string }) {
  return (
    <VLink to={`/search?m=play&p=${code}`} className="tag tag--platform">
      <span aria-hidden>🕹</span>
      {PLATFORMS[code] ?? code}
    </VLink>
  );
}
