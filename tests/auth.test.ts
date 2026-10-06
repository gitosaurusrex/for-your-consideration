import { describe, expect, it } from 'vitest';
import app from '../worker/index';

const call = (url: string, env: Record<string, unknown>, headers: Record<string, string> = {}) =>
  app.request(url, { headers }, env as never);

describe('admin API protection', () => {
  it('refuses when Cloudflare Access is not configured', async () => {
    const res = await call('https://fyc.example/api/admin/me', {});
    expect(res.status).toBe(503);
  });

  it('refuses requests without an Access token', async () => {
    const res = await call('https://fyc.example/api/admin/me', { ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com', ACCESS_AUD: 'aud' });
    expect(res.status).toBe(401);
  });

  it('refuses a forged token', async () => {
    const res = await call('https://fyc.example/api/admin/me', { ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com', ACCESS_AUD: 'aud' },
      { 'cf-access-jwt-assertion': 'eyJhbGciOiJub25lIn0.eyJlbWFpbCI6ImV2aWxAZXhhbXBsZS5jb20ifQ.' });
    expect(res.status).toBe(401);
  });

  it('ignores the dev bypass anywhere but localhost', async () => {
    const res = await call('https://fyc.example/api/admin/me', { DEV_AUTH_BYPASS: 'true' });
    expect(res.status).toBe(503);
    const local = await call('http://localhost:5173/api/admin/me', { DEV_AUTH_BYPASS: 'true' });
    expect(await local.json()).toEqual({ email: 'dev@localhost' });
  });
});
