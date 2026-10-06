export interface Bindings {
  DB: D1Database;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  DEV_AUTH_BYPASS?: string;
}

export type AppEnv = { Bindings: Bindings; Variables: { adminEmail: string } };
