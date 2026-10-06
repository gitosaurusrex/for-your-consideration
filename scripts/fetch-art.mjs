// Fills in official artwork in an ingest file before you upload it:
//   • Films & TV → poster + backdrop from TMDB          (needs TMDB_API_KEY)
//   • People     → headshot + short bio from TMDB       (needs TMDB_API_KEY)
//   • Games      → cover art from IGDB                   (needs TWITCH_CLIENT_ID + TWITCH_CLIENT_SECRET)
//   • Music      → cover art from Spotify               (no key; needs a real open.spotify.com track/album link)
//
// Usage:  npm run fetch-art -- my-batch.json            (fills blanks, saves the file in place)
//         npm run fetch-art -- my-batch.json --force    (re-fetches even where art exists)
//
// Keys go in a .env file (see .env.example). Always review what it found before ingesting.
import fs from 'node:fs';

const args = process.argv.slice(2);
const path = args.find((a) => !a.startsWith('--'));
const force = args.includes('--force');
if (!path) {
  console.error('Usage: npm run fetch-art -- <ingest-file.json> [--force]');
  process.exit(1);
}
const file = JSON.parse(fs.readFileSync(path, 'utf8'));
const { TMDB_API_KEY, TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET } = process.env;
const en = (v) => (typeof v === 'string' ? v : v?.en);
const needs = (obj, ...keys) => force || keys.some((k) => !obj[k]);
let changed = 0;

// ── TMDB ──
const TMDB_IMG = 'https://image.tmdb.org/t/p';
async function tmdb(p, params = {}) {
  const url = new URL(`https://api.themoviedb.org/3${p}`);
  for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, String(v));
  const headers = { accept: 'application/json' };
  // Accept either a v3 API key or a v4 read access token.
  if (TMDB_API_KEY.startsWith('eyJ')) headers.authorization = `Bearer ${TMDB_API_KEY}`;
  else url.searchParams.set('api_key', TMDB_API_KEY);
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  return res.json();
}

async function titles() {
  const list = (file.items ?? []).filter((i) => (i.kind === 'film' || i.kind === 'tv') && needs(i, 'poster', 'backdrop'));
  if (!list.length) return;
  if (!TMDB_API_KEY) return console.log('• Skipping films/TV: set TMDB_API_KEY in .env (free at themoviedb.org → Settings → API).');
  for (const item of list) {
    const type = item.kind === 'tv' ? 'tv' : 'movie';
    try {
      let id = item.tmdb_id;
      if (!id) {
        const yearKey = type === 'tv' ? 'first_air_date_year' : 'primary_release_year';
        let { results } = await tmdb(`/search/${type}`, { query: en(item.title), [yearKey]: item.year });
        if (!results.length) ({ results } = await tmdb(`/search/${type}`, { query: en(item.title) }));
        id = results[0]?.id;
      }
      if (!id) { console.log(`  ? ${en(item.title)}: not found on TMDB — add "tmdb_id"`); continue; }
      const d = await tmdb(`/${type}/${id}`);
      if (d.poster_path && (force || !item.poster)) item.poster = `${TMDB_IMG}/w780${d.poster_path}`;
      if (d.backdrop_path && (force || !item.backdrop)) item.backdrop = `${TMDB_IMG}/w1280${d.backdrop_path}`;
      item.tmdb_id ??= String(id);
      changed++;
      console.log(`  ✓ ${en(item.title)} → ${d.title ?? d.name} (${(d.release_date ?? d.first_air_date ?? '').slice(0, 4)})`);
    } catch (e) { console.log(`  ✗ ${en(item.title)}: ${e.message}`); }
  }
}

