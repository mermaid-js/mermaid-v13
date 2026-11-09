import { describe, expect, it } from 'vitest';
import {
  accDescrValue,
  accTitleValue,
  classDefParts,
  isPlainNumber,
  numberValue,
  splitStyles,
  titleValue,
} from './convert.ts';

/**
 * Value conversion against v12's own code (`treemap/valueConverter.ts`, `db.ts` `addClass`,
 * `common/valueConverter.ts`, `matcher.ts`), copied here as the reference, over generated
 * values: the hand-written scans must give what v12's regexes gave.
 */
const LABEL = ['color', 'font-size', 'font-weight', 'text-align', 'white-space', 'hyphens'];
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
  number: (image: string) => parseFloat(image.replace(/,/g, '')),
  classDef: (image: string) => {
    const m = /classDef\s+([A-Z_a-z]\w+)(?:\s+([^\n\r;]*))?;?/.exec(image);
    return { name: m?.[1], styleText: m?.[2] || undefined };
  },
  /** `addClass` on text whose entities are v12's placeholders, decoded after the split. */
  styles: (text: string) => {
    const encoded = text.replace(/#(\w+);/g, (_, n: string) => `ﬂ°${n}¶ß`);
    const styles = encoded
      .replace(/\\,/g, '§§§')
      .replace(/,/g, ';')
      .replace(/§§§/g, ',')
      .split(';')
      .map((s) => s.replace(/ﬂ°(\d+)¶ß/g, '&#$1;').replace(/ﬂ°(\w+)¶ß/g, '&$1;'));
    return { styles, textStyles: styles.filter((s) => LABEL.includes(s)) };
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

function pick(rand: () => number, parts: readonly string[], max: number): string {
  let out = '';
  const n = Math.floor(rand() * max);
  for (let k = 0; k < n; k++) out += parts[Math.floor(rand() * parts.length)] ?? '';
  return out;
}

const TEXT = [' ', '  ', '\t', '\n', '\n\n', '\r', ' ', ' ', '﻿', 'a', 'bc', ':', '%'];
const STYLES = [
  'fill:red',
  'color',
  ' ',
  ',',
  ';',
  '\\,',
  '#ab;',
  '#12;',
  '#',
  'x',
  ':',
  'font-size',
];
const oneLine = (t: string) => t.replace(/[\n\r]/g, '');

describe('treemap value conversion', () => {
  it('matches v12 on generated titles and accessibility values', () => {
    const rand = random(484);
    for (let k = 0; k < 3000; k++) {
      const t = pick(rand, TEXT, 14);
      const pre = rand() < 0.5 ? '' : ' \t';
      const cases: [string, (s: string) => string, (s: string) => string][] = [
        [`${pre}accDescr {${t.replace(/}/g, '')}}`, accDescrValue, v12.accDescr],
        [`${pre}accDescr${rand() < 0.5 ? ' ' : ''}:${oneLine(t)}`, accDescrValue, v12.accDescr],
        [`${pre}accTitle ${rand() < 0.5 ? '\t' : ''}:${oneLine(t)}`, accTitleValue, v12.accTitle],
        [`${pre}title${oneLine(t) === '' ? '' : ' ' + oneLine(t)}`, titleValue, v12.title],
      ];
      for (const [image, ours, theirs] of cases) {
        expect(ours(image), JSON.stringify(image)).toBe(theirs(image));
      }
    }
  });

  it('matches v12 on generated numbers', () => {
    const rand = random(402);
    for (let k = 0; k < 3000; k++) {
      const image = '1' + pick(rand, ['0', '1', '9', '.', ',', '_'], 8);
      expect(numberValue(image), image).toBe(v12.number(image));
    }
    expect(numberValue('.')).toBeNaN();
  });

  it('matches v12 on generated classDef tokens and their styles', () => {
    const rand = random(408);
    for (let k = 0; k < 3000; k++) {
      const gap = pick(rand, [' ', '\t', '\n'], 3) || ' ';
      const name = ['ab', 'a1', '_x', 'abc_9'][Math.floor(rand() * 4)] ?? 'ab';
      const styles = oneLine(pick(rand, STYLES, 8)).replace(/;/g, ',');
      const tail = rand() < 0.3 ? '' : `${gap}${styles}${rand() < 0.5 ? ';' : ''}`;
      const image = `classDef${gap}${name}${tail}`;
      const ours = classDefParts(image);
      expect({ name: ours.name, styleText: ours.styleText }, image).toEqual(v12.classDef(image));
      const all = pick(rand, STYLES, 10);
      expect(splitStyles(all), all).toEqual(v12.styles(all));
    }
  });

  it("reads a value as written only when it is digits with v12's thousands commas (D402)", () => {
    const plain = ['0', '01', '1.', '.5', '1.25', '1,000', '12,345,678.9', '1,', '1,000,'];
    const not = ['.', '_', ',', '1_000', '1.2.3', '1,2,3', '1000,000', '1,00', '1,000.5.', '1.,'];
    for (const v of plain) expect(isPlainNumber(v), v).toBe(true);
    for (const v of not) expect(isPlainNumber(v), v).toBe(false);
  });
});
