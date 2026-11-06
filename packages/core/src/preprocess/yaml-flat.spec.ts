import { describe, expect, it } from 'vitest';
import { parseYaml } from './yaml.ts';
import { flatYamlMap } from './yaml-flat.ts';

// The flowchart reads shape data (`A@{ shape: rect }`) as v12 did: the text between the braces
// wrapped as a flow mapping, `{\n<data>\n}` (#277).
const asYaml = (data: string) => parseYaml(`{\n${data}\n}`);

// What the fast path must give: undefined (read it with parseYaml), or exactly parseYaml's value,
// with its keys in the same order, where parseYaml reports nothing.
function agrees(data: string): boolean {
  const flat = flatYamlMap(data);
  if (flat === undefined) return false;
  const { value, diagnostics } = asYaml(data);
  expect(diagnostics, data).toEqual([]);
  expect(flat, data).toEqual(value);
  expect(Object.keys(flat), data).toEqual(Object.keys(value as object));
  return true;
}

describe('flatYamlMap: shape data without the YAML reader (#277)', () => {
  it('reads flat key: value lists as parseYaml does', () => {
    const table: [string, Record<string, unknown>][] = [
      [' shape: rect', { shape: 'rect' }],
      ['shape: rect, label: "Hello, world"', { shape: 'rect', label: 'Hello, world' }],
      ['label: "a \\"b\\" c"', { label: 'a "b" c' }],
      ['label: "colon: inside, comma too"', { label: 'colon: inside, comma too' }],
      ["label: 'it''s'", { label: "it's" }],
      ['label: "日本語 ✓ 😀"', { label: '日本語 ✓ 😀' }],
      ['w: 100, h: 50.5, x: -3, y: .inf, z: 0x1F', { w: 100, h: 50.5, x: -3, y: Infinity, z: 31 }],
      ['flag: true, nil: null, t: ~, F: FALSE', { flag: true, nil: null, t: null, F: false }],
      ['icon: "fa:fa-user", pos: "b"', { icon: 'fa:fa-user', pos: 'b' }],
      ['label: Hello world  ,  shape: card', { label: 'Hello world', shape: 'card' }],
      ['a: -b, c: +1, d: -0', { a: '-b', c: 1, d: -0 }],
      ['under_score: x_y, dash-key: a-b', { under_score: 'x_y', 'dash-key': 'a-b' }],
    ];
    for (const [data, expected] of table) {
      expect(flatYamlMap(data), data).toEqual(expected);
      agrees(data);
    }
  });

  it('leaves everything else to parseYaml', () => {
    for (const data of [
      '',
      '   ',
      'a',
      'a:b',
      'a: b,',
      'a: ',
      'a: , b: c',
      'label: a:b',
      'url: http://x',
      'a: { b: c }',
      'a: [1, 2]',
      'a: 1, a: 2',
      '__proto__: x',
      'constructor: x',
      'true: x',
      'null: x',
      'a: b # comment',
      'a: b\nc: d',
      'a: "x\u0001y"',
      'a: "tab\there"',
      'a: "unclosed',
      "a: 'unclosed",
      'a: "x" y',
      'a: - b',
      'a: &x b',
      'a: !tag b',
      'a: *x',
      'a: @x',
      'a: `x`',
      'a: |',
      'a: >',
      'a: %x',
      'a: ?x',
      '"quoted": key',
      'a: "bad \\q escape"',
    ]) {
      expect(flatYamlMap(data), JSON.stringify(data)).toBeUndefined();
    }
  });

  it('agrees with parseYaml over 3000 generated shape data texts', () => {
    let state = 2026;
    const rnd = () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 2 ** 32;
    const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)] as T;
    const keys = ['shape', 'label', 'w', 'h', 'icon', 'pos', 'a_b', 'k-1', 'true', 'x'];
    // Values the fast path reads, and values it must leave to parseYaml.
    const good = [
      'rect',
      'diam',
      'Hello world',
      '100',
      '-2.5',
      '.5',
      '0x1F',
      '0o17',
      '1e3',
      'true',
      'False',
      'null',
      '~',
      'yes',
      'NaN',
      '.nan',
      '-.inf',
      '+3',
      '-x',
      '"q"',
      '"a, b: c"',
      '"esc \\" \\\\ \\n \\t \\u00e9"',
      "'s''q'",
      "'a: b'",
      '"日本"',
    ];
    const tricky = [
      'a:b',
      'a #b',
      '"bad \\q"',
      '[1]',
      '{a: b}',
      '',
      '- x',
      '&a',
      '*a',
      '!t',
      '@x',
      '`x`',
      '"x',
      "'x",
      '"\u0001"',
      '"\t"',
    ];
    const spaces = ['', ' ', '  ', rnd() < 0.5 ? ' ' : '\t'];
    let flat = 0;
    for (let n = 0; n < 3000; n++) {
      const pairs: string[] = [];
      const count = 1 + Math.floor(rnd() * 4);
      for (let p = 0; p < count; p++)
        pairs.push(
          `${pick(spaces)}${pick(keys)}${rnd() < 0.97 ? ':' : ''}${pick(spaces)}${pick(rnd() < 0.8 ? good : tricky)}${pick(spaces)}`
        );
      if (agrees(pairs.join(rnd() < 0.95 ? ',' : ' ') + (rnd() < 0.05 ? ',' : ''))) flat++;
    }
    // Enough of them take the fast path for the comparison to say something.
    expect(flat).toBeGreaterThan(300);
  });
});
