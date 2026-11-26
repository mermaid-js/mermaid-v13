import { describe, expect, it } from 'vitest';
import { decodeEntities } from './index.ts';

describe('decodeEntities', () => {
  it('decodes the ASCII punctuation names authors use to escape syntax (#396)', () => {
    const names =
      'colon semi vert verbar lpar rpar lsqb rsqb lcub rcub num excl quest commat equals plus comma period sol bsol grave lowbar percnt dollar ast';
    const source = names
      .split(' ')
      .map((name) => `&${name};`)
      .join('');
    expect(decodeEntities(source)).toBe(':;||()[]{}#!?@=+,./\\`_%$*');
  });

  it('decodes named, decimal and hex references between other text', () => {
    expect(decodeEntities('a &lt; b &amp;&amp; c &#35;1 &#x41;&hearts;')).toBe('a < b && c #1 A♥');
  });

  it('leaves an unknown name and a bare ampersand as written', () => {
    expect(decodeEntities('R&D &bogus; &; &colon')).toBe('R&D &bogus; &; &colon');
  });

  it('decodes once: a decoded ampersand does not start a new reference', () => {
    expect(decodeEntities('&amp;lt;')).toBe('&lt;');
  });

  it('returns text without an ampersand unchanged', () => {
    expect(decodeEntities('plain #colon; text')).toBe('plain #colon; text');
  });

  // As HTML reads text content (D709, #1313): numeric references and legacy names need no `;`.
  it('decodes numeric references without a semicolon', () => {
    expect(decodeEntities('a &#60 b &#x3c c &#X3C; &#60;')).toBe('a < b < c < <');
  });

  it('decodes a legacy name without a semicolon, also as the prefix of a longer word', () => {
    expect(decodeEntities('raw &lt x &gt &amp &quot &copy 2026')).toBe('raw < x > & " © 2026');
    expect(decodeEntities('&ltx &amplifier &times3')).toBe('<x &lifier ×3');
  });

  it('keeps names without a legacy form, unknown names and Mermaid escapes as written', () => {
    expect(decodeEntities('&apos &bogus &hearts &colon #lt x &# &#x')).toBe(
      '&apos &bogus &hearts &colon #lt x &# &#x'
    );
  });

  it('decodes a name written with its semicolon before trying a legacy prefix', () => {
    expect(decodeEntities('&times; &timesx &ltx;')).toBe('× ×x <x;');
  });
});
