export interface Bindings {
  DB: D1Database;
  MEDIA: R2Bucket;
  TMDB_API_KEY?: string;
  TWITCH_CLIENT_ID?: string;
  TWITCH_CLIENT_SECRET?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  DEV_AUTH_BYPASS?: string;
}

export type AppEnv = { Bindings: Bindings; Variables: { adminEmail: string } };
