import type { CSSProperties } from 'react';
import { getGenre, getPerson, hueOf } from '../data';
import { countryName, flag, useLang } from '../i18n';
import { VLink } from './VLink';

export function initials(name: string) {
  const parts = name.replace(/[（(].*?[)）]/g, '').split(/[\s・＝=-]+/).filter(Boolean);
  if (!parts.length) return '?';
  // Japanese names in katakana: use the first character.
  if (/[぀-ヿ一-鿿]/.test(parts[0])) return parts[0][0];
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function Avatar({ slug, size = 36 }: { slug: string; size?: number }) {
  const { lang } = useLang();
  const p = getPerson(slug);
  const name = p ? p[lang].name : slug;
  return (
    <span className="avatar" style={{ '--h': hueOf(slug), width: size, height: size } as CSSProperties} aria-hidden>
      {p?.en.photo ? <img src={p.en.photo} alt="" loading="lazy" /> : initials(p?.en.name ?? name)}
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

export function GenreTag({ slug, count }: { slug: string; count?: number }) {
  const { lang } = useLang();
  const g = getGenre(slug);
  if (!g) return null;
  return (
    <VLink to={`/genre/${slug}`} className="tag" style={{ '--h': g.en.hue ?? hueOf(slug) } as CSSProperties}>
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
