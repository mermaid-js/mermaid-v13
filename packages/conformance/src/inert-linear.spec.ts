/**
 * R-SEC-2, R-PERF-8, spec #855 (X5): the SVG allow-list scan (`inertProblem`) runs in linear time
 * in the markup's length, even on hostile shapes. A ratio test on CPU time (best of 5): 8 times
 * the input should cost about 8 times as much; quadratic work would cost about 64 times.
 * Each shape also says what the scan answers, so none of them is cut short by an early verdict.
 */
import { SVG_NS, inertProblem, themeStyleSheet, type ThemeRef } from '@mermaid-js/core/svg';
import { describe, expect, it } from 'vitest';
import { linearRatio } from './linear-time.ts';

const OPEN = `<svg xmlns="${SVG_NS}" viewBox="0 0 10 10">`;
const rep = (n: number, s: (i: number) => string): string =>
  Array.from({ length: n }, (_, i) => s(i)).join('');

interface Shape {
  readonly name: string;
  readonly build: (n: number) => string;
  readonly options?: Parameters<typeof inertProblem>[1];
  /** The scan's answer: undefined for inert markup, else the start of its message. */
  readonly answer: string | undefined;
}

/** A theme sheet with `n` custom properties in each scheme, as the writer builds one. */
const sheet = (n: number): string => {
  const vars: Record<string, ThemeRef> = {};
  for (let i = 0; i < n; i++) vars[`--v${i}`] = 'var(--mermaid-x)' as ThemeRef;
  return themeStyleSheet('s', vars, vars);
};

const SHAPES: readonly Shape[] = [
  {
    name: 'many siblings',
    build: (n) => OPEN + rep(n, () => '<g/>') + '</svg>',
    answer: undefined,
  },
  {
    name: 'deep nesting',
    build: (n) => OPEN + '<g>'.repeat(n) + '</g>'.repeat(n) + '</svg>',
    answer: undefined,
  },
  {
    name: 'many attributes across elements',
    build: (n) => OPEN + rep(n, (i) => `<rect x="${i}" y="1" width="2" height="3"/>`) + '</svg>',
    answer: undefined,
  },
  {
    name: 'one long style attribute',
    build: (n) => OPEN + `<rect style="${'fill:red;'.repeat(n)}"/></svg>`,
    answer: undefined,
  },
  {
    name: 'one long transform and path',
    build: (n) =>
      OPEN + `<g transform="${'translate(1) '.repeat(n)}"/><path d="${'M0 0 '.repeat(n)}"/></svg>`,
    answer: undefined,
  },
  {
    name: 'long text with entities',
    build: (n) => OPEN + `<text>${'a &amp; b &#65; '.repeat(n)}</text></svg>`,
    answer: undefined,
  },
  {
    name: 'many user-space gradients',
    build: (n) =>
      OPEN +
      '<defs>' +
      rep(
        n,
        (i) =>
          `<linearGradient id="s-g-${i.toString(36)}" gradientUnits="userSpaceOnUse" x1="0" x2="9" y1="1" y2="1"><stop offset="0"/><stop offset="1"/></linearGradient>`
      ) +
      '</defs></svg>',
    answer: undefined,
  },
  {
    name: 'a long theme style sheet',
    build: (n) => OPEN + `<style>${sheet(n)}</style></svg>`,
    options: { themeStyle: true },
    answer: undefined,
  },
  {
    name: 'embedded roots, each with its own scope',
    build: (n) => OPEN + rep(n, () => `<svg xmlns="${SVG_NS}"><g/></svg>`) + '</svg>',
    answer: undefined,
  },
  {
    name: 'a tag name that never ends',
    build: (n) => OPEN + '<' + 'g'.repeat(n),
    answer: 'element <',
  },
  {
    name: 'an attribute value that never ends',
    build: (n) => OPEN + '<g a="' + 'x'.repeat(n),
    answer: 'unterminated',
  },
  {
    name: 'whitespace inside a tag that never ends',
    build: (n) => OPEN + '<g' + ' '.repeat(n),
    answer: 'malformed',
  },
  {
    name: 'a bad ampersand after a long text',
    build: (n) => OPEN + '<text>' + 'a'.repeat(n) + ' & </text></svg>',
    answer: 'unescaped "&"',
  },
  {
    name: 'many ampersands',
    build: (n) => OPEN + '<text>' + '&amp;'.repeat(n) + '&</text></svg>',
    answer: 'unescaped "&"',
  },
  {
    name: 'a style element that never closes',
    build: (n) => OPEN + '<style>' + ':root{--a:red}'.repeat(n),
    options: { themeStyle: true },
    answer: 'unclosed <style>',
  },
];

describe('the allow-list scan runs in linear time', () => {
  it.each(SHAPES)('$name', ({ build, options, answer }) => {
    const small = build(1_000);
    const large = build(8_000);
    const got = inertProblem(small, options);
    if (answer === undefined) expect(got).toBeUndefined();
    else expect(got?.startsWith(answer)).toBe(true);
    const ratio = linearRatio(
      () => inertProblem(small, options),
      () => inertProblem(large, options)
    );
    expect(ratio).toBeLessThan(24);
  });
});
