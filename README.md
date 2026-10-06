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

## Deploy (one-time setup, about 20 minutes)

### 0. Before you start

- A free [Cloudflare account](https://dash.cloudflare.com/sign-up), and Node 22.9+ on your computer.
- **Enable R2 once in the dashboard** (R2 Object Storage → *Purchase R2 / Add R2 subscription*). Wrangler can't create the image bucket until you do; it fails with "Please enable R2 through the Cloudflare Dashboard". Cloudflare asks for a payment method here, but the free tier (10 GB) isn't charged.
- Zero Trust (used for the admin login in step 2) also asks for a payment method when you pick its **Free** plan. That isn't charged either.

### 1. Create the database and image storage, then deploy

```bash
npm install
npx wrangler login
npx wrangler d1 create fyc
npx wrangler r2 bucket create fyc-media
```

Paste the `database_id` that `d1 create` prints into [`wrangler.jsonc`](wrangler.jsonc), replacing the zeros. The binding (`DB`) and the bucket (`fyc-media`) are already set up there. If Wrangler offers to add the database or bucket to your config for you, say **no**, so you don't end up with a duplicate entry.

Then deploy:

```bash
npm run deploy     # type-checks and builds, applies database migrations, deploys
```

Wrangler prints your site's address, `https://for-your-consideration.<your-subdomain>.workers.dev`. Open it: the site loads, but it's empty until step 4. You can add your own domain any time under **Workers & Pages → for-your-consideration → Settings → Domains & Routes**.

**Optional: deploy on every push.** Under **Workers & Pages → for-your-consideration → Settings → Builds**, connect the GitHub repo:
- Build command: `npm run build`
- Deploy command: `npx wrangler d1 migrations apply DB --remote && npx wrangler deploy`

If a build fails on the migrations step with a permissions error, set the deploy command to `npx wrangler deploy` and run `npm run db:migrate:remote` from your computer whenever a new file appears in `migrations/`.

### 2. Protect the admin with Cloudflare Access (no code)

1. In the Cloudflare dashboard, open **Zero Trust**. The first time, choose a team name and the **Free** plan.
2. Go to **Access controls → Applications → Add an application → Self-hosted**.
   - **Add public hostname:** pick your site's hostname (the `workers.dev` address works, or your own domain) and enter the path `admin`.
   - **Add public hostname** again with the same hostname and the path `api/admin`.
   - **Policy:** action *Allow*, rule *Include → Emails →* your email address.
     - ⚠️ Don't use "Login Methods → One-time PIN" as the Include rule. That would let anyone who can receive an email in.
   - **Login method:** One-time PIN (a code emailed to you). If it isn't offered, add it under **Zero Trust → Settings → Authentication → Login methods**.
3. Copy two values:
   - **AUD tag:** open the application → **Configure** → **Additional settings** → **Application Audience (AUD) Tag**.
   - **Team domain:** **Zero Trust → Settings** shows your team name. The domain is `<team-name>.cloudflareaccess.com`.
4. Put them in `wrangler.jsonc` under `vars`, then run `npm run deploy` again:

   ```jsonc
   "vars": {
     "ACCESS_TEAM_DOMAIN": "yourteam.cloudflareaccess.com",
     "ACCESS_AUD": "the-long-aud-tag"
   }
   ```

   These two values aren't secret; they're safe to commit.

Visit `https://<your-site>/admin`. You should see Cloudflare's login page, then the admin after entering the emailed code.

Until step 4 is done, the admin API refuses every request. It also re-checks Access's signed token itself, so it stays locked on any address Access doesn't cover, such as preview URLs. **If you later add your own domain, add it to the Access application too** (both paths). Then turn the `workers.dev` address off under **Settings → Domains & Routes** so there's a single place to sign in.

### 3. Artwork lookups (optional, free keys)

"Find art" in the admin looks up official artwork. Spotify covers need no key. For the rest:

```bash
npx wrangler secret put TMDB_API_KEY          # films, TV, headshots — themoviedb.org → Settings → API
npx wrangler secret put TWITCH_CLIENT_ID      # game covers (IGDB) — dev.twitch.tv/console/apps → Register
npx wrangler secret put TWITCH_CLIENT_SECRET
```

Each `secret put` takes effect immediately, with no redeploy needed. Secrets live in Cloudflare, not in the repo. The admin Dashboard shows which sources are set up. For local development, put the same lines in `.dev.vars`.

### 4. Add the content

Open `https://<your-site>/admin`, sign in, go to **Batch ingest**, and upload [`seed/example-catalog.json`](seed/example-catalog.json) (the ingest page also has a button to download it). Then flip **Games** off on the Dashboard until your list is ready.

### Updating later

- **With Builds connected:** push to `main` and it deploys itself.
- **Without:** run `npm run deploy`.

Database migrations are applied as part of either path.

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
