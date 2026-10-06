import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import type { Lang } from './types';

const strings = {
  en: {
    siteName: 'For Your Consideration',
    tagline: 'Films, shows & music, hand-picked for you',
    navHome: 'Home',
    navWatch: 'Watch',
    navListen: 'Listen',
    all: 'All',
    film: 'Film',
    films: 'Films',
    tv: 'TV show',
    tvs: 'TV',
    song: 'Song',
    songs: 'Songs',
    album: 'Album',
    albums: 'Albums',
    featured: 'Start here',
    latestWatch: 'Things to watch',
    latestListen: 'Things to listen to',
    seeAll: 'See all',
    directedBy: 'Directed by',
    createdBy: 'Created by',
    starring: 'Starring',
    by: 'By',
    fromAlbum: 'From the album',
    genres: 'Genres',
    released: 'Released',
    country: 'Country',
    runtime: (m: number) => `${Math.floor(m / 60)}h ${m % 60}m`,
    whyIPicked: 'Why I picked it',
    watchOn: (s?: string) => (s ? `Watch on ${s}` : 'Where to watch'),
    trailer: 'Trailer',
    spotify: 'Listen on Spotify',
    musicVideo: 'Music video',
    moreLikeThis: 'More like this',
    directed: 'Directed / created',
    actedIn: 'Appears in',
    music: 'Music',
    recsCount: (n: number) => `${n} recommendation${n === 1 ? '' : 's'}`,
    genre: 'Genre',
    person: 'Person',
    madeIn: 'Made in',
    searchPlaceholder: 'Search titles, people, genres…',
    noResults: 'Nothing here yet.',
    back: 'Back',
    notFound: 'This page wandered off.',
    goHome: 'Take me home',
    language: 'Language',
    skip: 'Skip to content',
    new: 'New',
  },
  ja: {
    siteName: 'For Your Consideration',
    tagline: 'あなたのために選んだ映画・ドラマ・音楽',
    navHome: 'ホーム',
    navWatch: '観る',
    navListen: '聴く',
    all: 'すべて',
    film: '映画',
    films: '映画',
    tv: 'ドラマ',
    tvs: 'ドラマ',
    song: '曲',
    songs: '曲',
    album: 'アルバム',
    albums: 'アルバム',
    featured: 'まずはここから',
    latestWatch: '観てほしいもの',
    latestListen: '聴いてほしいもの',
    seeAll: 'すべて見る',
    directedBy: '監督',
    createdBy: 'クリエイター',
    starring: '出演',
    by: 'アーティスト',
    fromAlbum: '収録アルバム',
    genres: 'ジャンル',
    released: '公開年',
    country: '製作国',
    runtime: (m: number) => `${Math.floor(m / 60)}時間${m % 60}分`,
    whyIPicked: 'おすすめの理由',
    watchOn: (s?: string) => (s ? `${s}で観る` : '視聴する'),
    trailer: '予告編',
    spotify: 'Spotifyで聴く',
    musicVideo: 'ミュージックビデオ',
    moreLikeThis: 'こちらもおすすめ',
    directed: '監督・クリエイター',
    actedIn: '出演作品',
    music: '音楽',
    recsCount: (n: number) => `${n}件のおすすめ`,
    genre: 'ジャンル',
    person: '人物',
    madeIn: '製作国',
    searchPlaceholder: 'タイトル・人物・ジャンルで検索…',
    noResults: 'まだ何もありません。',
    back: '戻る',
    notFound: 'このページは迷子になったみたい。',
    goHome: 'ホームへ戻る',
    language: '言語',
    skip: '本文へスキップ',
    new: 'NEW',
  },
} satisfies Record<Lang, Record<string, unknown>>;

export type Strings = (typeof strings)['en'];

interface LangCtx {
  lang: Lang;
  t: Strings;
  setLang: (l: Lang) => void;
}

const Ctx = createContext<LangCtx | null>(null);
const STORAGE_KEY = 'fyc-lang';

function initialLang(): Lang {
  const param = new URLSearchParams(location.search).get('lang');
  if (param === 'en' || param === 'ja') return param;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'ja') return saved;
  } catch { /* storage unavailable */ }
  return navigator.language?.toLowerCase().startsWith('ja') ? 'ja' : 'en';
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);

  useEffect(() => {
    document.documentElement.lang = lang;
    try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* ignore */ }
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setLangState(l);
      return;
    }
    document.documentElement.dataset.transition = 'lang';
    const vt = document.startViewTransition(() => flushSync(() => setLangState(l)));
    vt.finished.finally(() => delete document.documentElement.dataset.transition);
  }, []);

  const value = useMemo(() => ({ lang, setLang, t: strings[lang] as Strings }), [lang, setLang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLang() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useLang outside LangProvider');
  return ctx;
}

const regionNames: Partial<Record<Lang, Intl.DisplayNames>> = {};
export function countryName(code: string, lang: Lang) {
  regionNames[lang] ??= new Intl.DisplayNames([lang], { type: 'region' });
  return regionNames[lang]!.of(code) ?? code;
}

export const flag = (code: string) =>
  String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
