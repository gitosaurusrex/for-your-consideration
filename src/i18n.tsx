import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import type { Lang } from './types';

const strings = {
  en: {
    siteName: 'For Your Consideration',
    tagline: 'Films, shows, music & games, hand-picked for you',
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
    navPlay: 'Play',
    game: 'Game',
    games: 'Games',
    latestPlay: 'Things to play',
    sectionName: { watch: 'Film & TV', listen: 'Music', play: 'Games' } as Record<string, string>,
    developer: 'Developer',
    publisher: 'Publisher',
    creators: 'Creators',
    platforms: 'Platforms',
    releaseUS: 'US release',
    releaseJP: 'Japan release',
    notInJapan: 'Not released in Japan',
    addedOn: (d: string) => `Added ${d}`,
    free: 'Free to watch',
    freeLimited: 'Free for a limited time',
    limited: 'Limited time',
    until: (d: string) => `until ${d}`,
    leavingSoon: 'Leaving soon!',
    freeShort: 'FREE',
    limitedShort: 'LIMITED',
    studio: 'Studio',
    developed: 'Developed',
    published: 'Published',
    madeGames: 'Games',
    about: 'About',
    search: 'Search',
    advancedSearch: 'Advanced search',
    fSection: 'Section',
    fGenres: 'Genres',
    fYears: 'Released',
    fCountry: 'Country',
    fPlatform: 'Platform',
    fAvailability: 'Availability',
    anyValue: 'Any',
    from: 'from',
    to: 'to',
    sort: 'Sort',
    sortAdded: 'Recently added',
    sortYear: 'Newest release',
    sortTitle: 'Title A–Z',
    clear: 'Clear all',
    results: (n: number) => `${n} result${n === 1 ? '' : 's'}`,
    pickSection: 'Pick a section to filter by its genres.',
  },
  ja: {
    siteName: 'For Your Consideration',
    tagline: 'あなたのために選んだ映画・ドラマ・音楽・ゲーム',
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
    navPlay: '遊ぶ',
    game: 'ゲーム',
    games: 'ゲーム',
    latestPlay: '遊んでほしいもの',
    sectionName: { watch: '映画・ドラマ', listen: '音楽', play: 'ゲーム' } as Record<string, string>,
    developer: '開発',
    publisher: '販売',
    creators: 'クリエイター',
    platforms: '対応機種',
    releaseUS: '北米発売日',
    releaseJP: '国内発売日',
    notInJapan: '日本未発売',
    addedOn: (d: string) => `${d}に追加`,
    free: '無料で観られる',
    freeLimited: '期間限定で無料',
    limited: '期間限定配信',
    until: (d: string) => `${d}まで`,
    leavingSoon: 'まもなく配信終了！',
    freeShort: '無料',
    limitedShort: '期間限定',
    studio: 'スタジオ',
    developed: '開発タイトル',
    published: '販売タイトル',
    madeGames: 'ゲーム',
    about: 'プロフィール',
    search: '検索',
    advancedSearch: '詳細検索',
    fSection: 'カテゴリ',
    fGenres: 'ジャンル',
    fYears: '公開年',
    fCountry: '国',
    fPlatform: '対応機種',
    fAvailability: '配信状況',
    anyValue: 'すべて',
    from: 'から',
    to: 'まで',
    sort: '並び替え',
    sortAdded: '追加が新しい順',
    sortYear: '公開が新しい順',
    sortTitle: 'タイトル順',
    clear: 'すべてクリア',
    results: (n: number) => `${n}件`,
    pickSection: 'カテゴリを選ぶと、そのジャンルで絞り込めます。',
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

const dateFormats: Partial<Record<Lang, Intl.DateTimeFormat>> = {};
/** Format a YYYY-MM-DD date for display, without time-zone drift. */
export function formatDate(iso: string | undefined, lang: Lang) {
  if (!iso) return '';
  dateFormats[lang] ??= new Intl.DateTimeFormat(lang === 'ja' ? 'ja-JP' : 'en-US', { year: 'numeric', month: lang === 'ja' ? 'long' : 'short', day: 'numeric', timeZone: 'UTC' });
  return dateFormats[lang]!.format(new Date(`${iso}T00:00:00Z`));
}
