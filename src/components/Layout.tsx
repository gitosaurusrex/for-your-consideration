import { motion } from 'motion/react';
import { useEffect } from 'react';
import { Outlet, ScrollRestoration, useLocation } from 'react-router';
import { useLang } from '../i18n';
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
  const links = [
    { to: '/', label: t.navHome, match: (p: string) => p === '/' },
    { to: '/watch', label: t.navWatch, match: (p: string) => p.startsWith('/watch') || p.startsWith('/title') },
    { to: '/listen', label: t.navListen, match: (p: string) => p.startsWith('/listen') || p.startsWith('/music') },
  ];
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
        <LangToggle />
      </header>
      <main id="main" className="main" key={pathname}>
        <Outlet />
      </main>
      <footer className="site-footer">
        <span>{t.siteName}</span>
        <span aria-hidden>✦</span>
        <span lang="ja">あなたへのおすすめ</span>
      </footer>
      <ScrollRestoration />
    </>
  );
}
