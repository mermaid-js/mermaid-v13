// The SVG writer's shortcuts give exactly what the full checks give (R-SEC-2).
import { describe, expect, it } from 'vitest';
import { esc, escAttr } from './escape.ts';

/** `escAttr` written out: `esc`, then tab, LF and CR as character references. */
const escAttrInFull = (v: string) => esc(v).replace(/[\t\n\r]/g, (c) => `&#${c.charCodeAt(0)};`);

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
