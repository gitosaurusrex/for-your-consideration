import { motion } from 'motion/react';
import { useEffect } from 'react';
import { Outlet, ScrollRestoration, useLocation } from 'react-router';
import { enabledMedia } from '../data';
import { useLang } from '../i18n';
import { usePeriod } from '../timeOfDay';
import { LANGS, type Lang } from '../types';
import { VLink, VNavLink } from './VLink';

const langLabel: Record<Lang, string> = { en: 'EN', ja: '日本語' };

/** Pages call this to tint the ambient background. */
export function usePageHue(hue: number | undefined) {
  useEffect(() => {
    document.documentElement.style.setProperty('--page-h', String(hue ?? 268));
  }, [hue]);
}

function LangToggle() {
  const { lang, setLang, t } = useLang();
  return (
    <div className="lang-toggle" role="radiogroup" aria-label={t.language}>
      {LANGS.map((l) => (
        <button
          key={l}
          role="radio"
          aria-checked={lang === l}
          className={lang === l ? 'is-active' : ''}
          onClick={() => lang !== l && setLang(l)}
          lang={l}
        >
          {lang === l && <motion.span layoutId="lang-thumb" className="lang-toggle__thumb" transition={{ type: 'spring', stiffness: 400, damping: 32 }} />}
          <span className="lang-toggle__label">{langLabel[l]}</span>
        </button>
      ))}
    </div>
  );
}

function Nav() {
  const { t } = useLang();
  const { pathname } = useLocation();
  const sections = {
    watch: { to: '/watch', label: t.navWatch, match: (p: string) => /^\/(watch|title|genre\/watch)/.test(p) },
    listen: { to: '/listen', label: t.navListen, match: (p: string) => /^\/(listen|music|genre\/listen)/.test(p) },
    play: { to: '/play', label: t.navPlay, match: (p: string) => /^\/(play|game|studio|genre\/play)/.test(p) },
  };
  const links = [{ to: '/', label: t.navHome, match: (p: string) => p === '/' }, ...enabledMedia.map((m) => sections[m])];
  return (
    <nav className="nav" aria-label="Main">
      {links.map((l) => {
        const active = l.match(pathname);
        return (
          <VNavLink key={l.to} to={l.to} className={active ? 'nav__link is-active' : 'nav__link'} end>
            {active && <motion.span layoutId="nav-pill" className="nav__pill" transition={{ type: 'spring', stiffness: 380, damping: 30 }} />}
            <span className="nav__label">{l.label}</span>
          </VNavLink>
        );
      })}
    </nav>
  );
}

export function Layout() {
  const { t } = useLang();
  const { pathname } = useLocation();
  usePeriod(); // keeps the time-of-day palette current
  return (
    <>
      <a href="#main" className="skip-link">{t.skip}</a>
      <div className="ambient" aria-hidden>
        <span className="ambient__blob ambient__blob--a" />
        <span className="ambient__blob ambient__blob--b" />
        <span className="ambient__blob ambient__blob--c" />
      </div>
      <div className="grain" aria-hidden />
      <header className="site-header">
        <VLink to="/" className="logo" aria-label={t.siteName}>
          <span className="logo__mark" aria-hidden>
            <span>F</span><span>Y</span><span>C</span>
          </span>
          <span className="logo__text">
            <span className="logo__name">{t.siteName}</span>
            <span className="logo__tag">{t.tagline}</span>
          </span>
        </VLink>
        <Nav />
        <VNavLink to="/search" className="search-link" aria-label={t.advancedSearch} title={t.advancedSearch}>
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2.2" /><path d="m20 20-4-4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
        </VNavLink>
        <LangToggle />
      </header>
      <main id="main" className="main" key={pathname}>
        <Outlet />
      </main>
      <footer className="site-footer">
        <span>{t.siteName}</span>
        <span aria-hidden>✦</span>
        <span lang="ja">おすすめ作品集</span>
        <small className="site-footer__credit">Some artwork via TMDB and IGDB. This site uses the TMDB API but is not endorsed or certified by TMDB.</small>
      </footer>
      <ScrollRestoration />
    </>
  );
}
