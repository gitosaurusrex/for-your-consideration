# For Your Consideration

A hand-curated recommendations site for **films, TV, music and games**, written for a friend in **English and 日本語**.

- Official artwork, spoiler-free summaries, a personal "why I picked it" note, and the date each item was added
- **Film & TV**:
  - director/creator and top-billed cast, year and release countries
  - a **Watch** button
  - **free / limited-time availability** badges that hide themselves after the end date
- **Music**: artists, album, **Spotify** and **Music video** buttons
- **Games**:
  - US and Japan release dates, platforms
  - developer and publisher (each with their own studio page)
  - notable creators (e.g. Hideo Kojima)
- **Everything links up.**
  - Every person, studio, genre and country has a page.
  - Person pages show a headshot, a bio, and everything they directed, starred in, recorded or created.
  - "More like this" on every item.
- **Separate genre pools per section.** "Indie" in Games is not "Indie" in Film & TV. The **advanced search** (⌕) combines sections, genres, years, country, platform and availability on purpose.
- **EN / 日本語 switch.** Defaults to the browser language. `?lang=ja` forces Japanese.
- Animated single-page app: posters fly into their detail pages, pages cross-fade, and the language switch dissolves.
- **Admin at `/admin`**, behind a Cloudflare Access login:
  - batch JSON ingest with a preview and conflict review
  - edit or delete any record
  - switch whole sections (e.g. Games) on or off
  - export everything

## How it's built

```
Browser ── GET /api/catalog, /media/* ──┐
                                        ▼
   Cloudflare Worker (worker/)  ──  D1 database (SQLite) + R2 (images)
                              ▲
/admin ── Cloudflare Access login ── /api/admin/*  (JWT verified again in the Worker)
```

