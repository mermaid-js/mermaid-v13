import {
  ALLOWED_ATTRS,
  ALLOWED_TAGS,
  assertInert,
  streamWriter,
  treeWriter,
  writeFragment,
} from '@mermaid-js/core/svg';
import { describe, expect, it, vi } from 'vitest';
import { corpus, extra, katex } from '../scripts/corpus.ts';
import type { InlineBox, SvgFragment } from '@mermaid-js/core/text';
import { MathError, typeset } from './engine.ts';

const EX = 8;

function document(box: InlineBox, backing: 'stream' | 'tree' = 'stream'): string {
  const w = backing === 'stream' ? streamWriter() : treeWriter();
  w.open('svg', {
    xmlns: 'http://www.w3.org/2000/svg',
    viewBox: [0, 0, box.width, box.height],
  });
  writeFragment(w, box.node);
  w.close();
  return w.finish();
}

function leaves(node: SvgFragment): SvgFragment[] {
  const kids = (node.children ?? []).filter((c): c is SvgFragment => typeof c !== 'string');
  return kids.length ? kids.flatMap(leaves) : [node];
}

const coordinates = (d: string) => [...d.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));

describe('typeset', () => {
  it('finds the whole corpus: 16 katex spans and 5 sequence strings', () => {
    expect(katex).toHaveLength(16);
    expect(corpus).toHaveLength(21);
  });

  it.each(corpus.map((tex) => [tex]))('typesets %s into a box of plain paths', (tex) => {
    const box = typeset(tex, { ex: EX });
    expect(box.width).toBeGreaterThan(0);
    expect(box.height).toBeGreaterThan(0);
    expect(box.baseline).toBeGreaterThanOrEqual(0);
    expect(box.baseline).toBeLessThanOrEqual(box.height);
    expect(box.node.tag).toBe('g');
    const drawn = leaves(box.node);
    expect(drawn.length).toBeGreaterThan(0);
    for (const leaf of drawn) {
      expect(leaf.tag).toBe('path');
      expect(Object.keys(leaf.attrs ?? {})).toEqual(['d']);
    }
  });

  it.each([...corpus, ...extra].map((tex) => [tex]))(
    'output of %s passes the R-SEC-2 allow-list, the same through both writer backings',
    (tex) => {
      const box = typeset(tex, { ex: EX });
      const svg = document(box);
      expect(document(box, 'tree')).toBe(svg);
      assertInert(svg);
      for (const leaf of leaves(box.node)) {
        expect(ALLOWED_TAGS.has(leaf.tag)).toBe(true);
        for (const name of Object.keys(leaf.attrs ?? {}))
          expect(ALLOWED_ATTRS.has(name)).toBe(true);
      }
      expect(svg.match(/<svg/g)).toHaveLength(1);
      expect(svg).not.toMatch(/<(use|defs|foreignObject|style|image|a)\b|style=|data-|stroke/);
    }
  );

  it.each([...corpus, ...extra].map((tex) => [tex]))(
    'draws %s inside its box: transforms applied, extenders clipped',
    (tex) => {
      const box = typeset(tex, { ex: EX });
      // Glyph outlines may overhang their advance box a little (italic letters); 1 px is plenty.
      const slack = 1;
      for (const leaf of leaves(box.node)) {
        const values = coordinates(String(leaf.attrs?.d));
        const xs = values.filter((_, i) => i % 2 === 0);
        const ys = values.filter((_, i) => i % 2 === 1);
        if (String(leaf.attrs?.d).includes('A')) continue; // arcs carry radii and flags, not points
        expect(Math.min(...xs)).toBeGreaterThanOrEqual(-slack);
        expect(Math.max(...xs)).toBeLessThanOrEqual(box.width + slack);
        expect(Math.min(...ys)).toBeGreaterThanOrEqual(-slack);
        expect(Math.max(...ys)).toBeLessThanOrEqual(box.height + slack);
      }
    }
  );

  it("sizes in MathJax's own ex: x^2 is 2.282ex × 2.025ex, 0.025ex below the baseline", () => {
    // MathJax's SVG for `x^2` says width="2.282ex" height="2.025ex" vertical-align: -0.025ex.
    for (const ex of [4, 8, 10]) {
      const box = typeset('x^2', { ex });
      expect(box.width).toBeCloseTo(2.282 * ex, 2);
      expect(box.height).toBeCloseTo(2.025 * ex, 2);
      expect(box.height - box.baseline).toBeCloseTo(0.025 * ex, 2);
    }
  });

  it('is deterministic: same bytes twice, in any order, and from a fresh engine', async () => {
    const all = [...corpus, ...extra];
    const first = all.map((tex) => document(typeset(tex, { ex: EX })));
    const reversed = [...all]
      .reverse()
      .map((tex) => document(typeset(tex, { ex: EX })))
      .reverse();
    expect(reversed).toEqual(first);
    vi.resetModules();
    const fresh = await import('./engine.ts');
    expect(fresh.typeset).not.toBe(typeset);
    expect(all.map((tex) => document(fresh.typeset(tex, { ex: EX })))).toEqual(first);
  });

  it('turns strokes into filled outlines, so a box only ever inherits its fill', () => {
    for (const tex of ['\\cancel{x}', '\\boxed{x}', '\\phase{x}', '\\enclose{circle}{x}']) {
      const plain = leaves(
        typeset(tex.replace(/\\(cancel|boxed|phase)|\\enclose\{circle\}/, ''), { ex: EX }).node
      );
      const drawn = leaves(typeset(tex, { ex: EX }).node);
      expect(drawn.length).toBeGreaterThan(plain.length);
      for (const leaf of drawn) expect(Object.keys(leaf.attrs ?? {})).toEqual(['d']);
    }
  });

  it('keeps a colour the TeX names, as a checked fill', () => {
    // As in LaTeX and KaTeX, \color switches the colour until its group ends.
    const [x, plus, y] = leaves(typeset('{\\color{red}x}+y', { ex: EX }).node);
    expect(x?.attrs?.fill).toBe('red');
    expect(plus?.attrs?.fill).toBeUndefined();
    expect(y?.attrs?.fill).toBeUndefined();
  });

  it("knows v12 KaTeX's texvc names", () => {
    const same = (a: string, b: string) =>
      expect(document(typeset(a, { ex: EX }))).toBe(document(typeset(b, { ex: EX })));
    same('\\Alpha\\Reals\\empty', '\\mathrm{A}\\mathbb{R}\\emptyset');
    same('\\phase{x}', '\\enclose{phasorangle}{x}');
  });

  it.each([
    ['\\frac{a}', 'Missing argument'],
    ['\\nosuchmacro', 'Undefined control sequence \\nosuchmacro'],
    // No state between formulas: definitions are not available at all.
    ['\\def\\x{1}\\x', 'Undefined control sequence \\def'],
    ['\\newcommand{\\x}{1}', 'Undefined control sequence \\newcommand'],
    // Links, classes, styles and raw HTML are not loaded.
    ['\\href{javascript:alert(1)}{x}', 'Undefined control sequence \\href'],
    ['\\style{color:red}{x}', 'Undefined control sequence \\style'],
    ['\\class{c}{x}', 'Undefined control sequence \\class'],
    // An equation tag makes MathJax lay out a full-width table; there is no width to fill.
    ['\\tag{1} x', 'MathJax gave no single SVG'],
  ])('refuses %s with a MathError', (tex, message) => {
    expect(() => typeset(tex, { ex: EX })).toThrow(MathError);
    expect(() => typeset(tex, { ex: EX })).toThrow(message);
  });

  it('refuses a colour outside the allow-list', () => {
    expect(() => typeset('\\color{url(#x)}{x}', { ex: EX })).toThrow(MathError);
  });

  // A thrown colour would show the whole formula as TeX, so a word CSS does not know passes (D690).
  it('keeps a formula whose colour is misspelt', () => {
    expect(typeset('\\color{redd}{x}', { ex: EX }).width).toBeGreaterThan(0);
  });

  it('still typesets after an error', () => {
    expect(() => typeset('\\frac{a}', { ex: EX })).toThrow(MathError);
    expect(typeset('x', { ex: EX }).width).toBeGreaterThan(0);
  });

  it("sizes characters the TeX font lacks with the caller's measure, as text in px", () => {
    // MathJax's own guess is 1 math em per CJK character: 8 / 0.442 = 18.1 px at ex = 8.
    const guessed = typeset('\\text{日本}', { ex: EX, em: 16 });
    const measured = typeset('\\text{日本}', { ex: EX, em: 16, measure: () => 50 });
    expect(guessed.width).toBeCloseTo(36.2, 1);
    expect(measured.width).toBeCloseTo(50, 0);
    const text = leaves(measured.node).find((l) => l.tag === 'text');
    expect(text?.children).toEqual(['日本']);
    // Each call measures afresh: an earlier call's widths are not reused.
    expect(typeset('\\text{日本}', { ex: EX, em: 16 }).width).toBeCloseTo(36.2, 1);
  });

  it('passes italic and bold to the measure', () => {
    const seen: [string, boolean, boolean][] = [];
    typeset('\\textbf{日}', { ex: EX, em: 16, measure: (t, i, b) => (seen.push([t, i, b]), 10) });
    expect(seen).toEqual([['日', false, true]]);
  });

  it('needs a positive ex', () => {
    expect(() => typeset('x', { ex: 0 })).toThrow(RangeError);
    expect(() => typeset('x', { ex: Number.NaN })).toThrow(RangeError);
  });
});
