import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { MEDIA, type I18n, type Medium, type SiteSettings } from '../shared/schema';
import { api, type IngestListRow } from './api';
import { useAction, useAdmin } from './context';
import { I18nInput } from './fields';
import { countLinked, MirrorProgress, useMirror } from './mirror';

const MEDIUM_UI: Record<Medium, { icon: string; label: string }> = {
  watch: { icon: '🎬', label: 'Film & TV' },
  listen: { icon: '🎧', label: 'Music' },
  play: { icon: '🎮', label: 'Games' },
};

export function Dashboard() {
  const { data, reload } = useAdmin();
  const run = useAction();
  const [ingests, setIngests] = useState<IngestListRow[]>([]);
  const [text, setText] = useState<SiteSettings['text']>(data.settings.text);
  const [art, setArt] = useState<{ tmdb: boolean; igdb: boolean } | null>(null);
  const mirror = useMirror();
  const images = countLinked([...data.items, ...data.people, ...data.companies]);
  useEffect(() => {
    api.ingests().then(setIngests).catch(() => {});
    api.artStatus().then(setArt).catch(() => {});
  }, []);

  const toggle = async (m: Medium) => {
    const on = !data.settings.media[m];
    if (await run(() => api.settings({ media: { ...data.settings.media, [m]: on } }), `${MEDIUM_UI[m].label} ${on ? 'shown' : 'hidden'} on the site`)) await reload();
  };

  return (
    <div className="admin-page">
      <div className="admin-head">
        <h1>Dashboard</h1>
        <div className="admin-head__actions">
          <a className="btn btn--ghost" href="/api/admin/export" download>⬇ Export everything (JSON)</a>
          <Link className="btn btn--primary" to="/admin/ingest">⬆ Batch ingest</Link>
        </div>
      </div>

      <section className="panel">
        <h2>Sections</h2>
        <p className="muted">Switch a whole medium off to hide it everywhere on the public site (nav, home, search, genres, people pages). Nothing is deleted.</p>
        <div className="media-switches">
          {MEDIA.map((m) => {
            const count = data.items.filter((i) => i.medium === m).length;
            const on = data.settings.media[m];
            return (
              <div key={m} className={`media-switch ${on ? 'is-on' : ''}`}>
                <span className="media-switch__icon">{MEDIUM_UI[m].icon}</span>
                <div>
                  <strong>{MEDIUM_UI[m].label}</strong>
                  <span className="muted"> · {count} item{count === 1 ? '' : 's'}</span>
                  <div className="media-switch__state">{on ? 'Visible on the site' : 'Hidden'}</div>
                </div>
                <button role="switch" aria-checked={on} aria-label={`Show ${MEDIUM_UI[m].label}`} className="switch" onClick={() => toggle(m)}>
                  <span className="switch__thumb" />
                </button>
              </div>
            );
          })}
        </div>
        <p className="muted small">
          {data.people.length} people · {data.companies.length} studios · {data.genres.length} genres —{' '}
          <Link to="/admin/items">manage items</Link>
        </p>
      </section>

      <section className="panel">
        <h2>Images</h2>
        <div className="media-switch is-flat">
          <div>
            <strong>Keep a copy of artwork on this site</strong>
            <div className="muted small">
              Artwork you pick with “Find art”, and artwork linked in ingested files, is downloaded into your own storage,
              so it keeps working even if the source changes. Uploads are always stored.
            </div>
          </div>
          <button role="switch" aria-checked={data.settings.keepCopies} aria-label="Keep a copy of artwork" className="switch"
            onClick={async () => { if (await run(() => api.settings({ keepCopies: !data.settings.keepCopies }), 'Saved')) await reload(); }}>
            <span className="switch__thumb" />
          </button>
        </div>
        <p className="small">
          <b>{images.stored}</b> image{images.stored === 1 ? '' : 's'} stored on your site · <b>{images.linked}</b> linked from other sites
          {images.linked > 0 && !mirror.running && (
            <> — <button className="link-button" onClick={() => mirror.run(images.linked)}>copy {images.linked === 1 ? 'it' : `all ${images.linked}`} now</button></>
          )}
        </p>
        <MirrorProgress {...mirror} />
        {art && (
          <p className="muted small">
            “Find art” sources: TMDB (films, TV, people) {art.tmdb ? '✓' : '✗ not set up'} · IGDB (games) {art.igdb ? '✓' : '✗ not set up'} · Spotify (music) ✓ always
            {(!art.tmdb || !art.igdb) && <> — see README → Artwork for the free keys.</>}
          </p>
        )}
      </section>

      <section className="panel">
        <h2>Recent ingests</h2>
        {ingests.length === 0 ? <p className="muted">No batches yet. <Link to="/admin/ingest">Ingest your first JSON file →</Link></p> : (
          <table className="table">
            <thead><tr><th>When</th><th>File</th><th>Added</th><th>Replaced</th><th>Filled</th><th>Skipped</th><th>Errors</th><th /></tr></thead>
            <tbody>
              {ingests.map((r) => (
                <tr key={r.id}>
                  <td>{new Date(r.created_at).toLocaleString()}</td>
                  <td>{r.filename ?? '—'}</td>
                  <td>{r.counts.added}</td><td>{r.counts.replaced}</td><td>{r.counts.filled}</td><td>{r.counts.skipped}</td>
                  <td className={r.counts.error ? 'text-error' : ''}>{r.counts.error}</td>
                  <td><Link to={`/admin/ingests/${r.id}`}>Review →</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel">
        <h2>Home page text</h2>
        {(['greeting', 'intro', 'signoff'] as const).map((k) => (
          <I18nInput key={k} label={{ greeting: 'Greeting', intro: 'Intro', signoff: 'Sign-off' }[k]} multiline={k === 'intro'}
            value={text[k]} onChange={(v) => setText({ ...text, [k]: v as I18n })} />
        ))}
        <button className="btn btn--primary" onClick={async () => { if (await run(() => api.settings({ text }), 'Home page text saved')) await reload(); }}>
          Save text
        </button>
      </section>
    </div>
  );
}
