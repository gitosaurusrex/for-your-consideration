import type { AnyDoc, EntityType, GenreDoc, ItemDoc } from '../shared/schema';

const ITEM_PATH = { watch: 'title', listen: 'music', play: 'game' } as const;

/** Where a record lives on the public site. */
export function sitePath(type: EntityType, doc: AnyDoc): string {
  if (type === 'item') return `/${ITEM_PATH[(doc as ItemDoc).medium]}/${doc.id}`;
  if (type === 'person') return `/person/${doc.id}`;
  if (type === 'company') return `/studio/${doc.id}`;
  const g = doc as GenreDoc;
  return `/genre/${g.medium}/${g.slug}`;
}

export const adminEditPath = (type: EntityType, id: string) => `/admin/edit/${type}/${encodeURIComponent(id)}`;

export const TYPE_LABEL: Record<EntityType, { one: string; many: string; list: string }> = {
  item: { one: 'item', many: 'Items', list: '/admin/items' },
  person: { one: 'person', many: 'People', list: '/admin/people' },
  company: { one: 'studio', many: 'Studios', list: '/admin/studios' },
  genre: { one: 'genre', many: 'Genres', list: '/admin/genres' },
};
