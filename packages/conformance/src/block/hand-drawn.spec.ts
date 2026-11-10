import { beforeAll, describe, expect, it } from 'vitest';
import type { OutlineRole } from '@mermaid-js/core/svg';
import { outlineFixture } from '@mermaid-js/core/svg/testing';
import { renderBlockForTest } from '@mermaid-js/diagram-block/testing';
import type { CorpusItem } from '../types.ts';
import { blockCorpus } from './corpus.ts';

/**
 * Block's outline hook (D302, D447) over its e2e fixtures, through the plugin's seam: the
 * checks `outline-identity.spec.ts` and `outline-roles.spec.ts` run for each `OUTLINE_CASES`
 * type, here for block alone. Those specs render through `createMermaid()`, which has no block
 * row until the manifest (#558), so block's `src/block/outline.ts` case lands with it (GAPS
 * #556); until then this spec holds the same properties:
 *
 * - a drawer that declines every outline leaves the bytes as they are without one;
 * - with T0's fixture drawer, block's leaves reach it as `node` (the outline) and `divider`
 *   (the subroutine's frames, the cylinder's rim, the double circle's inner ring); everything
 *   else stays plain, as v12 sketched only leaves (D447): composites, block arrows, edges,
 *   arrowheads, edge-label backgrounds and text.
 */
const ROLES: readonly OutlineRole[] = ['divider', 'node'];
const THEMES = ['default', 'neo'] as const;

/** What the fixture drew: `<g class="outline-…">` around its one path. */
const OUTLINED = /<g class="outline-[a-z]+"><path [^>]*\/><\/g>/g;
/** What block keeps plain (D447), besides the shared arrowheads and label backgrounds. */
const PLAIN = [
  /<rect class="basic cluster composite label-container"[^>]*\/>/g,
  /<polygon class="label-container block-arrow"[^>]*\/>/g,
  /<path class="edge-thickness-[^>]*\/>/g,
  /<(?:path|circle) class="marker[^"]*"[^>]*\/>/g,
  /<g class="edgeLabel"[^>]*><rect [^>]*\/>/g,
];
const SHAPE = /<(rect|circle|ellipse|polygon|line|path)\b[^>]*>/;
const count = (s: string, re: RegExp): number => s.match(re)?.length ?? 0;

let corpus: CorpusItem[];
beforeAll(async () => {
  corpus = (await blockCorpus()).filter((i) => i.id.startsWith('e2e/'));
});

describe('block draws its leaves through the outline hook (D302, D447)', () => {
  it('changes no byte while the drawer declines', async () => {
    let compared = 0;
    for (const theme of THEMES)
      for (const item of corpus) {
        const config = { theme };
        const plain = await renderBlockForTest(item.source, { config });
        const declined = await renderBlockForTest(item.source, { config, outline: () => false });
        expect(declined.svg, item.id).toBe(plain.svg);
        compared++;
      }
    expect(compared).toBe(2 * 77);
  });

  it('sends each leaf outline to the drawer as node or divider, and nothing else', async () => {
    const roles = new Set<OutlineRole>();
    let compared = 0;
    for (const theme of THEMES)
      for (const item of corpus) {
        const config = { theme };
        const plain = await renderBlockForTest(item.source, { config });
        const drawn = await renderBlockForTest(item.source, {
          config,
          outline: (role, tag, attrs, sink) => {
            roles.add(role);
            expect(String(attrs.class ?? ''), item.id).not.toMatch(/\bmarker\b|composite/);
            return outlineFixture.draw(role, tag, attrs, sink);
          },
        });
        for (const re of [...PLAIN, /<text\b/g, /<tspan\b/g])
          expect(count(drawn.svg, re), `${item.id}: ${String(re)}`).toBe(count(plain.svg, re));
        let rest = drawn.svg.replace(OUTLINED, '');
        for (const re of PLAIN) rest = rest.replace(re, '');
        expect(SHAPE.exec(rest)?.[0], item.id).toBeUndefined();
        compared++;
      }
    expect(compared).toBe(2 * 77);
    expect([...roles].sort()).toEqual([...ROLES]);
  });
});
