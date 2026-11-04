import { describe, expect, it } from 'vitest';
import { fontSizePx } from './fonts.ts';

describe('fontSizePx', () => {
  it('resolves units and keywords as the browser draws them', () => {
    expect(fontSizePx('20px', 16)).toBe(20);
    expect(fontSizePx('12pt', 16)).toBe(16);
    expect(fontSizePx('1.5em', 10)).toBe(15);
    expect(fontSizePx('2rem', 10)).toBe(32);
    expect(fontSizePx('150%', 10)).toBe(15);
    expect(fontSizePx('large', 10)).toBe(18);
    expect(fontSizePx(18, 10)).toBe(18);
  });

  it('gives no size for what has none here', () => {
    expect(fontSizePx('10vw', 16)).toBeUndefined();
    expect(fontSizePx('big', 16)).toBeUndefined();
    expect(fontSizePx(undefined, 16)).toBeUndefined();
  });
});
