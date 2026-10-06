import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from './env';

/**
 * Cloudflare Access puts a login screen in front of /admin and /api/admin.
 * Access then forwards a signed JWT with every request; we verify it here too,
 * so the API stays locked even if someone reaches the Worker another way.
 */
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const { ACCESS_TEAM_DOMAIN, ACCESS_AUD, DEV_AUTH_BYPASS } = c.env;
  const host = new URL(c.req.url).hostname;

  // Local development only: `.dev.vars` sets DEV_AUTH_BYPASS=true, and it only works on localhost.
  if (DEV_AUTH_BYPASS === 'true' && (host === 'localhost' || host === '127.0.0.1')) {
    c.set('adminEmail', 'dev@localhost');
    return next();
  }

  if (!ACCESS_TEAM_DOMAIN || !ACCESS_AUD) {
    return c.json({ error: 'Admin login is not configured yet. Set ACCESS_TEAM_DOMAIN and ACCESS_AUD (see README).' }, 503);
  }

  const token = c.req.header('cf-access-jwt-assertion') ?? getCookie(c.req.header('cookie'), 'CF_Authorization');
  if (!token) return c.json({ error: 'Not signed in.' }, 401);

  const team = `https://${ACCESS_TEAM_DOMAIN.replace(/^https?:\/\//, '').replace(/\/$/, '')}`;
  let jwks = jwksCache.get(team);
  if (!jwks) jwksCache.set(team, (jwks = createRemoteJWKSet(new URL(`${team}/cdn-cgi/access/certs`))));

  try {
    const { payload } = await jwtVerify(token, jwks, { issuer: team, audience: ACCESS_AUD });
    c.set('adminEmail', String(payload.email ?? 'admin'));
  } catch {
    return c.json({ error: 'Your sign-in has expired. Reload the page to sign in again.' }, 401);
  }
  return next();
};

function getCookie(header: string | undefined, name: string) {
  return header?.split(/;\s*/).find((p) => p.startsWith(`${name}=`))?.slice(name.length + 1);
}
