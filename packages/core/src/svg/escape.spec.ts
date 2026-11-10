import { describe, expect, it } from 'vitest';
import { esc, escAttr, RE_INVALID_XML } from './escape.ts';

describe('esc', () => {
  it('escapes markup characters', () => {
    expect(esc('a & <b> "c"')).toBe('a &amp; &lt;b&gt; &quot;c&quot;');
  });

  it('drops exactly the characters RE_INVALID_XML rejects', () => {
    for (let c = 0; c <= 0xffff; c++) {
      const ch = String.fromCharCode(c);
      if ('&<>"'.includes(ch)) continue;
      expect(esc(ch) === '', `U+${c.toString(16)}`).toBe(RE_INVALID_XML.test(ch));
    }
  });

  it('keeps surrogate pairs and drops lone halves', () => {
    expect(esc('😀')).toBe('😀');
    expect(esc('a\ud83db\ude00c')).toBe('abc');
  });
});

describe('escAttr', () => {
  it('handles every BMP character with attribute whitespace preserved as references', () => {
    const markup: Readonly<Record<string, string>> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      '\t': '&#9;',
      '\n': '&#10;',
      '\r': '&#13;',
    };
    for (let c = 0; c <= 0xffff; c++) {
      const ch = String.fromCharCode(c);
      const expected = markup[ch] ?? (RE_INVALID_XML.test(ch) ? '' : ch);
      expect(escAttr(ch), `U+${c.toString(16)}`).toBe(expected);
    }
  });

  it('keeps valid non-ASCII and drops invalid characters in mixed values', () => {
    expect(escAttr('é中文😀𝄞\ud800&\u0000\ude00"\t\n\r<>')).toBe(
      'é中文😀𝄞&amp;&quot;&#9;&#10;&#13;&lt;&gt;'
    );
  });

  it('keeps repeated attributes separate from text and from previous values', () => {
    for (const value of ['', 'plain', '&"\t\n\r', '😀', '\u0000', 'plain', '']) {
      const expected = esc(value)
        .replaceAll('\t', '&#9;')
        .replaceAll('\n', '&#10;')
        .replaceAll('\r', '&#13;');
      expect(escAttr(value)).toBe(expected);
      expect(escAttr(value)).toBe(expected);
    }
    expect(escAttr('a\tb')).toBe('a&#9;b');
    expect(esc('a\tb')).toBe('a\tb');
  });
});