// Same rules as shortBio in worker/art.ts: the first few sentences, skipping Wikipedia boilerplate.
function shortBio(text, lang) {
  const para = text?.split(/\n+/).map((s) => s.trim()).find((s) => s && !/^from wikipedia/i.test(s) && !/^description above from/i.test(s));
  if (!para) return undefined;
  const sentences = lang === 'ja' ? para.match(/[^。！？]+[。！？」]*/g) ?? [para] : para.split(/(?<=[.!?]["”’)]?)\s+(?=[A-Z"“(])/);
  const limit = lang === 'ja' ? 220 : 450;
  let out = '';
  for (const s of sentences.slice(0, 3)) {
    const next = out ? (lang === 'ja' ? out + s : `${out} ${s}`) : s;
    if (out && next.length > limit) break;
    out = next;
  }
  return out.trim() || undefined;
}

const hasBio = (p) => (typeof p.bio === 'string' ? !!p.bio : !!(p.bio?.en || p.bio?.ja));

async function people() {
  const list = (file.people ?? []).filter((p) => force || !p.photo || !hasBio(p));
  if (!list.length || !TMDB_API_KEY) return;
  for (const person of list) {
    try {
      const { results } = await tmdb('/search/person', { query: en(person.name) });
      const hit = results.find((r) => r.profile_path) ?? results[0];
      if (!hit) { console.log(`  ? ${en(person.name)}: not on TMDB — add a photo and bio by hand`); continue; }
      const got = [];
      if (hit.profile_path && (force || !person.photo)) { person.photo = `${TMDB_IMG}/w342${hit.profile_path}`; got.push('photo'); }
      if (force || !hasBio(person)) {
        const [d, dJa] = await Promise.all([tmdb(`/person/${hit.id}`), tmdb(`/person/${hit.id}`, { language: 'ja-JP' }).catch(() => ({}))]);
        const bioEn = shortBio(d.biography, 'en');
        if (bioEn) {
          // TMDB falls back to the English text when there's no Japanese bio; only keep a real translation.
          const bioJa = dJa.biography && dJa.biography !== d.biography ? shortBio(dJa.biography, 'ja') : undefined;
          person.bio = { en: bioEn, ...(bioJa ? { ja: bioJa } : {}) };
          person.bio_credit = /wikipedia/i.test(`${d.biography} ${dJa.biography ?? ''}`) ? 'Bio: Wikipedia via TMDB, CC BY-SA' : 'Bio: TMDB';
          got.push(bioJa ? 'bio (EN + 日本語)' : 'bio (EN)');
        }
      }
      if (!got.length) { console.log(`  ? ${en(person.name)}: TMDB has no photo or bio for ${hit.name}`); continue; }
      changed++;
      console.log(`  ✓ ${en(person.name)} → ${hit.name} (known for ${hit.known_for_department}): ${got.join(', ')}`);
    } catch (e) { console.log(`  ✗ ${en(person.name)}: ${e.message}`); }
  }
}

// ── IGDB (via Twitch) ──
async function games() {
  const list = (file.items ?? []).filter((i) => i.kind === 'game' && needs(i, 'cover'));
  if (!list.length) return;
  if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) return console.log('• Skipping games: set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET in .env (free at dev.twitch.tv → register an app).');
  const tok = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`, { method: 'POST' }).then((r) => r.json());
  if (!tok.access_token) return console.log('  ✗ Could not get an IGDB token — check the Twitch credentials.');
  for (const game of list) {
    const query = game.igdb_id
      ? `fields name,cover.image_id,first_release_date; where id = ${Number(game.igdb_id)};`
      : `search "${en(game.title).replace(/"/g, '')}"; fields name,cover.image_id,first_release_date; limit 5;`;
    try {
      const res = await fetch('https://api.igdb.com/v4/games', { method: 'POST', headers: { 'Client-ID': TWITCH_CLIENT_ID, Authorization: `Bearer ${tok.access_token}` }, body: query });
      if (!res.ok) throw new Error(`IGDB ${res.status}`);
      const results = await res.json();
      const year = Number(String(game.release_us ?? game.release_jp ?? '').slice(0, 4));
      const hit = results.find((r) => r.cover && year && new Date(r.first_release_date * 1000).getUTCFullYear() === year) ?? results.find((r) => r.cover);
      if (!hit) { console.log(`  ? ${en(game.title)}: not found on IGDB — add "igdb_id"`); continue; }
      game.cover = `https://images.igdb.com/igdb/image/upload/t_cover_big_2x/${hit.cover.image_id}.jpg`;
      game.igdb_id ??= String(hit.id);
      changed++;
      console.log(`  ✓ ${en(game.title)} → ${hit.name}`);
    } catch (e) { console.log(`  ✗ ${en(game.title)}: ${e.message}`); }
  }
}

// ── Spotify ──
async function music() {
  for (const m of (file.items ?? []).filter((i) => (i.kind === 'song' || i.kind === 'album') && needs(i, 'cover'))) {
    if (!/^https:\/\/open\.spotify\.com\/(intl-[a-z]+\/)?(track|album)\//.test(m.spotify_url ?? '')) {
      console.log(`  ? ${en(m.title)}: needs a Spotify track/album link (Share → Copy link) to fetch its cover`);
      continue;
    }
    try {
      const res = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(m.spotify_url)}`);
      if (!res.ok) throw new Error(`Spotify ${res.status}`);
      const { thumbnail_url } = await res.json();
      if (thumbnail_url) { m.cover = thumbnail_url; changed++; console.log(`  ✓ ${en(m.title)}`); }
    } catch (e) { console.log(`  ✗ ${en(m.title)}: ${e.message}`); }
  }
}

console.log('Films & TV…'); await titles();
console.log('People…'); await people();
console.log('Games…'); await games();
console.log('Music…'); await music();
fs.writeFileSync(path, JSON.stringify(file, null, 2) + '\n');
console.log(`Done — ${changed} update(s) saved to ${path}. Check the matches above, then upload it in /admin → Batch ingest.`);
