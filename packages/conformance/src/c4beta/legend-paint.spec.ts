import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderC4BetaForTest, type C4BetaElement } from '@mermaid-js/diagram-c4/testing';
import { REPO_ROOT } from '../corpus.ts';
import { parseSvg, type SvgElement, type SvgView } from '../svg-tree.ts';
import { c4betaCorpus } from './corpus.ts';

/**
 * A legend swatch and what it describes show the same colours (spec #730 T3): for a tag row whose
 * style is the only one an element, boundary or relation takes (no other styled tag, no style for
 * its kind), the item's fill and outline are the swatch's, over every accepted source of the corpus
 * and the fixtures. A swatch with no fill (`none`) says nothing of the fill, and one with a stroke
 * only is compared on the stroke alone.
 */
const FIXTURES = join(REPO_ROOT, 'e2e/diagrams/c4beta');
const MIN_COMPARED = 100;

/** The first drawn shape of `g` that has a `fill` and a `stroke`. */
function body(g: SvgElement): SvgElement {
  return g.children.find((c) => c.attrs.fill !== undefined && c.attrs.stroke !== undefined)!;
}

function group(tree: SvgView, cls: string, ast: string): SvgElement {
  const [g] = tree.find(
    (n) => n.tag === 'g' && n.attrs.class?.startsWith(cls) === true && n.attrs['data-ast'] === ast
  );
  return g!;
}

function relationLine(tree: SvgView, ast: string): SvgElement {
  return tree.find((n) => n.tag === 'path' && n.attrs['data-ast'] === ast)[0]!;
}

describe('a legend swatch and what it describes', () => {
  it('show the same fill and outline over the corpus and the fixtures', async () => {
    const fixtures = readdirSync(FIXTURES, { recursive: true, encoding: 'utf8' })
      .filter((f) => f.endsWith('.mmd'))
      .map((f) => ({ id: `e2e/${f}`, source: readFileSync(join(FIXTURES, f), 'utf8') }));
    let compared = 0;
    for (const { id, source } of [...c4betaCorpus(), ...fixtures]) {
      const r = await renderC4BetaForTest(source);
      if (r.rejected || !r.layout.legend) continue;
      const tree = parseSvg(r.svg);
      const swatches = tree.find({ class: 'c4-legend-swatch' });
      const { model } = r;
      const styled = new Set(model.styles.map((s) => s.target));
      const only = (tags: readonly string[]): boolean =>
        tags.filter((t) => styled.has(t)).length === 1;
      const none = (tags: readonly string[]): boolean => !tags.some((t) => styled.has(t));
      const bodyOf = (e: C4BetaElement): { fill: string; stroke: string } => {
        const g = e.boundary ? group(tree, 'c4-boundary', e.ast) : group(tree, 'node', e.ast);
        const { fill, stroke } = e.boundary ? g.children[0]!.attrs : body(g).attrs;
        return { fill: fill!, stroke: stroke! };
      };
      r.layout.legend.rows.forEach((row, i) => {
        const { fill, stroke } = swatches[i]!.attrs;
        const same = (label: string, shape: { fill: string; stroke: string }): void => {
          if (fill !== 'none') expect(shape.fill, `${label} fill`).toBe(fill);
          expect(shape.stroke, `${label} stroke`).toBe(stroke);
          compared++;
        };
        if (row.kind) {
          const kinds = new Set(
            r.layout.elements.filter((e) => e.kind === row.kind).map((e) => e.ast)
          );
          for (const e of model.elements)
            if (kinds.has(e.ast) && none(e.tags)) same(`${id} ${e.id}`, bodyOf(e));
        }
        const tag = row.tag?.name;
        if (tag === undefined) return;
        for (const e of model.elements)
          if (e.tags.includes(tag) && only(e.tags) && !styled.has(e.kind))
            same(`${id} ${e.id}`, bodyOf(e));
        for (const rel of model.relations)
          if (rel.tags.includes(tag) && only(rel.tags))
            same(`${id} ${rel.from}->${rel.to}`, {
              fill: fill!,
              stroke: relationLine(tree, rel.ast).attrs.stroke!,
            });
      });
    }
    expect(compared).toBeGreaterThanOrEqual(MIN_COMPARED);
  }, 120_000);
});
