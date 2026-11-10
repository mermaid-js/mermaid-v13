import { beforeAll, describe, expect, it } from 'vitest';
import type { OutlineRole } from '@mermaid-js/core/svg';
import { outlineFixture } from '@mermaid-js/core/svg/testing';
import { renderC4ForTest } from '@mermaid-js/diagram-c4/testing';
import type { CorpusItem } from '../types.ts';
import { c4Corpus } from './corpus.ts';

/**
 * C4's outline hook (D301, D302) over its e2e fixtures, through the plugin's seam: the checks
 * `outline-identity.spec.ts` and `outline-roles.spec.ts` run for each `OUTLINE_CASES` type,
 * here for C4 alone. Those specs render through `createMermaid()`, which has no C4 row until the
 * manifest (#542), so C4's `src/c4/outline.ts` case lands with it (GAPS T4); until then this
 * spec holds the same properties:
 *
 * - a drawer that declines every outline leaves the bytes as they are without one;
 * - with T0's fixture drawer, C4's elements reach it as `node` (the outline, the person's head)
 *   and `divider` (the cylinder's and the queue's rim, `fr-rect`'s frame lines); everything
 *   else stays plain, as v12 sketched elements only (D301): boundary frames, relation lines,
 *   arrowheads and text.
 */
const ROLES: readonly OutlineRole[] = ['divider', 'node'];
const THEMES = ['default', 'neo'] as const;

/** What the fixture drew: `<g class="outline-…">` around its one path. */
const OUTLINED = /<g class="outline-[a-z]+"><path [^>]*\/><\/g>/g;
/** What C4 keeps plain (D301). */
const PLAIN = [
  /<g class="c4-boundary[^"]*"[^>]*><rect [^>]*\/>/g,
  /<path class="c4-rel [^>]*\/>/g,
  /<path class="marker"[^>]*\/>/g,
];
const SHAPE = /<(rect|circle|ellipse|polygon|line|path)\b[^>]*>/;
const count = (s: string, re: RegExp): number => s.match(re)?.length ?? 0;

let corpus: CorpusItem[];
beforeAll(async () => {
  corpus = (await c4Corpus()).filter((i) => i.id.startsWith('e2e/'));
});

describe('c4 draws its elements through the outline hook (D301, D302)', () => {
  it('changes no byte while the drawer declines', async () => {
    let compared = 0;
    for (const theme of THEMES)
      for (const item of corpus) {
        const config = { theme };
        const plain = await renderC4ForTest(item.source, { config });
        const declined = await renderC4ForTest(item.source, { config, outline: () => false });
        expect(declined.svg, item.id).toBe(plain.svg);
        compared++;
      }
    expect(compared).toBe(2 * 46);
  });

  it('sends each element outline to the drawer as node or divider, and nothing else', async () => {
    const roles = new Set<OutlineRole>();
    let compared = 0;
    for (const theme of THEMES)
      for (const item of corpus) {
        const config = { theme };
        const plain = await renderC4ForTest(item.source, { config });
        const drawn = await renderC4ForTest(item.source, {
          config,
          outline: (role, tag, attrs, sink) => {
            roles.add(role);
            expect(String(attrs.class ?? ''), item.id).not.toMatch(/\bmarker\b|c4-rel/);
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
    expect(compared).toBe(2 * 46);
    expect([...roles].sort()).toEqual([...ROLES]);
  });
});
