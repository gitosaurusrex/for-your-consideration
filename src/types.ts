import type { CompanyDoc, GenreDoc, I18n, ItemDoc, Lang, Medium, PersonDoc } from './shared/schema';

export type { Lang, Medium } from './shared/schema';
export const LANGS: Lang[] = ['en', 'ja'];

/** A document with every translated field resolved to a plain string for one language. */
export type Localized<T> = { [K in keyof T]: T[K] extends I18n | undefined ? string : T[K] };

/** A record plus its English and Japanese views (Japanese falls back to English). */
export interface Entry<T> {
  slug: string;
  doc: T;
  en: Localized<T>;
  ja: Localized<T>;
}

export type Item = Entry<ItemDoc> & { section: Medium };
export type Person = Entry<PersonDoc>;
export type Company = Entry<CompanyDoc>;
export type Genre = Entry<GenreDoc>;
