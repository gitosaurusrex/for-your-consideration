import { useEffect, useState } from 'react';
import { PERIODS, periodAt, type Period } from './shared/schema';

export { PERIODS, periodAt, type Period };

/** Ambient tint for the home page in each period. */
export const PERIOD_HUE: Record<Period, number> = { morning: 22, afternoon: 200, evening: 318, night: 232 };

/** Browser-bar color, matching --bg in each palette (styles.css). */
const THEME_COLOR: Record<Period, string> = { morning: '#fff7ef', afternoon: '#f2f7fb', evening: '#1a0f1d', night: '#070b18' };

function apply(period: Period) {
  const root = document.documentElement;
  if (root.dataset.period === period) return;
  root.dataset.period = period;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[period]);
}

/**
 * The visitor's current time of day, from their own clock. Re-checked every minute
 * (and when the tab comes back into view), so the palette and greeting follow along.
 */
export function usePeriod(): Period {
  const [period, setPeriod] = useState<Period>(() => periodAt(new Date()));

  useEffect(() => {
    const tick = () => setPeriod(periodAt(new Date()));
    const timer = setInterval(tick, 60_000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);

  useEffect(() => apply(period), [period]);
  return period;
}
