// Loads seed/example-catalog.json into your LOCAL database through the same ingest the admin uses.
// Start `npm run dev` first. Records that already exist are left alone.
import fs from 'node:fs';

const base = process.env.SEED_URL ?? 'http://localhost:5173';
const file = JSON.parse(fs.readFileSync(new URL('../seed/example-catalog.json', import.meta.url), 'utf8'));

const post = async (path, body) => {
  const res = await fetch(`${base}/api/admin${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
};

try {
  const plan = await post('/ingest/preview', { file, decisions: {} });
  const decisions = Object.fromEntries(plan.entries.filter((e) => e.status === 'changed').map((e) => [e.key, 'skip']));
  const { summary } = await post('/ingest/apply', { file, decisions, filename: 'example-catalog.json' });
  console.log('Seeded:', summary.counts);
} catch (err) {
  console.error(`Couldn't seed (${err.message}). Is \`npm run dev\` running, and has \`npm run db:migrate\` been run?`);
  process.exit(1);
}
