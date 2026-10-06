import type { CSSProperties, ReactNode } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { getMusic, getTitle, itemArt, itemHue, related } from '../data';
import { useLang } from '../i18n';
import { Art } from '../components/Art';
import { CountryTag, GenreTag, PersonChip } from '../components/Chips';
import { Shelf } from '../components/Grid';
import { usePageHue } from '../components/Layout';
import type { Item, Lang } from '../types';
import { NotFound } from './NotFound';

const other = (l: Lang): Lang => (l === 'en' ? 'ja' : 'en');

function BackButton({ fallback }: { fallback: string }) {
  const { t } = useLang();
  const navigate = useNavigate();
  const location = useLocation();
  // `location.key === 'default'` means this is the first page in the session (e.g. a shared link).
  const canGoBack = location.key !== 'default';
  return (
    <button className="back reveal" onClick={() => (canGoBack ? navigate(-1) : navigate(fallback, { viewTransition: true }))}>
      <span aria-hidden>←</span> {t.back}
    </button>
  );
}

function Credits({ label, slugs }: { label: string; slugs: string[] }) {
  if (!slugs.length) return null;
  return (
    <div className="credits">
      <h2 className="credits__label">{label}</h2>
      <div className="credits__list">{slugs.map((s) => <PersonChip key={s} slug={s} />)}</div>
    </div>
  );
}

function ExternalButton({ href, className, children }: { href?: string; className: string; children: ReactNode }) {
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`btn ${className}`}>
      {children}
      <span className="btn__arrow" aria-hidden>↗</span>
    </a>
  );
}

function DetailShell({ item, credits, actions, extraMeta }: { item: Item; credits: ReactNode; actions: ReactNode; extraMeta?: ReactNode }) {
  const { lang, t } = useLang();
  const hue = itemHue(item);
  usePageHue(hue);
  const loc = item[lang];
  const alt = item[other(lang)];
  const backdrop = item.section === 'watch' ? item.en.backdrop || item.en.poster : item.en.cover;
  const more = related(item);
  const reveal = (i: number) => ({ '--i': i }) as CSSProperties;

  return (
    <div className={`page detail detail--${item.section}`} style={{ '--h': hue } as CSSProperties}>
      <div className="detail__backdrop" aria-hidden>
        {backdrop ? <img src={backdrop} alt="" /> : <span className="detail__backdrop-fallback" />}
      </div>
      <BackButton fallback={item.section === 'watch' ? '/watch' : '/listen'} />
      <article className="detail__main">
        <div className="detail__art-wrap">
          {item.section === 'listen' && <span className={`vinyl ${itemArt(item) ? '' : 'vinyl--plain'}`} aria-hidden />}
          <Art item={item} className="detail__art vt-art" eager style={{ viewTransitionName: 'art' }} />
        </div>
        <div className="detail__info">
          <p className="eyebrow reveal" style={reveal(0)}>
            {t[item.en.kind]} · {item.en.year}
            {extraMeta}
          </p>
          <h1 className="detail__title reveal" style={reveal(1)}>{loc.title}</h1>
          {alt.title !== loc.title && <p className="detail__alt-title reveal" lang={other(lang)} style={reveal(2)}>{alt.title}</p>}
          <div className="detail__tags reveal" style={reveal(3)}>
            {item.en.countries.map((c) => <CountryTag key={c} code={c} />)}
            {item.en.genres.map((g) => <GenreTag key={g} slug={g} />)}
          </div>
          <p className="detail__summary reveal" style={reveal(4)}>{loc.summary}</p>
          <div className="reveal" style={reveal(5)}>{credits}</div>
          {loc.note && (
            <aside className="note reveal" style={reveal(6)}>
              <h2 className="note__label">✎ {t.whyIPicked}</h2>
              <p className="note__text">{loc.note}</p>
            </aside>
          )}
          <div className="detail__actions reveal" style={reveal(7)}>{actions}</div>
        </div>
      </article>
      {more.length > 0 && (
        <section className="section">
          <header className="section__head reveal" style={reveal(8)}><h2>✦ {t.moreLikeThis}</h2></header>
          <Shelf items={more} instance={`related-${item.slug}`} />
        </section>
      )}
    </div>
  );
}

export function TitleDetail() {
  const { slug = '' } = useParams();
  const { t } = useLang();
  const item = getTitle(slug);
  if (!item) return <NotFound />;
  const f = item.en;
  return (
    <DetailShell
      item={item}
      extraMeta={f.runtime ? <> · {t.runtime(f.runtime)}</> : null}
      credits={
        <>
          <Credits label={f.kind === 'tv' ? t.createdBy : t.directedBy} slugs={f.directors} />
          <Credits label={t.starring} slugs={f.cast ?? []} />
        </>
      }
      actions={
        <>
          <ExternalButton href={f.watch_url} className="btn--primary btn--xl">▶ {t.watchOn(f.watch_service)}</ExternalButton>
          <ExternalButton href={f.trailer_url} className="btn--ghost">{t.trailer}</ExternalButton>
        </>
      }
    />
  );
}

export function MusicDetail() {
  const { slug = '' } = useParams();
  const { lang, t } = useLang();
  const item = getMusic(slug);
  if (!item) return <NotFound />;
  const f = item.en;
  const album = item[lang].album;
  return (
    <DetailShell
      item={item}
      credits={
        <>
          <Credits label={t.by} slugs={f.artists} />
          {album && f.kind === 'song' && (
            <div className="credits">
              <h2 className="credits__label">{t.fromAlbum}</h2>
              <p className="credits__text">💿 {album}</p>
            </div>
          )}
        </>
      }
      actions={
        <>
          <ExternalButton href={f.spotify_url} className="btn--spotify btn--xl">
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden><path fill="currentColor" d="M12 1.5a10.5 10.5 0 1 0 0 21 10.5 10.5 0 0 0 0-21Zm4.8 15.15a.66.66 0 0 1-.9.22c-2.48-1.52-5.6-1.86-9.27-1.02a.66.66 0 1 1-.3-1.28c4.02-.92 7.47-.52 10.25 1.18.31.19.41.6.22.9Zm1.28-2.86a.82.82 0 0 1-1.13.27c-2.84-1.74-7.17-2.25-10.53-1.23a.82.82 0 1 1-.48-1.57c3.84-1.16 8.6-.6 11.87 1.4.39.24.51.75.27 1.13Zm.11-2.98C14.78 8.79 9.16 8.6 5.9 9.6a.99.99 0 1 1-.57-1.89c3.74-1.13 9.96-.91 13.88 1.41a.99.99 0 0 1-1.01 1.7Z"/></svg>
            {t.spotify}
          </ExternalButton>
          <ExternalButton href={f.video_url} className="btn--video">▶ {t.musicVideo}</ExternalButton>
        </>
      }
    />
  );
}
