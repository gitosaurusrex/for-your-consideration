import { describe, expect, it } from 'vitest';
import { greetingWords } from '../src/pages/Home';

const pieces = (s: string) => greetingWords(s).map((w) => (w.space ? ' ' : '|') + w.text).join('').slice(1);

describe('greetingWords', () => {
  it('keeps English words whole and breaks only at spaces', () => {
    expect(pieces('Hello, night owl')).toBe('Hello, night owl');
    expect(pieces('Good afternoon')).toBe('Good afternoon');
  });
  it('breaks Japanese only before a polite ending or after punctuation', () => {
    expect(pieces('おはようございます')).toBe('おはよう|ございます');
    expect(pieces('お疲れさまです')).toBe('お疲れさま|です');
    expect(pieces('こんにちは')).toBe('こんにちは');
    expect(pieces('こんばんは')).toBe('こんばんは');
    expect(pieces('ようこそ、本棚へ')).toBe('ようこそ、|本棚へ');
  });
  it('does not split very short words before an ending', () => {
    expect(pieces('ます')).toBe('ます');
    expect(pieces('です')).toBe('です');
  });
});
