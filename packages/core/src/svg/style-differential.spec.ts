/**
 * Spec #855, X5: the differential spec for `checkValue`. A frozen copy of the function as it was
 * before it became a table from kind to check, run against the new one over every kind and a
 * corpus of values: same result. Deleted together with this copy once the split is merged.
 */
import { describe, expect, it } from 'vitest';
import { BLEND_MODES, checkColor, checkLength, checkValue } from './style.ts';
import { PAYLOADS, V12_XSS_CASES } from './testing/index.ts';

const RE_LENGTH =
  /^-?(?:\d{1,10}(?:\.\d{1,10})?|\.\d{1,10})(?:px|em|rem|ex|ch|pt|pc|cm|mm|in|vw|vh|%)?$/i;
const RE_NUMBER = /^(?:\d{1,10}(?:\.\d{1,10})?|\.\d{1,10})%?$/;
const RE_FAMILY = /^[\p{L}\p{N}\s,'"_.-]{1,200}$/u;
const FONT_SIZES: ReadonlySet<string> = new Set([
  'xx-small',
  'x-small',
  'small',
  'medium',
  'large',
  'x-large',
  'xx-large',
  'smaller',
  'larger',
]);
const WEIGHTS: ReadonlySet<string> = new Set([
  'normal',
  'bold',
  'bolder',
  'lighter',
  '100',
  '200',
  '300',
  '400',
  '500',
  '600',
  '700',
  '800',
  '900',
]);
const DECORATIONS: ReadonlySet<string> = new Set(['none', 'underline', 'overline', 'line-through']);

type Kind =
  | 'blend'
  | 'color'
  | 'length'
  | 'opacity'
  | 'dash'
  | 'weight'
  | 'fontStyle'
  | 'family'
  | 'decoration'
  | 'cap'
  | 'join'
  | 'size'
  | 'spacing';
function legacyCheckValue(kind: Kind, v: string): string | undefined {
  const lower = v.toLowerCase();
  switch (kind) {
    case 'blend':
      return BLEND_MODES.has(lower) ? lower : undefined;
    case 'color':
      return checkColor(v);
    case 'length':
      return checkLength(v);
    case 'size':
      return FONT_SIZES.has(lower) ? lower : checkLength(v);
    case 'spacing':
      return lower === 'normal' ? lower : checkLength(v);
    case 'opacity':
      return RE_NUMBER.test(v) ? v : undefined;
    case 'dash': {
      if (lower === 'none') return lower;
      const parts = v.split(/[\s,]+/).filter((p) => p !== '');
      return parts.length > 0 && parts.length <= 32 && parts.every((p) => RE_LENGTH.test(p))
        ? parts.join(' ')
        : undefined;
    }
    case 'weight':
      return WEIGHTS.has(lower) ? lower : undefined;
    case 'fontStyle':
      return lower === 'normal' || lower === 'italic' || lower === 'oblique' ? lower : undefined;
    case 'family':
      return RE_FAMILY.test(v) ? v : undefined;
    case 'decoration': {
      const words = lower.split(/\s+/);
      return words.length <= 3 && words.every((w) => DECORATIONS.has(w))
        ? words.join(' ')
        : undefined;
    }
    case 'cap':
      return lower === 'butt' || lower === 'round' || lower === 'square' ? lower : undefined;
    case 'join':
      return lower === 'miter' || lower === 'round' || lower === 'bevel' ? lower : undefined;
  }
}

const KINDS: readonly Kind[] = [
  'blend',
  'color',
  'length',
  'opacity',
  'dash',
  'weight',
  'fontStyle',
  'family',
  'decoration',
  'cap',
  'join',
  'size',
  'spacing',
];

const VALUES: readonly string[] = [
  '',
  ' ',
  'none',
  'NONE',
  'normal',
  'Normal',
  'multiply',
  'screen',
  'bold',
  'BOLD',
  '700',
  '1000',
  'italic',
  'oblique',
  'Oblique',
  'slanted',
  'butt',
  'round',
  'square',
  'miter',
  'bevel',
  'Bevel',
  'underline',
  'underline overline',
  'underline overline line-through none',
  'UNDERLINE',
  'x-large',
  'XX-Small',
  'smaller',
  'huge',
  '12px',
  '1.5em',
  '.5',
  '-3',
  '-.5rem',
  '100%',
  '1e3',
  '0',
  '10 5',
  '4,2',
  '1 2 3 4',
  '1,  2 ,3',
  Array.from({ length: 32 }, () => '1').join(' '),
  Array.from({ length: 33 }, () => '1').join(' '),
  '1px 2',
  'a b',
  '5px,',
  ',5px',
  '#fff',
  '#FFFFFF',
  '#ff00ff80',
  'red',
  'RED',
  'rgb(0 0 0 / 0.5)',
  'rgb(1,2,3)',
  'hsl(10 20% 30%)',
  'var(--mermaid-x)',
  'var(--_a, red)',
  'var(--other)',
  'color-mix(in srgb, red 50%, blue)',
  'transparent',
  'currentColor',
  'url(#a)',
  'Arial, sans-serif',
  "'Open Sans', serif",
  '"A B"',
  'a'.repeat(200),
  'a'.repeat(201),
  'a;b',
  'a{b}',
  'é, ü',
  '\u0000',
  '\ufffe',
  ...PAYLOADS,
  ...V12_XSS_CASES.flatMap((c) => [...(c.styles ?? []), ...(c.values ?? [])]),
];

describe("the table-driven checkValue gives the old function's result", () => {
  it.each(KINDS)('for %s', (kind) => {
    expect(BLEND_MODES.size).toBeGreaterThan(0);
    for (const v of VALUES) {
      for (const w of [v, ` ${v} `, v.toUpperCase()]) {
        expect([kind, w, checkValue(kind, w)]).toEqual([kind, w, legacyCheckValue(kind, w)]);
      }
    }
  });
});
