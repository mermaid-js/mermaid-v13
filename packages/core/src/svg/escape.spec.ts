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

describe('esc and escAttr on every character up to U+00FF', () => {
  // The XML rules, character by character: markup characters as references, the characters XML
  // does not allow dropped, and in attribute values tab, LF and CR as character references.
  const MARKUP: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
  const SPACE: Record<string, string> = { '\t': '&#9;', '\n': '&#10;', '\r': '&#13;' };
  const text = (ch: string): string => MARKUP[ch] ?? (RE_INVALID_XML.test(ch) ? '' : ch);

  it('escapes each one on its own and between plain text', () => {
    for (let c = 0; c <= 0xff; c++) {
      const ch = String.fromCharCode(c);
      const attr = SPACE[ch] ?? text(ch);
      expect(esc(ch), `esc U+${c.toString(16)}`).toBe(text(ch));
      expect(escAttr(ch), `escAttr U+${c.toString(16)}`).toBe(attr);
      expect(esc(`M0,0 ${ch} x`), `esc in text U+${c.toString(16)}`).toBe(`M0,0 ${text(ch)} x`);
      expect(escAttr(`M0,0 ${ch} x`), `escAttr in text U+${c.toString(16)}`).toBe(`M0,0 ${attr} x`);
    }
  });

  it('returns path data, transforms and class lists unchanged', () => {
    for (const v of [
      'M0,0L10.5,-3C1,2 3,4 5,6Z',
      'translate(1,2) rotate(45)',
      'node default a-b_c',
    ]) {
      expect(esc(v)).toBe(v);
      expect(escAttr(v)).toBe(v);
    }
  });
});
