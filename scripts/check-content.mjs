// Validates /content before every build so a typo in the CMS never ships a broken page.
// Errors fail the build; warnings (e.g. a missing Japanese translation) are just printed.
import { readCollection } from './lib.mjs';

const errors = [];
const warnings = [];
const err = (where, msg) => errors.push(`✗ ${where}: ${msg}`);
const warn = (where, msg) => warnings.push(`! ${where}: ${msg}`);

const people = new Set(readCollection('people').map((e) => e.slug));
const genres = new Set(readCollection('genres').map((e) => e.slug));

function isUrl(v) {
  try { new URL(v, 'https://example.com'); return true; } catch { return false; }
}

function checkEntry(collection, { slug, data }, spec) {
  const where = `${collection}/${slug}.json`;
  if (!/^[a-z0-9-]+$/.test(slug)) err(where, 'file name should be lowercase letters, numbers and dashes');
  const en = data.en;
  if (!en || typeof en !== 'object') return err(where, 'missing "en" object');
  const ja = data.ja ?? {};

  for (const f of spec.required) if (en[f] == null || en[f] === '' || (Array.isArray(en[f]) && !en[f].length)) err(where, `missing required field "${f}"`);
  for (const f of spec.translated ?? []) if (en[f] && !ja[f]) warn(where, `no Japanese "${f}" yet (English will be shown)`);
  if (spec.kinds && !spec.kinds.includes(en.kind)) err(where, `"kind" must be one of ${spec.kinds.join(', ')}`);
  if (en.year != null && !(Number.isInteger(en.year) && en.year > 1880 && en.year < 2100)) err(where, `odd release year "${en.year}"`);
  for (const c of en.countries ?? []) if (!/^[A-Z]{2}$/.test(c)) err(where, `country "${c}" should be a 2-letter code like US or JP`);
  for (const [field, set] of Object.entries(spec.relations ?? {}))
    for (const ref of en[field] ?? []) if (!set.has(ref)) err(where, `${field} → "${ref}" does not exist`);
  for (const f of spec.urls ?? []) if (en[f] && !isUrl(en[f])) err(where, `"${f}" is not a valid URL`);
}

for (const e of readCollection('titles'))
  checkEntry('titles', e, {
    required: ['title', 'kind', 'year', 'summary', 'directors', 'genres'],
    translated: ['title', 'summary', 'note'],
    kinds: ['film', 'tv'],
    relations: { directors: people, cast: people, genres },
    urls: ['poster', 'backdrop', 'watch_url', 'trailer_url'],
  });

for (const e of readCollection('music'))
  checkEntry('music', e, {
    required: ['title', 'kind', 'year', 'summary', 'artists', 'genres'],
    translated: ['title', 'summary', 'note'],
    kinds: ['song', 'album'],
    relations: { artists: people, genres },
    urls: ['cover', 'spotify_url', 'video_url'],
  });

for (const e of readCollection('people')) checkEntry('people', e, { required: ['name'], translated: ['name'], urls: ['photo'] });
for (const e of readCollection('genres')) checkEntry('genres', e, { required: ['name'], translated: ['name'] });

if (warnings.length) console.log(warnings.join('\n'));
if (errors.length) {
  console.error(errors.join('\n'));
  console.error(`\n${errors.length} problem(s) in /content — fix them in the CMS or the JSON files.`);
  process.exit(1);
}
console.log('✓ content looks good');
