export type Lang = 'en' | 'ja';
export const LANGS: Lang[] = ['en', 'ja'];

/** Raw content file shape: one object per language. */
export type Localized<T> = { en: T; ja?: Partial<T> };

export type TitleKind = 'film' | 'tv';
export type MusicKind = 'song' | 'album';

interface Common {
  title: string;
  year: number;
  countries: string[];
  summary: string;
  note?: string;
  genres: string[];
  featured?: boolean;
  added?: string;
}

export interface TitleFields extends Common {
  kind: TitleKind;
  poster?: string;
  backdrop?: string;
  directors: string[];
  cast?: string[];
  runtime?: number;
  watch_service?: string;
  watch_url?: string;
  trailer_url?: string;
  tmdb_id?: string;
}

export interface MusicFields extends Common {
  kind: MusicKind;
  cover?: string;
  artists: string[];
  album?: string;
  spotify_url?: string;
  video_url?: string;
}

export interface PersonFields {
  name: string;
  photo?: string;
}

export interface GenreFields {
  name: string;
  hue?: number;
}

export interface SiteFields {
  greeting: string;
  intro: string;
  signoff: string;
}

/** An entry after loading: slug plus both language versions, already merged with English fallbacks. */
export interface Entry<T> {
  slug: string;
  en: T;
  ja: T;
}

export type Title = Entry<TitleFields> & { section: 'watch' };
export type Music = Entry<MusicFields> & { section: 'listen' };
export type Item = Title | Music;
export type Person = Entry<PersonFields>;
export type Genre = Entry<GenreFields>;
