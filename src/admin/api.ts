import type { Catalog } from '../data';
import type { Decision, IngestSummary, Plan } from '../shared/ingest';
import type { AnyDoc, EntityType, I18n, ItemKind, SiteSettings } from '../shared/schema';

export class ApiError extends Error {
  constructor(public status: number, message: string, public body: Record<string, unknown> = {}) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/admin${path}`, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
    redirect: 'manual',
  });
  // Cloudflare Access answers an expired session with a redirect to its login page.
  if (res.type === 'opaqueredirect' || res.status === 0) throw new ApiError(401, 'Your sign-in has expired. Reload the page to sign in again.');
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data.error as string) || (data.errors as string[] | undefined)?.join(' · ') || `Request failed (${res.status})`;
    throw new ApiError(res.status, msg, data);
  }
  return data as T;
}

export interface SaveResult { doc: AnyDoc; warnings: string[] }
export interface RefList { id: string; title: I18n; kind: ItemKind }
export interface IngestListRow { id: number; created_at: string; filename: string | null; counts: Plan['counts'] }

export const api = {
  me: () => request<{ email: string }>('GET', '/me'),
  all: () => request<Catalog>('GET', '/all'),
  get: (type: EntityType, id: string) => request<{ doc: AnyDoc; referencedBy: RefList[] }>('GET', `/entities/${type}/${encodeURIComponent(id)}`),
  create: (type: EntityType, doc: unknown) => request<SaveResult>('POST', `/entities/${type}`, doc),
  update: (type: EntityType, id: string, doc: unknown) => request<SaveResult>('PUT', `/entities/${type}/${encodeURIComponent(id)}`, doc),
  remove: (type: EntityType, id: string) => request<{ ok: true }>('DELETE', `/entities/${type}/${encodeURIComponent(id)}`),
  settings: (s: Partial<SiteSettings>) => request<SiteSettings>('PUT', '/settings', s),
  preview: (file: unknown, decisions: Record<string, Decision>) => request<Plan>('POST', '/ingest/preview', { file, decisions }),
  apply: (file: unknown, decisions: Record<string, Decision>, filename?: string) =>
    request<{ ingestId: number; summary: IngestSummary }>('POST', '/ingest/apply', { file, decisions, filename }),
  ingests: () => request<IngestListRow[]>('GET', '/ingests'),
  ingest: (id: number) => request<{ id: number; created_at: string; filename: string | null; summary: IngestSummary }>('GET', `/ingests/${id}`),
};
