import fs from 'node:fs';
import path from 'node:path';

export const ROOT = path.resolve(import.meta.dirname, '..');
export const CONTENT = path.join(ROOT, 'content');

/** Read every JSON entry in a content folder → [{ slug, file, data }]. */
export function readCollection(name) {
  const dir = path.join(CONTENT, name);
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const file = path.join(dir, f);
      return { slug: f.replace(/\.json$/, ''), file, data: JSON.parse(fs.readFileSync(file, 'utf8')) };
    });
}

export function writeEntry(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

/** Set a field that is shared across languages. */
export function setShared(data, key, value) {
  for (const lang of ['en', 'ja']) if (data[lang]) data[lang][key] = value;
}
