import { describe, expect, it } from 'vitest';
import app from '../worker/index';

const PASSWORD = 'correct horse battery staple';

/** Just enough of D1 for the login_failures table. */
function fakeDB() {
  const rows: { ip: string; at: number }[] = [];
  const stmt = (sql: string, args: unknown[] = []) => ({
    bind: (...a: unknown[]) => stmt(sql, a),
    async first() {
      const [ip, since] = args as [string, number];
      return { n: rows.filter((r) => r.ip === ip && r.at > since).length };
    },
    async run() {
      if (sql.startsWith('INSERT')) rows.push({ ip: args[0] as string, at: args[1] as number });
      if (sql.startsWith('DELETE')) for (let i = rows.length - 1; i >= 0; i--) if (rows[i].at <= (args[0] as number)) rows.splice(i, 1);
    },
  });
  return {
    rows,
    prepare: (sql: string) => stmt(sql),
    async batch(stmts: { run: () => Promise<void> }[]) { for (const s of stmts) await s.run(); },
  };
}

const site = 'https://fyc.example';
const env = (extra: Record<string, unknown> = {}) => ({ ADMIN_PASSWORD: PASSWORD, DB: fakeDB(), ...extra }) as never;

const call = (path: string, e: unknown, init: RequestInit = {}) => app.request(`${site}${path}`, init, e as never);
const signIn = (e: unknown, password: string, headers: Record<string, string> = {}) =>
  call('/api/admin/login', e, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify({ password }) });
const sessionCookie = (res: Response) => res.headers.get('set-cookie')!.split(';')[0];

describe('admin login', () => {
  it('refuses when no password is configured', async () => {
    expect((await call('/api/admin/me', {})).status).toBe(503);
    expect((await signIn({ DB: fakeDB() }, 'anything')).status).toBe(503);
  });

  it('refuses to use a short password', async () => {
    const res = await signIn(env({ ADMIN_PASSWORD: 'short' }), 'short');
    expect(res.status).toBe(503);
  });

  it('refuses requests without a session', async () => {
    expect((await call('/api/admin/me', env())).status).toBe(401);
  });

  it('signs in with the right password and accepts the session cookie', async () => {
    const e = env();
    const res = await signIn(e, PASSWORD);
    expect(res.status).toBe(200);
    const setCookie = res.headers.get('set-cookie')!;
    expect(setCookie).toMatch(/HttpOnly/);
    expect(setCookie).toMatch(/Secure/);
    expect(setCookie).toMatch(/SameSite=Strict/);
    const me = await call('/api/admin/me', e, { headers: { cookie: sessionCookie(res) } });
    expect(await me.json()).toEqual({ email: 'admin' });
  });

  it('rejects a wrong password, a tampered cookie, and sessions from an old password', async () => {
    const e = env();
    expect((await signIn(e, 'wrong password!!')).status).toBe(401);
    const cookie = sessionCookie(await signIn(e, PASSWORD));
    const [name, value] = cookie.split('=');
    const [expires, sig] = value.split('.');
    const forged = `${name}=${Number(expires) + 1000}.${sig}`;
    expect((await call('/api/admin/me', e, { headers: { cookie: forged } })).status).toBe(401);
    const changed = env({ ADMIN_PASSWORD: 'a completely new password' });
    expect((await call('/api/admin/me', changed, { headers: { cookie } })).status).toBe(401);
  });

  it('locks an address out after repeated wrong passwords', async () => {
    const e = env();
    const from = { 'cf-connecting-ip': '203.0.113.9' };
    for (let i = 0; i < 10; i++) expect((await signIn(e, `guess ${i}`, from)).status).toBe(401);
    expect((await signIn(e, PASSWORD, from)).status).toBe(429);
    expect((await signIn(e, PASSWORD, { 'cf-connecting-ip': '198.51.100.1' })).status).toBe(200);
  });

  it('refuses cross-site writes even with a valid session', async () => {
    const e = env();
    const cookie = sessionCookie(await signIn(e, PASSWORD));
    const res = await call('/api/admin/settings', e, { method: 'PUT', headers: { cookie, origin: 'https://evil.example', 'content-type': 'application/json' }, body: '{}' });
    expect(res.status).toBe(403);
    expect((await signIn(e, PASSWORD, { origin: 'https://evil.example' })).status).toBe(403);
  });

  it('signs out by clearing the cookie', async () => {
    const res = await call('/api/admin/logout', env(), { method: 'POST' });
    expect(res.headers.get('set-cookie')).toMatch(/fyc_admin=;.*Max-Age=0/);
  });

  it('ignores the dev bypass anywhere but localhost', async () => {
    expect((await call('/api/admin/me', { DEV_AUTH_BYPASS: 'true' })).status).toBe(503);
    const local = await app.request('http://localhost:5173/api/admin/me', {}, { DEV_AUTH_BYPASS: 'true' } as never);
    expect(await local.json()).toEqual({ email: 'dev@localhost' });
  });
});
