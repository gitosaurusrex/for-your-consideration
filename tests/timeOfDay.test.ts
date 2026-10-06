import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, periodAt, PERIODS } from '../src/shared/schema';

const at = (h: number, m = 0) => periodAt(new Date(2026, 0, 1, h, m));

describe('periodAt', () => {
  it('splits the day at 5, 11, 17 and 21', () => {
    expect([at(4, 59), at(5), at(10, 59), at(11), at(16, 59), at(17), at(20, 59), at(21), at(0)])
      .toEqual(['night', 'morning', 'morning', 'afternoon', 'afternoon', 'evening', 'evening', 'night', 'night']);
  });
});

describe('default home text', () => {
  it('has a greeting for every period in both languages', () => {
    for (const p of PERIODS) {
      expect(DEFAULT_SETTINGS.text[p].en).toBeTruthy();
      expect(DEFAULT_SETTINGS.text[p].ja).toBeTruthy();
    }
  });
  it('stays friendly without romantic wording', () => {
    const all = JSON.stringify(DEFAULT_SETTINGS.text);
    expect(all).not.toMatch(/love|♡|愛|あなた|darling|dear/i);
  });
});
