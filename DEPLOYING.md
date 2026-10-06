# Going live on Cloudflare

A step-by-step checklist for putting the site into production. Steps 1–4 are required. Steps 5–7 are optional but recommended.

The repo is already set up for this. [`wrangler.jsonc`](wrangler.jsonc) serves `dist/` with single-page-app routing, [`public/_headers`](public/_headers) sets caching and security headers, and `wrangler` is pinned in `devDependencies`.

## 0. Accounts you need

| Account | Needed for | Cost |
|---|---|---|
| GitHub (you have it) | Code, and every CMS save is a commit | Free |
| [Cloudflare](https://dash.cloudflare.com/sign-up) | Hosting and CDN | Free |
| [TMDB](https://www.themoviedb.org/signup) | `npm run fetch-art` (posters and photos) | Free |
| A domain name | A nicer URL than `*.workers.dev` | About $10/yr. Optional |

## 1. Get the content ready (on your machine)

```bash
npm install
cp .env.example .env        # paste your TMDB key into it
npm run fetch-art           # fills empty posters, backdrops, covers and photos
npm run build               # must end with "✓ built"
```

- Replace the seed **watch links**, **Spotify links** and **music-video links**, which are currently just searches, with real ones (in `/admin` or the JSON).
- Commit and push to `main`.

## 2. Connect the repo to Cloudflare

1. Cloudflare dashboard → **Compute (Workers) → Workers & Pages → Create → Import a repository**.
2. Authorize the **Cloudflare Workers & Pages** GitHub app. Give it access to **only** `gitosaurusrex/for-your-consideration`.
3. Use these build settings:

   | Setting | Value |
   |---|---|
   | Project name | `for-your-consideration` (must match `name` in `wrangler.jsonc`) |
   | Production branch | `main` |
   | Build command | `npm run build` |
   | Deploy command | `npx wrangler deploy` |
   | Non-production branch deploy command | `npx wrangler versions upload` (gives each branch a preview URL) |
   | Root directory | `/` |

4. Under **Build variables**, add `NODE_VERSION` = `22`. The repo's `.nvmrc` already says 22; the variable is a safety net.
5. Click **Deploy**. When it finishes, the site is live at `https://for-your-consideration.<your-subdomain>.workers.dev`.

From then on, every push to `main`, including every save in `/admin`, rebuilds and redeploys the site automatically. If a content mistake breaks the build, the deploy fails and the previous version stays live.

## 3. Custom domain (optional, about 10 minutes)

- **Buying a new domain:** Cloudflare dashboard → **Domain Registration → Register Domains**. Cloudflare sells domains at cost and sets up DNS for you.
- **Using a domain you already own:** **Add a site** → choose the Free plan → change the nameservers at your registrar to the two Cloudflare gives you. Propagation usually takes minutes, but can take up to 24 hours.

Then go to your Worker → **Settings → Domains & Routes → Add → Custom domain**, and enter `example.com` (and/or `www.example.com`). Cloudflare creates the DNS record and the HTTPS certificate automatically.

Recommended zone settings: **SSL/TLS → Edge Certificates → Always Use HTTPS: On**, plus **Automatic HTTPS Rewrites: On**.

## 4. Point the CMS at the live site

In [`public/admin/config.yml`](public/admin/config.yml), uncomment `site_url` and set it to your live URL (the `workers.dev` address or your custom domain). Commit and push.

Then check that `https://<your-site>/admin/` loads. At this point you can sign in with **Sign In Using Access Token**: create a [fine-grained token](https://github.com/settings/personal-access-tokens/new) with **Repository access: only this repo** and **Contents: Read and write**. Set an expiry and keep the token in your password manager.

## 5. "Sign in with GitHub" for the CMS (recommended)

This replaces pasted tokens with a normal login button.

1. **Deploy the auth worker.** Open [sveltia/sveltia-cms-auth](https://github.com/sveltia/sveltia-cms-auth) and click **Deploy to Cloudflare**. Note its URL, for example `https://sveltia-cms-auth.<your-subdomain>.workers.dev`.
2. **Create a GitHub OAuth app:** GitHub → Settings → Developer settings → **OAuth Apps → New OAuth App**.
   - Homepage URL: your live site URL
   - Authorization callback URL: `https://sveltia-cms-auth.<your-subdomain>.workers.dev/callback`
   - After creating it, copy the **Client ID** and generate a **Client secret**.
3. **Configure the auth worker:** Cloudflare → that Worker → **Settings → Variables and Secrets**. Add:
   - `GITHUB_CLIENT_ID`: the Client ID
   - `GITHUB_CLIENT_SECRET`: the secret (choose type **Secret**)
   - `ALLOWED_DOMAINS`: your site's hostname, for example `example.com` (stops other sites from using your auth worker)
4. In `public/admin/config.yml`, uncomment `base_url` and paste the auth worker URL. Commit and push.

Anyone who signs in still needs **write access to the repo**, so only you (and any collaborators you add) can edit.

## 6. GitHub repo settings

- **Don't require pull requests on `main`.** The CMS commits directly to `main`, so a "require PR" branch-protection rule will make every save fail. If you want protection, use a ruleset that only blocks force-pushes and deletion.
- Keep `.env` out of git; `.gitignore` already handles this. The TMDB key is only used locally and is never needed by Cloudflare.

## 7. Nice-to-haves

- **Analytics:** Worker → **Settings → Observability**, or **Web Analytics** in the dashboard. Both are free and cookie-free.
- **Private site:** to make the site visible only to your friend, use **Zero Trust → Access → Applications → Self-hosted**. Protect the domain and allow their email address; they sign in with a one-time code. This is free for up to 50 users and requires a custom domain.
- **Deploy from your laptop** (bypassing Git): run `npx wrangler login` once, then `npm run deploy`. To test the Cloudflare runtime locally, run `npm run cf:preview`.

## Launch checklist

- [ ] `npm run build` passes locally
- [ ] Seed watch, Spotify and video links replaced with real ones
- [ ] Artwork filled (`npm run fetch-art`)
- [ ] Cloudflare project deployed from `main`
- [ ] Deep link works: open `/title/past-lives` directly, then refresh
- [ ] `?lang=ja` link opens in Japanese
- [ ] `/admin/` loads, you can sign in, and a test edit redeploys the site
- [ ] `site_url` (and `base_url`, if you did step 5) set in `config.yml`
- [ ] Custom domain and HTTPS working (if used)
