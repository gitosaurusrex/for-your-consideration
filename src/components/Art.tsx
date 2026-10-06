import { useState, type CSSProperties } from 'react';
import type { Item } from '../types';
import { itemArt, itemHue } from '../data';
import { useLang } from '../i18n';

const glyph: Record<string, string> = { film: '🎬', tv: '📺', song: '🎵', album: '💿' };

/**
 * Official art when we have it; otherwise a generated "poster" in the item's colours,
 * so the layout never shows a broken image.
 */
export function Art({ item, className = '', style, eager }: { item: Item; className?: string; style?: CSSProperties; eager?: boolean }) {
  const { lang } = useLang();
  const src = itemArt(item);
  const [failed, setFailed] = useState(false);
  const hue = itemHue(item);
  const loc = item[lang];
  const shape = item.section === 'watch' ? 'art--poster' : 'art--square';

  return (
    <div className={`art ${shape} ${className}`} style={{ '--h': hue, ...style } as CSSProperties}>
      {src && !failed ? (
        <img src={src} alt={loc.title} loading={eager ? 'eager' : 'lazy'} decoding="async" onError={() => setFailed(true)} />
      ) : (
        <div className="art__generated" aria-label={loc.title} role="img">
          <span className="art__glyph" aria-hidden>{glyph[item.en.kind]}</span>
          <span className="art__title">{loc.title}</span>
          <span className="art__year">{item.en.year}</span>
        </div>
      )}
    </div>
  );
}
