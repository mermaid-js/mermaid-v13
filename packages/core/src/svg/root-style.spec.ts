/**
 * The root `style` attribute. `styleText` keeps the escaped form of a value that ends with a
 * theme's root text (`noteRootText`), and the stream writer writes that form for the value
 * instead of escaping it again. The reference is what the writer wrote for every `style` before:
 * `escAttr` of the whole value. Generated heads and tails hold every character `escAttr` changes
 * or drops, valid surrogate pairs and lone halves.
 */
import { describe, expect, it } from 'vitest';
import { createTheme, loadTheme, THEME_NAMES } from '../theme/index.ts';
import { escAttr } from './escape.ts';
import { noteRootText, px, rootStyleAttr, styleText } from './style.ts';
import type { SafeValue, StyleText } from './types.ts';
import { streamWriter, treeWriter } from './writer.ts';

let seed = 11;
const pick = (n: number): number => {
  seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
  return (seed >>> 8) % n;
};
const one = <T>(xs: readonly T[]): T => xs[pick(xs.length)]!;

const TAIL_PARTS = [
  '--_ff:var(--mermaid-fontFamily,"Recursive Variable", arial, sans-serif)',
  '--_a:var(--mermaid-a,#fff)',
  ';',
  '"',
  '&',
  '<',
  '>',
  '&quot;',
  '\t',
  '\n',
  '\r',
  '\x00',
  '\x1f',
  '\x7f',
  '￾',
  '😀',
  '\ud800',
  '\udc00',
  'a',
  ' ',
  '"/><script>alert(1)</script>',
];

function tail(): StyleText {
  let t = '';
  for (let i = pick(8); i >= 0; i--) t += one(TAIL_PARTS);
  return t as StyleText;
}

type Decls = Parameters<typeof styleText>[0];
const HEAD_VALUES = ['"A B", arial', 'a&b', '10px', 'x"y', '😀'] as SafeValue[];

function head(): Decls {
  const d: Record<string, SafeValue | number> = {};
  for (let i = pick(4) - 1; i >= 0; i--) {
    const prop = one(['max-width', 'width', '--_x', '--_y']);
    d[prop] = pick(2) ? pick(5000) / 7 : one(HEAD_VALUES);
  }
  if (pick(3) === 0) d['max-width'] = px(pick(4000)) as unknown as SafeValue;
  return d as Decls;
}

const svgTag = (style: string): string => {
  const w = streamWriter();
  w.open('svg', { style: style as StyleText });
  w.close();
  return w.finish();
};
const treeTag = (style: string): string => {
  const w = treeWriter();
  w.open('svg', { style: style as StyleText });
  w.close();
  return w.finish();
};
const reference = (style: string): string => `<svg style="${escAttr(style)}"/>`;

describe('the root style attribute', () => {
  it('is written as escAttr writes the whole value, over generated heads and tails', () => {
    for (let i = 0; i < 3000; i++) {
      const t = tail();
      const decls = head();
      noteRootText({ text: t });
      const value = styleText(decls, t);
      expect(rootStyleAttr(value) ?? escAttr(value)).toBe(escAttr(value));
      expect(svgTag(value)).toBe(reference(value));
      expect(treeTag(value)).toBe(reference(value));
    }
  });

  it('keeps one escaped tail per noted text, whatever head comes before it', () => {
    for (let i = 0; i < 300; i++) {
      const noted = { text: tail() };
      for (let j = 0; j < 5; j++) {
        noteRootText(noted);
        const value = styleText(head(), noted.text);
        expect(svgTag(value)).toBe(reference(value));
      }
      if (noted.text) expect(noted).toEqual({ text: noted.text, attr: escAttr(noted.text) });
    }
  });

  it('gives no escaped form for a value it did not build from a noted text', () => {
    const t = tail() || ('"q"' as StyleText);
    noteRootText({ text: t });
    const value = styleText({ width: 3 }, t);
    // Another style built since, with no tail or a tail not noted: the writer escapes it.
    const plain = styleText({ width: 4 });
    const other = styleText({ width: 5 }, '"z"' as StyleText);
    expect(rootStyleAttr(plain)).toBeUndefined();
    expect(rootStyleAttr(other)).toBeUndefined();
    expect(svgTag(other)).toBe(reference(other));
    // The value built last from the noted text keeps its form, as any equal string would.
    expect(rootStyleAttr(value)).toBe(escAttr(value));
    expect(rootStyleAttr(`${value}`)).toBe(escAttr(value));
    expect(rootStyleAttr(value + ' ')).toBeUndefined();
  });

  it('leaves every other attribute escaped as before, even with the root style value', () => {
    const t = '"x"&<y>' as StyleText;
    noteRootText({ text: t });
    const value = styleText({ width: 1 }, t);
    const w = streamWriter();
    w.open('g', { class: value, 'data-id': value });
    w.close();
    expect(w.finish()).toBe(`<g class="${escAttr(value)}" data-id="${escAttr(value)}"/>`);
  });

  it('is written as before for every theme, with the theme root texts it draws with', async () => {
    const dark = await loadTheme('dark');
    for (const name of THEME_NAMES) {
      const spec = await loadTheme(name);
      for (const vars of [undefined, { fontFamily: '"Q & R", <x>', primaryColor: '#123456' }]) {
        const theme = createTheme(spec, { themeVariables: vars, dark: pick(2) ? dark : undefined });
        theme.font();
        theme.color('mainBkg');
        theme.color('nodeBorder');
        for (const maxWidth of [true, false]) {
          const value = styleText(
            maxWidth ? { 'max-width': px(pick(5000)) } : {},
            theme.rootStyleText()
          );
          expect(svgTag(value)).toBe(reference(value));
        }
      }
    }
  });
});
