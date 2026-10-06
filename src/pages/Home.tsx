import type { CSSProperties } from 'react';
import { allItems, genres, itemHue, itemKey, itemPath, itemsInGenre, music, site, titles } from '../data';
import { useLang } from '../i18n';
import { Art } from '../components/Art';
import { GenreTag } from '../components/Chips';
import { Shelf } from '../components/Grid';
import { usePageHue } from '../components/Layout';
import { VLink } from '../components/VLink';
import { claimArt, isActiveArt } from '../transitions';
import type { Item } from '../types';

function FeaturedCard({ item, index }: { item: Item; index: number }) {
  const { lang, t } = useLang();
  const loc = item[lang];
  const key = itemKey(item);
  return (
    <VLink
      to={itemPath(item)}
      className="feature reveal"
      style={{ '--h': itemHue(item), '--i': index + 3 } as CSSProperties}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        claimArt(e.currentTarget.querySelector('.vt-art'), key, 'featured');
      }}
    >
      <Art item={item} className="vt-art feature__art" eager style={isActiveArt(key, 'featured') ? { viewTransitionName: 'art' } : undefined} />
      <div className="feature__body">
        <span className="eyebrow">{item.en.year} · {t[item.en.kind]}</span>
        <h3 className="feature__title">{loc.title}</h3>
        <p className="feature__summary">{loc.summary}</p>
      </div>
    </VLink>
  );
}

export function Home() {
  const { lang, t } = useLang();
  usePageHue(268);
  const s = site[lang];
  const featured = allItems.filter((i) => i.en.featured).slice(0, 4);
  const fan = (featured.length >= 3 ? featured : allItems).slice(0, 5);
  const genreCounts = genres
    .map((g) => ({ g, n: itemsInGenre(g.slug).length }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n);

  return (
    <div className="page home">
      <section className="hero">
        <div className="hero__copy">
          <p className="eyebrow reveal" style={{ '--i': 0 } as CSSProperties}>{t.tagline}</p>
          <h1 className="hero__greeting reveal" style={{ '--i': 1 } as CSSProperties}>
            {[...s.greeting].map((ch, i) => (
              <span key={i} className="wave" style={{ '--c': i } as CSSProperties}>{ch === ' ' ? ' ' : ch}</span>
            ))}
          </h1>
          <p className="hero__intro reveal" style={{ '--i': 2 } as CSSProperties}>{s.intro}</p>
          <p className="hero__signoff reveal" style={{ '--i': 3 } as CSSProperties}>— {s.signoff} ♡</p>
          <div className="hero__ctas reveal" style={{ '--i': 4 } as CSSProperties}>
            <VLink to="/watch" className="btn btn--primary">🎬 {t.navWatch}</VLink>
            <VLink to="/listen" className="btn btn--ghost">🎧 {t.navListen}</VLink>
          </div>
        </div>
        <div className="hero__fan" aria-hidden>
          {fan.map((item, i) => (
            <div key={itemKey(item)} className="hero__fan-card" style={{ '--n': i, '--total': fan.length } as CSSProperties}>
              <Art item={item} eager />
            </div>
          ))}
        </div>
      </section>

      {featured.length > 0 && (
        <section className="section">
          <header className="section__head reveal" style={{ '--i': 2 } as CSSProperties}>
            <h2>✦ {t.featured}</h2>
          </header>
          <div className="features">
            {featured.map((item, i) => <FeaturedCard key={itemKey(item)} item={item} index={i} />)}
          </div>
        </section>
      )}

      <section className="section">
        <header className="section__head reveal" style={{ '--i': 4 } as CSSProperties}>
          <h2>🎬 {t.latestWatch}</h2>
          <VLink to="/watch" className="section__more">{t.seeAll} →</VLink>
        </header>
        <Shelf items={titles} instance="shelf-watch" />
      </section>

      <section className="section">
        <header className="section__head reveal" style={{ '--i': 5 } as CSSProperties}>
          <h2>🎧 {t.latestListen}</h2>
          <VLink to="/listen" className="section__more">{t.seeAll} →</VLink>
        </header>
        <Shelf items={music} instance="shelf-listen" />
      </section>

      <section className="section">
        <header className="section__head reveal" style={{ '--i': 6 } as CSSProperties}>
          <h2># {t.genres}</h2>
        </header>
        <div className="tag-cloud reveal" style={{ '--i': 7 } as CSSProperties}>
          {genreCounts.map(({ g, n }) => <GenreTag key={g.slug} slug={g.slug} count={n} />)}
        </div>
      </section>
    </div>
  );
}
