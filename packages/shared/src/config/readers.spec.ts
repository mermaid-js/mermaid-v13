import { describe, expect, it } from 'vitest';
import type { ConfigLengthWarning, ConfigRangeWarning } from './readers.ts';
import {
  configNumber,
  configRanges,
  lengthReader,
  NON_NEGATIVE,
  rawConfigNumber,
  useMaxWidth,
} from './readers.ts';

describe('rawConfigNumber', () => {
  it('reads numbers and numeric strings, a blank one only when asked', () => {
    expect(rawConfigNumber(3)).toBe(3);
    expect(rawConfigNumber('2.5')).toBe(2.5);
    expect(rawConfigNumber('')).toBeNaN();
    expect(rawConfigNumber(' ', true)).toBe(0);
    expect(rawConfigNumber(true)).toBeNaN();
  });
});

describe('configNumber', () => {
  it('takes a finite number at least min, capped at max', () => {
    expect(configNumber('7', 0, 5)).toBe(5);
    expect(configNumber(-1, 0)).toBeUndefined();
    expect(configNumber('x')).toBeUndefined();
    expect(configNumber(Infinity)).toBeUndefined();
    expect(configNumber('', 0, Infinity, true)).toBe(0);
  });
});

describe('useMaxWidth', () => {
  it('reads each policy', () => {
    expect(useMaxWidth(0)).toBe(true);
    expect(useMaxWidth(false)).toBe(false);
    expect(useMaxWidth(0, 'truthy')).toBe(false);
    expect(useMaxWidth(undefined, 'truthy')).toBe(true);
    const bad: unknown[] = [];
    expect(useMaxWidth('no', 'boolean', false, (v) => bad.push(v))).toBe(false);
    expect(useMaxWidth(undefined, 'boolean', true, (v) => bad.push(v))).toBe(true);
    expect(bad).toEqual(['no']);
  });
});

describe('configRanges', () => {
  it('takes a number in range, drops any other set value for the default and warns', () => {
    const warnings: ConfigRangeWarning[] = [];
    const section = { a: '7', b: -1, c: 'wide', d: undefined, e: 2 };
    const number = configRanges('pie', 'PIE_CONFIG_INVALID', section, (w) => warnings.push(w));
    expect(number('a', 1, NON_NEGATIVE)).toBe(7);
    expect(number('b', 1, NON_NEGATIVE)).toBe(1);
    expect(number('c', 1)).toBe(1);
    expect(number('d', 1, NON_NEGATIVE)).toBe(1);
    expect(number('e', 0.5, { min: 0, max: 1, wants: 'a number from 0 to 1' })).toBe(0.5);
    expect(number('toString', 3, NON_NEGATIVE)).toBe(3);
    expect(warnings).toEqual([
      {
        code: 'PIE_CONFIG_INVALID',
        message: 'pie.b is -1, not a number of 0 or more; using the default 1',
      },
      { code: 'PIE_CONFIG_INVALID', message: 'pie.c is "wide", not a number; using the default 1' },
      {
        code: 'PIE_CONFIG_INVALID',
        message: 'pie.e is 2, not a number from 0 to 1; using the default 0.5',
      },
    ]);
  });

  it('names the key in the warning when asked, and reads no section as unset', () => {
    const warnings: ConfigRangeWarning[] = [];
    const number = configRanges('xyChart', 'X', { w: null }, (w) => warnings.push(w), true);
    expect(number('w', 5)).toBe(5);
    expect(warnings).toEqual([
      {
        code: 'X',
        message: 'xyChart.w is null, not a number; using the default 5',
        path: 'xyChart.w',
      },
    ]);
    expect(configRanges('x', 'X', undefined, () => expect.fail())('w', 5)).toBe(5);
  });
});

describe('lengthReader', () => {
  it('takes a finite number at least min, nothing else, and warns when a set value is dropped', () => {
    const warnings: ConfigLengthWarning[] = [];
    const length = lengthReader('GIT_CONFIG_IGNORED', (w) => warnings.push(w));
    expect(length(12, 8, 'gitGraph.padding')).toBe(12);
    expect(length(undefined, 8, 'gitGraph.padding')).toBe(8);
    expect(length('20', 8, 'gitGraph.padding')).toBe(8);
    expect(length(0, 2, 'gitGraph.styles', 1)).toBe(2);
    expect(warnings).toEqual([
      {
        code: 'GIT_CONFIG_IGNORED',
        message: 'Ignored gitGraph.padding: it is not a number of at least 0; using 8',
        path: 'gitGraph.padding',
      },
      {
        code: 'GIT_CONFIG_IGNORED',
        message: 'Ignored gitGraph.styles: it is not a number of at least 1; using 2',
        path: 'gitGraph.styles',
      },
    ]);
    expect(lengthReader('X', undefined)(Infinity, 3, 'x')).toBe(3);
  });
});
