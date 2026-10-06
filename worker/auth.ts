import type { Context, MiddlewareHandler } from 'hono';
import type { AppEnv } from './env';

/**
 * Password login for /api/admin. The password is a Worker secret (ADMIN_PASSWORD).
 * Signing in sets an HttpOnly cookie holding an expiry time signed with that password,
 * so changing the password signs every session out.
 */

const COOKIE = 'fyc_admin';
const SESSION_SECONDS = 30 * 24 * 60 * 60;
const MIN_PASSWORD_LENGTH = 12;
// Per address: this many wrong passwords within the window locks login for the rest of it.
const MAX_FAILURES = 10;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;

const enc = new TextEncoder();

async function hmac(secret: string, message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
}

function equal(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');

/** Compares by HMAC so the time taken doesn't depend on how much of the guess was right. */
async function passwordMatches(actual: string, guess: string) {
  const [a, b] = await Promise.all([hmac('fyc-password-check', actual), hmac('fyc-password-check', guess)]);
  return equal(a, b);
}

async function sessionToken(password: string, expires: number) {
  return `${expires}.${hex(await hmac(password, `admin:${expires}`))}`;
}

async function validSession(password: string, token: string | undefined) {
  const [expires, sig] = token?.split('.') ?? [];
  if (!expires || !sig || !(Number(expires) > Date.now() / 1000)) return false;
  return equal(enc.encode(await sessionToken(password, Number(expires))), enc.encode(`${expires}.${sig}`));
}

function getCookie(header: string | undefined, name: string) {
  return header?.split(/;\s*/).find((p) => p.startsWith(`${name}=`))?.slice(name.length + 1);
}

const cookie = (value: string, maxAge: number) =>
  `${COOKIE}=${value}; Path=/api/admin; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;

const isLocal = (c: Context<AppEnv>) => ['localhost', '127.0.0.1'].includes(new URL(c.req.url).hostname);

/** The configured password, or a response explaining why login can't work yet. */
function configuredPassword(c: Context<AppEnv>): string | Response {
  const pw = c.env.ADMIN_PASSWORD;
  if (!pw) return c.json({ error: 'Admin login is not configured yet. Run `npx wrangler secret put ADMIN_PASSWORD` (see README).' }, 503);
  if (pw.length < MIN_PASSWORD_LENGTH) return c.json({ error: `ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters. Set a longer one.` }, 503);
  return pw;
}

/** Refuse state-changing requests sent from other sites (the SameSite cookie already does; this is a second lock). */
function crossSite(c: Context<AppEnv>) {
  if (c.req.method === 'GET' || c.req.method === 'HEAD') return false;
  const origin = c.req.header('origin');
  return !!origin && origin !== new URL(c.req.url).origin;
}

export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (crossSite(c)) return c.json({ error: 'Cross-site request refused.' }, 403);

  // Local development only: `.dev.vars` sets DEV_AUTH_BYPASS=true, and it only works on localhost.
  if (c.env.DEV_AUTH_BYPASS === 'true' && isLocal(c)) {
    c.set('adminEmail', 'dev@localhost');
    return next();
  }

  const pw = configuredPassword(c);
  if (pw instanceof Response) return pw;
  if (!(await validSession(pw, getCookie(c.req.header('cookie'), COOKIE)))) {
    return c.json({ error: 'Not signed in.' }, 401);
  }
  c.set('adminEmail', 'admin');
  return next();
};

/** POST /api/admin/login with { password }. */
export async function login(c: Context<AppEnv>) {
  if (crossSite(c)) return c.json({ error: 'Cross-site request refused.' }, 403);
  const pw = configuredPassword(c);
  if (pw instanceof Response) return pw;

  const ip = c.req.header('cf-connecting-ip') ?? 'unknown';
  const now = Date.now();
  const since = now - FAILURE_WINDOW_MS;
  const recent = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM login_failures WHERE ip = ? AND at > ?').bind(ip, since).first<{ n: number }>();
  if ((recent?.n ?? 0) >= MAX_FAILURES) {
    return c.json({ error: 'Too many wrong passwords. Try again in 15 minutes.' }, 429);
  }

  const { password } = (await c.req.json().catch(() => ({}))) as { password?: unknown };
  if (typeof password !== 'string' || !(await passwordMatches(pw, password))) {
    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM login_failures WHERE at <= ?').bind(since),
      c.env.DB.prepare('INSERT INTO login_failures (ip, at) VALUES (?, ?)').bind(ip, now),
    ]);
    return c.json({ error: 'Wrong password.' }, 401);
  }

  const expires = Math.floor(now / 1000) + SESSION_SECONDS;
  c.header('Set-Cookie', cookie(await sessionToken(pw, expires), SESSION_SECONDS));
  return c.json({ ok: true });
}

/** POST /api/admin/logout */
export function logout(c: Context<AppEnv>) {
  c.header('Set-Cookie', cookie('', 0));
  return c.json({ ok: true });
}
