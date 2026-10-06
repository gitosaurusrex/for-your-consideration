import { AnimatePresence, motion } from 'motion/react';
import type { Item } from '../types';
import { itemKey } from '../data';
import { useLang } from '../i18n';
import { Card } from './Card';

/** Responsive grid that animates items in, out and into their new places when filtered. */
export function Grid({ items, instance }: { items: Item[]; instance: string }) {
  const { t } = useLang();
  if (!items.length) return <p className="empty reveal">{t.noResults}</p>;
  return (
    <motion.div layout className="grid">
      <AnimatePresence mode="popLayout" initial={false}>
        {items.map((item, i) => (
          <motion.div
            key={itemKey(item)}
            layout
            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
            transition={{ type: 'spring', stiffness: 260, damping: 26 }}
            className="grid__cell"
          >
            <div className="reveal" style={{ '--i': Math.min(i, 12) } as React.CSSProperties}>
              <Card item={item} instance={instance} />
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </motion.div>
  );
}

/** Horizontally scrolling shelf with snap points. */
export function Shelf({ items, instance }: { items: Item[]; instance: string }) {
  return (
    <div className="shelf" role="list">
      {items.map((item, i) => (
        <div role="listitem" className="shelf__cell reveal" key={itemKey(item)} style={{ '--i': Math.min(i, 10) } as React.CSSProperties}>
          <Card item={item} instance={instance} />
        </div>
      ))}
    </div>
  );
}
