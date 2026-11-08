import { describe, expect, it } from 'vitest';
import { numberEnd } from './values.ts';

/** `numberEnd` finds the prefix `parseFloat` reads: the prefix alone parses to the same number. */
describe('numberEnd', () => {
  it.each([
    ['1', 1],
    ['1;', 1],
    ['1 2', 1],
    ['-3x', 2],
    ['+.5e3%', 5],
    ['5.', 2],
    ['5.e', 2],
    ['1e', 1],
    ['1e+', 1],
    ['1E-2z', 4],
    ['Infinity1', 8],
    ['-Infinity', 9],
    ['0x10', 1],
    ['abc', 0],
    ['.', 0],
    ['-', 0],
    ['', 0],
  ])('%j reads %i characters', (s, n) => {
    expect(numberEnd(s)).toBe(n);
    const whole = parseFloat(s);
    if (n === 0) expect(whole).toBeNaN();
    else expect(parseFloat(s.slice(0, n))).toBe(whole);
  });
});
