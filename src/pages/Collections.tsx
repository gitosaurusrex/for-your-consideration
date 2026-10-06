import type { CSSProperties } from 'react';
import { useParams } from 'react-router';
import { getGenre, getPerson, hueOf, itemsFromCountry, itemsInGenre, worksOf } from '../data';
import { countryName, flag, useLang } from '../i18n';
import { Avatar } from '../components/Chips';
import { Grid } from '../components/Grid';
import { usePageHue } from '../components/Layout';
import type { Item } from '../types';
import { NotFound } from './NotFound';

const reveal = (i: number) => ({ '--i': i }) as CSSProperties;

function Section({ title, items, instance, index }: { title: string; items: Item[]; instance: string; index: number }) {
  if (!items.length) return null;
  return (
    <section className="section">
      <header className="section__head reveal" style={reveal(index)}><h2>{title}</h2></header>
      <Grid items={items} instance={instance} />
    </section>
  );
}

export function GenrePage() {
  const { slug = '' } = useParams();
  const { lang, t } = useLang();
  const g = getGenre(slug);
  const hue = g?.en.hue ?? hueOf(slug);
  usePageHue(hue);
  if (!g) return <NotFound />;
  const items = itemsInGenre(slug);
  const watch = items.filter((i) => i.section === 'watch');
  const listen = items.filter((i) => i.section === 'listen');
  return (
    <div className="page collection" style={{ '--h': hue } as CSSProperties}>
      <header className="page-head page-head--banner">
        <p className="eyebrow reveal" style={reveal(0)}>{t.genre} · {t.recsCount(items.length)}</p>
        <h1 className="page-title page-title--huge reveal" style={reveal(1)}><span className="hash">#</span>{g[lang].name}</h1>
        {g.en.name !== g.ja.name && <p className="page-alt reveal" style={reveal(2)}>{g[lang === 'en' ? 'ja' : 'en'].name}</p>}
      </header>
      <Section title={`🎬 ${t.navWatch}`} items={watch} instance={`genre-${slug}-watch`} index={3} />
      <Section title={`🎧 ${t.navListen}`} items={listen} instance={`genre-${slug}-listen`} index={4} />
    </div>
  );
}

export function PersonPage() {
  const { slug = '' } = useParams();
  const { lang, t } = useLang();
  const p = getPerson(slug);
  usePageHue(hueOf(slug));
  if (!p) return <NotFound />;
  const { directed, starred, recorded } = worksOf(slug);
  const total = new Set([...directed, ...starred, ...recorded]).size;
  const altName = p[lang === 'en' ? 'ja' : 'en'].name;
  return (
    <div className="page collection" style={{ '--h': hueOf(slug) } as CSSProperties}>
      <header className="page-head page-head--person">
        <div className="reveal" style={reveal(0)}><Avatar slug={slug} size={112} /></div>
        <div>
          <p className="eyebrow reveal" style={reveal(1)}>{t.person} · {t.recsCount(total)}</p>
          <h1 className="page-title reveal" style={reveal(2)}>{p[lang].name}</h1>
          {altName !== p[lang].name && <p className="page-alt reveal" style={reveal(3)}>{altName}</p>}
        </div>
      </header>
      <Section title={`🎬 ${t.directed}`} items={directed} instance={`person-${slug}-dir`} index={4} />
      <Section title={`⭐ ${t.actedIn}`} items={starred} instance={`person-${slug}-cast`} index={5} />
      <Section title={`🎧 ${t.music}`} items={recorded} instance={`person-${slug}-music`} index={6} />
    </div>
  );
}

export function CountryPage() {
  const { code = '' } = useParams();
  const { lang, t } = useLang();
  const upper = code.toUpperCase();
  usePageHue(hueOf(upper));
  const items = itemsFromCountry(upper);
  if (!/^[A-Z]{2}$/.test(upper) || !items.length) return <NotFound />;
  return (
    <div className="page collection">
      <header className="page-head page-head--banner">
        <p className="eyebrow reveal" style={reveal(0)}>{t.madeIn} · {t.recsCount(items.length)}</p>
        <h1 className="page-title page-title--huge reveal" style={reveal(1)}>
          <span className="flag-big" aria-hidden>{flag(upper)}</span> {countryName(upper, lang)}
        </h1>
      </header>
      <Grid items={items} instance={`country-${upper}`} />
    </div>
  );
}
