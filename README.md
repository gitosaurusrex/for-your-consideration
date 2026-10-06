# For Your Consideration

A small, hand-curated recommendations site for films, TV and music, written for a friend in **English and 日本語**.

- Official artwork, spoiler-free summaries, a personal "why I picked it" note
- Directors, top-billed cast, artists, release year and release country on every entry
- **Everything is linked.** Click a genre, person or country to see everything else connected to it. Every detail page also has a "More like this" shelf, scored by shared people and genres.
- A "Watch" button for films and shows, plus **Spotify** and **Music video** buttons for music
- An EN / 日本語 switch. The first visit picks the language from the browser, and `?lang=ja` forces Japanese, which is handy for the link you send.
- A single-page app with animated transitions: posters fly from the card into the detail page, pages cross-fade, the language switch dissolves, and filters reflow. Uses the View Transitions API and degrades gracefully on older browsers. Respects "reduce motion".
- No database and no server. Content is JSON in [`/content`](content), edited through a friendly admin UI at **`/admin`**.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173  (admin at http://localhost:5173/admin/)
npm run build      # checks content, type-checks, builds to /dist
```

Requires Node 22.9 or newer.

## Managing content (the "backend")

The admin panel is [Sveltia CMS](https://sveltiacms.app), a Git-based CMS. Every save is a commit to this repo, and your host rebuilds the site automatically. Each entry shows English and Japanese **side by side**. Fields that don't need translating (year, links, cast, and so on) are entered once and copied to both languages.

| Collection | What it holds |
|---|---|
| **Films & TV** | title, type, year, countries, poster/backdrop, summary, note, directors (or creators for TV), cast, genres, runtime, watch link, trailer |
| **Music** | title, song or album, artists, album name, year, countries, cover, summary, note, genres, Spotify link, music video link |
| **People** | name in English and Japanese (katakana), optional photo. Linking one person from several entries connects them on the site. |
| **Genres** | name in both languages, plus a colour hue for its tag |
| **Site text** | the home-page greeting, intro and sign-off |

### Signing in to `/admin`

- **Locally, easiest:** run `npm run dev`, open `http://localhost:5173/admin/` in Chrome or Edge, choose **Work with Local Repository**, and pick this folder. Edits are written straight to the files. Commit and push when you're done.
- **On the live site:** choose **Sign In Using Access Token** and paste a GitHub [fine-grained personal access token](https://github.com/settings/personal-access-tokens/new) that has *Contents: Read and write* on this repo only. Saves then commit straight to `main`.
  For a proper "Sign in with GitHub" button, deploy Sveltia's free [`sveltia-cms-auth`](https://github.com/sveltia/sveltia-cms-auth) worker to Cloudflare and add its URL as `base_url` under `backend` in [`public/admin/config.yml`](public/admin/config.yml).

### Artwork

Paste any image URL into the Poster or Cover field, or upload a file (uploads go to `public/uploads`). To pull **official art automatically**:

1. Get a free TMDB API key (themoviedb.org → Settings → API) and put it in `.env` (copy `.env.example`).
2. For music, set the entry's **Spotify link** to a real track or album link (Share → Copy link).
3. Run `npm run fetch-art`. It fills every empty poster, backdrop and cover, and adds actor and director photos. Nothing you've already set is overwritten, unless you pass `-- --force`.

Until an entry has art, the site draws a colourful generated poster for it, so nothing ever looks broken.

### Safety net

`npm run build` first runs `scripts/check-content.mjs`. If an entry points to a person or genre that doesn't exist, has a malformed URL or country code, or is missing a required field, the build **fails with a readable message** and the live site keeps its previous version. A missing Japanese translation is only a warning; the site falls back to English.

> **The seed content is an example.** Swap the watch links (currently JustWatch searches), Spotify links (currently Spotify searches) and music-video links (currently YouTube searches) for the real ones.

## Deploying: which host?

The site is fully static: HTML, JS and images, with no server and no database. You don't need a "backend" host or PHP hosting. Any static host's free tier is more than enough. Comparison (free tiers change, so double-check the current terms before you sign up):

| Host | Verdict | Why |
|---|---|---|
| **Cloudflare (Workers/Pages)** | ⭐ **Recommended** | Free static hosting with no bandwidth cap. Its global CDN includes Tokyo and Osaka, so it's fast for your friend in Japan. Auto-deploys from GitHub. Config: [`wrangler.jsonc`](wrangler.jsonc). |
| **Vercel (Hobby)** | Great alternative | Very easy GitHub import with generous limits. The Hobby plan is for personal, non-commercial use, which this is. Config: [`vercel.json`](vercel.json). |
| **Netlify (Free)** | Good | Easy setup. The free plan is now usage-credit based, so very frequent deploys can eat into it. Config: [`netlify.toml`](netlify.toml). |
| **Render (Static Site)** | Fine | Free static sites don't "sleep". Only Render's free *web services* do, and this site doesn't need one. Config: [`render.yaml`](render.yaml). |
| **GitHub Pages** | Possible, with caveats | Free, but needs extra workarounds for single-page-app routes and repo-name base paths. |
| **Hostinger** | Not needed | No free plan. It's paid shared hosting built for PHP/WordPress, which is more than a static site needs. |

### Deploying to Cloudflare (about 5 minutes)

1. Push this repo to GitHub (the site deploys from `main`).
2. Cloudflare dashboard → **Workers & Pages → Create → Import a repository** → pick this repo.
3. Build command `npm run build`. Deploy command `npx wrangler deploy` (it reads `wrangler.jsonc`).
4. Done. Every push, including every save in `/admin`, rebuilds the site. Optionally set `site_url` in `public/admin/config.yml` to the live URL.

For the **Pages** flow instead, use build command `npm run build` and output directory `dist`. Pages automatically serves single-page apps.

## Project layout

```
content/            ← all recommendations (JSON, one file per entry, { en, ja })
  titles/ music/ people/ genres/ site.json
public/admin/       ← CMS (index.html + config.yml)
public/uploads/     ← images uploaded through the CMS
scripts/            ← check-content (build guard), fetch-art (TMDB/Spotify)
src/
  data.ts           ← loads content, builds the links (genres ↔ people ↔ titles), "more like this"
  i18n.tsx          ← EN/JA UI strings, language switch, country names
  transitions.ts    ← shared-element poster morph
  pages/ components/ styles.css
```
