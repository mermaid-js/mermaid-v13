// The SVG writer's shortcuts give exactly what the full checks give (R-SEC-2).
import { describe, expect, it } from 'vitest';
import { ALLOWED_ATTRS, GRADIENT_ATTRS, HREF_TAGS, isAllowedAttr } from './allowlist.ts';
import { formatValue } from './encode.ts';
import { esc, escAttr } from './escape.ts';
import type { Attrs } from './types.ts';
import { streamWriter, treeWriter } from './writer.ts';

/** `escAttr` written out: `esc`, then tab, LF and CR as character references. */
const escAttrInFull = (v: string) => esc(v).replace(/[\t\n\r]/g, (c) => `&#${c.charCodeAt(0)};`);

/** `formatValue`'s name checks written out, before any shortcut: the message it throws, or ''. */
function nameProblem(tag: string, name: string): string {
  if (GRADIENT_ATTRS.has(name)) return `${name} is not allowed on <${tag}>`;
  if (!isAllowedAttr(name)) return `${name} is not an allowed SVG attribute`;
  if (name === 'href' && !HREF_TAGS.has(tag)) return `href is not allowed on <${tag}>`;
  if (name === 'xmlns' && tag !== 'svg') return `xmlns is only allowed on <svg>`;
  return '';
}

const problemOf = (f: () => unknown): string => {
  try {
    f();
    return '';
  } catch (e) {
    return (e as Error).message;
  }
};

describe('escAttr', () => {
  it('writes every UTF-16 code unit as esc and the whitespace references do, wherever it is', () => {
    let checked = 0;
    for (let c = 0; c <= 0xffff; c++) {
      const ch = String.fromCharCode(c);
      for (const v of [ch, `a${ch}`, `${ch}b`, `a b${ch}c d`]) {
        const written = escAttr(v);
        if (written !== escAttrInFull(v))
          expect(written, `U+${c.toString(16)}`).toBe(escAttrInFull(v));
        checked++;
      }
    }
    expect(checked).toBe(4 * 0x10000);
  });

  it('escapes user text that holds every character the full escaping rewrites', () => {
    const user = 'a & b < c > d " e \t f \n g \r h \u0001 i \u007f j ￾ k \ud800 l 😀';
    expect(escAttr(user)).toBe(
      'a &amp; b &lt; c &gt; d &quot; e &#9; f &#10; g &#13; h  i  j  k  l 😀'
    );
  });

  it('keeps a value with nothing to escape as it is', () => {
    expect(escAttr('M 1,2 L 3.5,-4 Z')).toBe('M 1,2 L 3.5,-4 Z');
    expect(escAttr('')).toBe('');
  });
});

describe('formatValue: attribute names', () => {
  const TAGS = ['svg', 'g', 'a', 'image', 'path', 'text'];
  // Names an untyped caller can pass: the whole table, the gradient's, and names that a plain
  // object lookup would find on Object.prototype.
  const NAMES = [
    ...ALLOWED_ATTRS,
    ...GRADIENT_ATTRS.keys(),
    'onclick',
    'onload',
    'constructor',
    '__proto__',
    'toString',
    'hasOwnProperty',
    'xlink:href',
    'HREF',
    'style ',
    '',
  ];

  it('throws exactly what the full name checks throw, for every name on every tag', () => {
    for (const tag of TAGS)
      for (const name of NAMES) {
        expect(
          problemOf(() => formatValue(tag, name, 'x')),
          `${name} on <${tag}>`
        ).toBe(nameProblem(tag, name));
      }
  });

  it('skips an undefined value before any name check', () => {
    for (const name of NAMES) expect(formatValue('g', name, undefined)).toBeUndefined();
  });

  it('still checks the value of a name every element may carry', () => {
    expect(() => formatValue('g', 'class', { toString: () => 'x' })).toThrow(
      'Unsupported value for class'
    );
    expect(() => formatValue('g', 'x', [1, 'a'])).toThrow('x takes numbers');
  });

  it('refuses the same names on both backings, through an untyped caller', () => {
    for (const name of ['onclick', 'constructor', 'offset', 'href', 'xmlns']) {
      const attrs = { [name]: 'x' } as unknown as Attrs;
      const stream = problemOf(() => streamWriter().leaf('g', attrs));
      expect(stream, name).not.toBe('');
      expect(
        problemOf(() => treeWriter().leaf('g', attrs)),
        name
      ).toBe(stream);
    }
  });
});
