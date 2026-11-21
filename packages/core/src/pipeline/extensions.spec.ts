import { describe, expect, it } from 'vitest';
import { someString } from '../index.ts';

describe('someString', () => {
  const model = {
    title: 'a',
    nodes: [{ label: 'b' }, { label: 'c' }],
    byId: new Map<unknown, unknown>([['d', { text: 'e' }]]),
    classes: new Set(['f']),
    size: 3,
    none: null,
  };

  it('visits every string of objects, arrays, Map keys and values, and Sets', () => {
    const met: string[] = [];
    expect(someString(model, (s) => (met.push(s), false))).toBe(false);
    expect([...met].sort()).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('stops at the first string the test accepts', () => {
    const met: string[] = [];
    expect(someString(['x', 'y', 'z'], (s) => (met.push(s), s === 'y'))).toBe(true);
    expect(met).toEqual(['z', 'y']);
  });

  it('visits a shared or cyclic object once', () => {
    const shared = { text: 's' };
    const cyclic: Record<string, unknown> = { a: shared, b: shared };
    cyclic.self = cyclic;
    const met: string[] = [];
    expect(someString(cyclic, (s) => (met.push(s), false))).toBe(false);
    expect(met).toEqual(['s']);
  });

  it('takes a string itself, and finds none in other values', () => {
    expect(someString('hit', (s) => s === 'hit')).toBe(true);
    expect(someString(undefined, () => true)).toBe(false);
    expect(someString(42, () => true)).toBe(false);
  });
});
