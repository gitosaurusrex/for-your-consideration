import { availabilityActive, today } from '../shared/schema';
import type { Item } from '../types';
import { formatDate, useLang } from '../i18n';

const SOON_DAYS = 14;

/** "Free for a limited time · until Dec 31" — hidden automatically once the date passes. */
export function AvailabilityBadge({ item }: { item: Item }) {
  const { lang, t } = useLang();
  const a = item.doc.availability;
  if (!a || !availabilityActive(a)) return null;
  const label = a.free && a.limited_time ? t.freeLimited : a.free ? t.free : t.limited;
  const days = a.until ? (Date.parse(`${a.until}T00:00:00Z`) - Date.parse(`${today()}T00:00:00Z`)) / 864e5 : Infinity;
  const soon = days <= SOON_DAYS;
  return (
    <p className={`availability ${a.free ? 'availability--free' : ''} ${soon ? 'availability--soon' : ''}`}>
      <span className="availability__icon" aria-hidden>{a.free ? '🎟' : '⏳'}</span>
      <span>
        <strong>{label}</strong>
        {item.doc.watch_service && <> · {item.doc.watch_service}</>}
        {a.until && <> · {t.until(formatDate(a.until, lang))}</>}
      </span>
      {soon && <span className="availability__soon">{t.leavingSoon}</span>}
    </p>
  );
}
