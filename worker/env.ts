export interface Bindings {
  DB: D1Database;
  /** Image storage: R2 when bound, otherwise Workers KV (no payment method needed). */
  MEDIA?: R2Bucket;
  MEDIA_KV?: KVNamespace;
  TMDB_API_KEY?: string;
  TWITCH_CLIENT_ID?: string;
  TWITCH_CLIENT_SECRET?: string;
  ADMIN_PASSWORD?: string;
  DEV_AUTH_BYPASS?: string;
}

export type AppEnv = { Bindings: Bindings; Variables: { adminEmail: string } };
