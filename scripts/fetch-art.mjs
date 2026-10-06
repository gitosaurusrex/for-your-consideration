// Fills in official artwork for any entry that doesn't have it yet:
//   • Films & TV  → poster + backdrop from TMDB (needs a free TMDB API key)
//   • People in films/TV → profile photo from TMDB
//   • Music       → cover art from Spotify (no key needed; needs a real open.spotify.com link)
//
// Usage:  npm run fetch-art            (only fills blanks)
//         npm run fetch-art -- --force (re-fetches everything)
//
// Put TMDB_API_KEY=... in a .env file (see .env.example).
import { readCollection, setShared, writeEntry } from './lib.mjs';

const force = process.argv.includes('--force');
const TMDB_KEY = process.env.TMDB_API_KEY;
const IMG = 'https://image.tmdb.org/t/p';

async function tmdb(path, params = {}) {
  const url = new URL(`https://api.themoviedb.org/3${path}`);
  for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, String(v));
  const headers = { accept: 'application/json' };
  // Accept either a v3 API key or a v4 "read access token".
  if (TMDB_KEY.startsWith('eyJ')) headers.authorization = `Bearer ${TMDB_KEY}`;
  else url.searchParams.set('api_key', TMDB_KEY);
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`TMDB ${res.status} for ${path}`);
  return res.json();
}

async function findTitle(en) {
  const type = en.kind === 'tv' ? 'tv' : 'movie';
  if (en.tmdb_id) return { type, id: en.tmdb_id };
  const yearParam = type === 'tv' ? { first_air_date_year: en.year } : { primary_release_year: en.year };
  let { results } = await tmdb(`/search/${type}`, { query: en.title, ...yearParam });
  if (!results.length) ({ results } = await tmdb(`/search/${type}`, { query: en.title }));
  return results[0] ? { type, id: results[0].id } : null;
}

async function titles() {
  if (!TMDB_KEY) return console.log('• Skipping films/TV and people: set TMDB_API_KEY in .env (free at themoviedb.org → Settings → API).');
  const credited = new Set();
  for (const e of readCollection('titles')) {
    const en = e.data.en;
    [...(en.directors ?? []), ...(en.cast ?? [])].forEach((p) => credited.add(p));
    if (!force && en.poster && en.backdrop) continue;
    try {
      const hit = await findTitle(en);
      if (!hit) { console.log(`  ? ${e.slug}: not found on TMDB — add its tmdb_id in the CMS`); continue; }
      const details = await tmdb(`/${hit.type}/${hit.id}`);
      if (details.poster_path && (force || !en.poster)) setShared(e.data, 'poster', `${IMG}/w780${details.poster_path}`);
      if (details.backdrop_path && (force || !en.backdrop)) setShared(e.data, 'backdrop', `${IMG}/w1280${details.backdrop_path}`);
      if (!en.tmdb_id) setShared(e.data, 'tmdb_id', String(hit.id));
      writeEntry(e.file, e.data);
      console.log(`  ✓ ${e.slug} (${details.title ?? details.name})`);
    } catch (err) { console.log(`  ✗ ${e.slug}: ${err.message}`); }
  }

  for (const e of readCollection('people')) {
    if (!credited.has(e.slug) || (!force && e.data.en.photo)) continue;
    try {
      const { results } = await tmdb('/search/person', { query: e.data.en.name });
      const p = results.find((r) => r.profile_path);
      if (!p) continue;
      setShared(e.data, 'photo', `${IMG}/w185${p.profile_path}`);
      writeEntry(e.file, e.data);
      console.log(`  ✓ ${e.slug}`);
    } catch (err) { console.log(`  ✗ ${e.slug}: ${err.message}`); }
  }
}

async function music() {
  for (const e of readCollection('music')) {
    const en = e.data.en;
    if (!force && en.cover) continue;
    if (!/^https:\/\/open\.spotify\.com\/(intl-[a-z]+\/)?(track|album)\//.test(en.spotify_url ?? '')) {
      console.log(`  ? ${e.slug}: needs a Spotify track/album link (Share → Copy link) to fetch its cover`);
      continue;
    }
    try {
      const res = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(en.spotify_url)}`);
      if (!res.ok) throw new Error(`Spotify ${res.status}`);
      const { thumbnail_url } = await res.json();
      if (!thumbnail_url) continue;
      setShared(e.data, 'cover', thumbnail_url);
      writeEntry(e.file, e.data);
      console.log(`  ✓ ${e.slug}`);
    } catch (err) { console.log(`  ✗ ${e.slug}: ${err.message}`); }
  }
}

console.log('Films, TV & people (TMDB)…');
await titles();
console.log('Music (Spotify)…');
await music();
console.log('Done. Review the changes, then commit them.');