- **Frontend:** React + Vite (`src/`). The admin is a separate lazy-loaded bundle (`src/admin/`), so visitors never download it.
- **Backend:** one Cloudflare Worker using [Hono](https://hono.dev) (`worker/`). It serves the static site and the API.
- **Database:** Cloudflare D1. Every record is a JSON document (`migrations/`).
- **Images:** Cloudflare R2. Uploaded and copied artwork is served from `/media/<content-hash>.<ext>`, cached permanently.
- **Shared rules:** `src/shared/` holds the field definitions, validation and ingest/diff logic. Both the Worker and the admin forms use it, so there's one source of truth.
- **Login:** Cloudflare Access (Zero Trust, free for small teams) shows an email-code login in front of `/admin`. There's no login code in the app. The Worker still verifies Access's signed token on every admin API call.

Everything runs on Cloudflare's free tier.

## Run it locally

Requires Node 22.9+.

```bash
npm install
cp .dev.vars.example .dev.vars   # lets you use /admin on localhost without logging in
npm run db:migrate               # creates the local database (in .wrangler/)
npm run dev                      # http://localhost:5173  ·  admin: http://localhost:5173/admin
npm run db:seed                  # in a second terminal: loads seed/example-catalog.json
npm test                         # validation, ingest and login tests
```

## Deploy (one-time setup, about 15 minutes)

### 1. Create the database and image storage, then deploy

```bash
npx wrangler login
npx wrangler d1 create fyc
npx wrangler r2 bucket create fyc-media
```

Paste the printed `database_id` into [`wrangler.jsonc`](wrangler.jsonc). The R2 bucket is already named there. Then deploy:

```bash
npm run deploy     # builds, applies database migrations, deploys
```

Wrangler prints your site's URL (`https://for-your-consideration.<you>.workers.dev`). You can add a custom domain later under **Workers & Pages → your Worker → Settings → Domains & Routes**.

To deploy automatically on every push, connect the repo under **Workers & Pages → your Worker → Settings → Build**:
- Build command: `npm run build`
- Deploy command: `npx wrangler d1 migrations apply DB --remote && npx wrangler deploy`

### 2. Protect the admin with Cloudflare Access (no code)

1. Open the Cloudflare dashboard → **Zero Trust**. The first time, pick a team name and the **Free** plan.
2. **Access → Applications → Add an application → Self-hosted.**
   - **Domain:** your site's hostname, path `admin`.
   - Add a second destination: the same hostname, path `api/admin`.
   - **Policy:** Action *Allow*. Include → *Emails* → your email address.
   - Login method: the default **One-time PIN** (a code is emailed to you) is all you need.
3. Open the application's **Overview** and copy the **Application Audience (AUD) Tag**. Your **team domain** is in **Settings → Custom Pages** (looks like `yourteam.cloudflareaccess.com`).
4. Put both into `wrangler.jsonc` under `vars` (`ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`) and run `npm run deploy` again.

Until step 4 is done, the admin API refuses every request. If your site is also reachable on its `workers.dev` address, protect that hostname in Access too, or turn the `workers.dev` route off in the Worker's settings. The API stays locked either way, because the Worker checks the Access token itself.

### 3. Artwork lookups (optional, free keys)

"Find art" in the admin looks up official artwork. Spotify covers need no key. For the rest:

```bash
npx wrangler secret put TMDB_API_KEY          # films, TV, headshots — themoviedb.org → Settings → API
npx wrangler secret put TWITCH_CLIENT_ID      # game covers (IGDB) — dev.twitch.tv/console/apps → Register
npx wrangler secret put TWITCH_CLIENT_SECRET
```

Secrets live in Cloudflare, not in the repo. The Dashboard shows which sources are set up. For local development, put the same lines in `.dev.vars`.

### 4. Add the content

Open `https://your-site/admin`, sign in with the emailed code, go to **Batch ingest**, and upload [`seed/example-catalog.json`](seed/example-catalog.json). The admin can also download it for you. Then flip **Games** off on the Dashboard until your list is ready.

## Managing content

- **Batch ingest** (for adding many things at once):
  - Upload a JSON file. The preview shows what's new, unchanged and broken, plus a field-by-field diff for records that already exist.
  - For each existing record, choose **Replace / Fill blanks / Skip** (or apply one choice to all).
  - Nothing is saved until **Apply**. The summary page then shows the new items as they'll appear on the site.
  - Every batch is kept in "Recent ingests" so you can revisit it.
  - **The file format is documented in [`docs/ingest-format.md`](docs/ingest-format.md).** Paste that page into Claude to generate files.
- **Artwork:** every image field in the admin (poster, backdrop, cover, headshot, logo) has three buttons:
  - **⬆ Upload**, or drop a file onto the field: JPEG, PNG, WebP, GIF or AVIF up to 15 MB. Files are checked by their actual bytes; SVG is refused.
  - **✨ Find art:** pick from official artwork. Films and TV come from TMDB (and when the TMDB id is known, the choices include alternative and Japanese posters). Games come from IGDB, music from the item's Spotify link, and headshots from TMDB.
  - **⤓ Save a copy:** download a linked image into your own storage.

  Stored images live in a Cloudflare R2 bucket (free up to 10 GB) and are served from `/media/…` on your own domain. With **Keep a copy of artwork** on (Dashboard → Images, on by default), Find art picks and artwork linked in ingested files are copied automatically. "Copy all now" handles anything still linked from elsewhere.
- **Artwork for batch files:** `npm run fetch-art -- my-batch.json` fills poster/cover/headshot links into a file before you upload it. Keys go in `.env` (see `.env.example`).
- **One-off edits:** Admin → Items / People / Studios / Genres.
  - The edit forms show English and Japanese side by side.
  - Pick people, studios and genres by name, or create them inline.
  - Delete anything. People, studios and genres that items still use are protected.
  - "Only ones needing attention" lists records missing Japanese, art, links, photos or bios.
- **Sections on/off:** the Dashboard switches hide Film & TV, Music or Games from the public site without deleting anything.
- **Backups:** Dashboard → **Export everything** downloads the whole database in the ingest format (images stored in R2 are referenced by their `/media/…` paths, so the R2 bucket is part of your backup too). D1 also has point-in-time restore ("Time Travel": 7 days on the free plan, 30 on paid) via `npx wrangler d1 time-travel`.

> The example content's watch/Spotify/YouTube links are searches, Paddington 2's "free, limited time" badge is a demo, and *Outer Wilds* has no Japan release date set. Replace them with real details. Have the Japanese proofread.

## Project layout

```
worker/          API (Hono): public catalog, admin CRUD, ingest, settings, export, images (R2), art lookup; Access JWT check
migrations/      D1 schema
src/shared/      field definitions, validation, ingest diff/merge (used by Worker + admin)
src/admin/       admin UI (lazy-loaded)
src/pages/       public pages: home, browse, detail, person, studio, genre, country, search
src/components/  cards, chips, availability badge, layout
seed/            example ingest file (everything on the site at launch)
docs/            ingest file format
scripts/         fetch-art (TMDB / IGDB / Spotify), seed-local
tests/           vitest: validation, ingest, auth
```
