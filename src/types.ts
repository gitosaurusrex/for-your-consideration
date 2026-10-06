import type { CompanyDoc, GenreDoc, I18n, ItemDoc, Lang, Medium, PersonDoc } from './shared/schema';

export type { Lang, Medium } from './shared/schema';
export { LANGS } from './shared/schema';

/** A document with every translated field resolved to a plain string for one language. */
export type Localized<T> = { [K in keyof T]: T[K] extends I18n | undefined ? string : T[K] };

/** A record plus a view in every site language (each falls back to English). */
export type Entry<T> = { slug: string; doc: T } & Record<Lang, Localized<T>>;

export type Item = Entry<ItemDoc> & { section: Medium };
export type Person = Entry<PersonDoc>;
export type Company = Entry<CompanyDoc>;
export type Genre = Entry<GenreDoc>;
