import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { composite, contrastRatio, parseColor, THEME_NAMES } from '@mermaid-js/core/theme';
import { renderC4BetaForTest, type C4BetaElement } from '@mermaid-js/diagram-c4/testing';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../corpus.ts';
import { parseSvg, type SvgElement } from '../svg-tree.ts';
import { c4betaSources } from './corpus.ts';

/**
 * The text of a c4-beta element or boundary reads on its own fill (spec #730 T2, D592): over every
 * probe, grammar document and fixture, in all eleven themes, an item whose author gave no `color`
 * (in a style for its kind or for any of its tags) has text at WCAG 2.1 success criterion 1.4.3's
 * 4.5:1 or better against its fill (a translucent one over the page), or the page's `background`
 * when it has none. An author's own
 * `color` is the author's choice and is not measured; neither is a fill that is not a colour core
 * can read.
 */
const FIXTURES = join(REPO_ROOT, 'e2e/diagrams/c4beta');
const TEXT_CONTRAST = 4.5;
const MIN_MEASURED = 500;

/** The root's `--_alias:var(--mermaid-name,fallback)` declarations, by alias. */
function aliases(svg: string): ReadonlyMap<string, string> {
  const style = /<svg [^>]*?style="([^"]*)"/.exec(svg)![1]!;
  return new Map([...style.matchAll(/--_(\w+):([^;]+)(?:;|$)/g)].map(([, k, v]) => [k!, v!]));
}

/** A paint as a colour: a literal, or an alias resolved through the root's declarations. */
function resolve(paint: string, map: ReadonlyMap<string, string>, depth = 0): string | undefined {
  const ref = /^var\((--[\w-]+)(?:,(.*))?\)$/.exec(paint.trim());
  if (!ref || depth > 8) return paint;
  const own = /^--_(\w+)$/.exec(ref[1]!);
  const next = own ? map.get(own[1]!) : ref[2];
  return next === undefined ? undefined : resolve(next, map, depth + 1);
}

/** The first child of `g` with a `fill` and a `stroke`: the shape's body. */
const body = (g: SvgElement): SvgElement | undefined =>
  g.children.find((c) => c.attrs.fill !== undefined && c.attrs.stroke !== undefined);

/** The `fill` of the first text of `g` whose class starts with `c4-`. */
function inkOf(g: SvgElement): string | undefined {
  const stack = [...g.children];
  while (stack.length > 0) {
    const n = stack.shift()!;
    if (n.tag === 'text' && n.attrs.fill !== undefined) return n.attrs.fill;
    stack.unshift(...n.children);
  }
  return undefined;
}

describe('text on its own fill', () => {
  it('reaches 4.5:1 for every item the author gave no `color`, in all eleven themes', async () => {
    const sources = [
      ...c4betaSources(),
      ...readdirSync(FIXTURES, { recursive: true, encoding: 'utf8' })
        .filter((f) => f.endsWith('.mmd'))
        .map((f) => ({ id: `e2e/${f}`, source: readFileSync(join(FIXTURES, f), 'utf8') })),
    ];
    const failures: string[] = [];
    const skipped = new Set<string>();
    let measured = 0;
    for (const { id, source } of sources) {
      for (const theme of THEME_NAMES) {
        const r = await renderC4BetaForTest(source, { config: { theme } });
        if (r.rejected) continue;
        const map = aliases(r.svg);
        const tree = parseSvg(r.svg);
        const page = parseColor(resolve('var(--_bg)', map) ?? '#ffffff')!;
        const coloured = new Set(
          r.model.styles
            .filter((s) => s.entries.some((e) => e.key === 'color'))
            .map((s) => s.target)
        );
        const authored = (e: C4BetaElement): boolean =>
          coloured.has(e.kind) || e.tags.some((t) => coloured.has(t));
        for (const e of r.model.elements) {
          if (authored(e)) {
            skipped.add(id);
            continue;
          }
          const [g] = tree.find(
            (n) =>
              n.tag === 'g' &&
              /^(node|c4-boundary)\b/.test(n.attrs.class ?? '') &&
              n.attrs['data-ast'] === e.ast
          );
          const shape = g && (e.boundary ? g.children[0] : body(g));
          const ink = g && inkOf(g);
          if (!shape || !ink) continue;
          const fillPaint = shape.attrs.fill === 'none' ? undefined : shape.attrs.fill;
          const given = fillPaint === undefined ? page : parseColor(resolve(fillPaint, map) ?? '');
          const fill = given && given[3] < 1 ? composite(given, page) : given;
          const text = parseColor(resolve(ink, map) ?? '');
          if (!fill || !text) {
            skipped.add(id);
            continue;
          }
          measured++;
          const ratio = contrastRatio(text, fill);
          if (ratio < TEXT_CONTRAST) failures.push(`${id} ${theme} ${e.id}: ${ratio.toFixed(2)}`);
        }
      }
    }
    expect(failures).toEqual([]);
    expect(measured).toBeGreaterThanOrEqual(MIN_MEASURED);
    console.info(
      `text-contrast: ${measured} measured; author colour or unreadable fill in ${[...skipped].length} sources`
    );
  }, 600_000);
});
