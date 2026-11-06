import { describe, expect, it } from 'vitest';
import { accDescrValue, accTitleValue, labelValue, titleValue } from './convert.ts';

/**
 * Value conversion against v12's own code (`common/valueConverter.ts`, `matcher.ts`, Langium's
 * `convertString`), copied here as the reference, over generated values: the hand-written
 * scans must give what v12's regexes gave.
 */
const v12 = {
  oneLine: (m: string) => m.trim().replace(/[\t ]{2,}/gm, ' '),
  title: (image: string) => v12.oneLine(/title([\t ][^\n\r]*|)/.exec(image)?.[1] ?? ''),
  accTitle: (image: string) => v12.oneLine(/accTitle[\t ]*:([^\n\r]*)/.exec(image)?.[1] ?? ''),
  accDescr: (image: string) => {
    const m = /accDescr(?:[\t ]*:([^\n\r]*)|\s*{([^}]*)})/.exec(image);
    if (m?.[1] !== undefined) return v12.oneLine(m[1]);
    return (m?.[2] ?? '')
      .replace(/^\s*/gm, '')
      .replace(/\s+$/gm, '')
      .replace(/[\t ]{2,}/gm, ' ')
      .replace(/[\n\r]{2,}/gm, '\n');
  },
  label: (image: string) => {
    const esc: Record<string, string> = {
      b: '\b',
      f: '\f',
      n: '\n',
      r: '\r',
      t: '\t',
      v: '\v',
      0: '\0',
    };
    let out = '';
    for (let i = 1; i < image.length - 1; i++) {
      const c = image.charAt(i);
      if (c === '\\') {
        const e = image.charAt(++i);
        out += esc[e] ?? e;
      } else out += c;
    }
    return out;
  },
};

/** A small seeded generator (mulberry32). */
function random(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PARTS = [
  ' ',
  '  ',
  '\t',
  '\n',
  '\n\n',
  '\r',
  '\u00a0',
  '\u2028',
  '\ufeff',
  'a',
  'bc',
  ':',
  '%',
];
function text(rand: () => number, max: number): string {
  let out = '';
  const n = Math.floor(rand() * max);
  for (let k = 0; k < n; k++) out += PARTS[Math.floor(rand() * PARTS.length)] ?? '';
  return out;
}
const oneLine = (t: string) => t.replace(/[\n\r]/g, '');

describe('radar value conversion', () => {
  it('matches v12 on generated values', () => {
    const rand = random(446);
    for (let k = 0; k < 3000; k++) {
      const t = text(rand, 14);
      const pre = rand() < 0.5 ? '' : ' \t';
      const cases: [string, (s: string) => string, (s: string) => string][] = [
        [`${pre}accDescr {${t.replace(/}/g, '')}}`, accDescrValue, v12.accDescr],
        [`${pre}accDescr${rand() < 0.5 ? ' ' : ''}:${oneLine(t)}`, accDescrValue, v12.accDescr],
        [`${pre}accTitle ${rand() < 0.5 ? '\t' : ''}:${oneLine(t)}`, accTitleValue, v12.accTitle],
        [`${pre}title${oneLine(t) === '' ? '' : ' ' + oneLine(t)}`, titleValue, v12.title],
        [`"${t.replace(/["\\]/g, '\\$&').replace(/a/g, '\\a')}"`, labelValue, v12.label],
      ];
      for (const [image, ours, theirs] of cases) {
        expect(ours(image), JSON.stringify(image)).toBe(theirs(image));
      }
    }
  });
});
