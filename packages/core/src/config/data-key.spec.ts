/**
 * `dataKey` keys what is derived from a config value, so two different values must never share a
 * key, and a value it cannot read (anything but plain data) must have none.
 */
import { describe, expect, it } from 'vitest';
import { dataKey } from './data-key.ts';

describe('dataKey', () => {
  it('gives equal plain data the same key, whatever object holds it', () => {
    const a = { theme: 'dark', flowchart: { curve: 'step', padding: [1, 2] } };
    const b = JSON.parse(JSON.stringify(a)) as unknown;
    expect(dataKey(b)).toBe(dataKey(a));
    expect(dataKey(Object.freeze({ x: 1 }))).toBe(dataKey({ x: 1 }));
    const bare = Object.assign(Object.create(null) as object, { x: 1 });
    expect(dataKey(bare)).toBe(dataKey({ x: 1 }));
  });

  it('gives different values different keys', () => {
    const values: unknown[] = [
      0,
      -0,
      1,
      1.5,
      Number.NaN,
      Infinity,
      -Infinity,
      '0',
      '-0',
      'NaN',
      'Infinity',
      '1',
      '',
      'null',
      'true',
      'undefined',
      '"',
      '\u0000',
      '\ud800',
      'a,b',
      'a:b',
      true,
      false,
      null,
      undefined,
      [],
      [undefined],
      [undefined, 1],
      [null],
      [''],
      [[]],
      ['a', 'b'],
      ['a,b'],
      [1, 2],
      [[1], 2],
      [1, [2]],
      {},
      { a: undefined },
      { a: null },
      { a: 1 },
      { a: '1' },
      { b: 1 },
      { a: 1, b: 2 },
      { b: 2, a: 1 },
      { 'a,b': 1 },
      { a: { b: 1 } },
      { 'a:{"b"': 1 },
      { '': 1 },
      { 0: 1 },
      [1],
      { __proto__: null, constructor: 1 } as unknown,
    ];
    const keys = values.map((v) => dataKey(v));
    for (const k of keys) expect(k).toBeTypeOf('string');
    expect(new Set(keys).size).toBe(values.length);
  });

  it('gives nested values different keys', () => {
    const keys = new Set<string | undefined>();
    const leaves: unknown[] = [0, -0, '0', null, undefined, true, 'true', [], {}];
    for (const x of leaves)
      for (const y of leaves) {
        keys.add(dataKey({ a: x, b: y }));
        keys.add(dataKey([x, y]));
        keys.add(dataKey({ a: [x, { b: y }] }));
      }
    expect(keys.size).toBe(3 * leaves.length * leaves.length);
  });

  it('has no key for what is not plain data', () => {
    const sparse: unknown[] = [];
    sparse[1] = 1;
    class Box {
      x = 1;
    }
    for (const v of [
      new Date(0),
      new Box(),
      () => 1,
      Symbol('s'),
      10n,
      new Map(),
      { a: new Date(0) },
      [1, { b: () => 2 }],
      { a: [new Box()] },
      sparse,
      { a: sparse },
    ])
      expect(dataKey(v)).toBeUndefined();
  });

  it('reads own enumerable string keys only, as config resolution does', () => {
    const o = { a: 1 };
    Object.defineProperty(o, 'hidden', { value: 2, enumerable: false });
    (o as Record<symbol, number>)[Symbol('s')] = 3;
    expect(dataKey(o)).toBe(dataKey({ a: 1 }));
  });
});
