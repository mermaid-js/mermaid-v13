import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Attrs, OutlineRole, OutlineTag } from '@mermaid-js/core/svg';
import { outlineFixture } from '@mermaid-js/core/svg/testing';
import { createMermaid, MermaidError, type ExtensionPlugin } from 'mermaid';
import { REPO_ROOT, corpusFromDir } from './index.ts';
import { OUTLINE_CASES } from './outline-cases.ts';
import { withoutEmbedded } from './svg-tree.ts';

/**
 * Flowchart, class, state and ER draw their outlines through `w.outline` with a role (D302,
 * #340), kanban its columns and cards (D379, #459), and venn its circles and filled overlaps
 * (D319, #501); each type's case is its `src/<type>/outline.ts`. With T0's fixture drawer over
 * each type's corpus: every role the type has reaches the drawer, every shape does (only
 * arrowheads, kanban's priority bar, venn's unfilled overlaps and debug shapes, the label boxes
 * of the types that still draw their own, and text stay plain), and no arrowhead or text does.
 * An edge label drawn by the shared tag reaches the drawer as role `label` (D630).
 */

interface Call {
  readonly role: OutlineRole;
  readonly tag: OutlineTag;
  readonly attrs: Attrs;
}

/** The outlining types that name their roles (`OUTLINE_CASES`, `src/<type>/outline.ts`). */
const TYPES = [...OUTLINE_CASES].flatMap(([type, { dirs, roles, plain }]) =>
  roles === undefined ? [] : [{ type, dirs, roles, plain: plain ?? [] }]
);

/** `<g class="outline-…">` around its one path: what the fixture drew. */
const OUTLINED = /<g class="outline-[a-z]+"><path [^>]*\/><\/g>/g;
/** What stays plain: arrowheads (a `marker` class on the leaf). */
const PLAIN = [/<(?:path|circle) class="marker[^"]*"[^>]*\/>/g];
const SHAPE = /<(rect|circle|ellipse|polygon|line|path)\b[^>]*>/;
const count = (s: string, re: RegExp): number => s.match(re)?.length ?? 0;

/** ER's ends: `<g class="marker …">` around plain leaves only, as each end's group. */
const END = '<g class="marker ';
function ends(svg: string): string[] {
  return svg
    .split(END)
    .slice(1)
    .map((s) => s.slice(0, s.indexOf('</g>')));
}
const withoutEnds = (svg: string): string =>
  svg
    .split(END)
    .map((s, i) => (i === 0 ? s : s.slice(s.indexOf('</g>') + 4)))
    .join('');

async function api(...extensions: ExtensionPlugin[]) {
  const m = createMermaid();
  m.initialize({ deterministic: true });
  await m.registerExternalDiagrams(extensions);
  return m;
}

describe('the outlining types draw through the hook (D302, #340, #459, #501)', () => {
  it('has outlining types with roles', () => {
    expect(TYPES.length).toBeGreaterThan(0);
  });

  for (const { type, dirs, roles, plain: own } of TYPES) {
    it(`${type}: each role reaches the drawer, and no arrowhead, label or text does`, async () => {
      const calls: Call[] = [];
      const recording: ExtensionPlugin = {
        id: 'fixture-outline',
        outline: {
          active: () => true,
          draw: (role, tag, attrs, sink) => {
            calls.push({ role, tag, attrs });
            return outlineFixture.draw(role, tag, attrs, sink);
          },
        },
      };
      const plain = await api();
      const drawn = await api(recording);
      let compared = 0;
      for (const dir of dirs)
        for await (const item of corpusFromDir(join(REPO_ROOT, 'e2e/diagrams', dir), dir)) {
          let expected: string;
          try {
            await plain.prepare(item.source, { id: 'm' });
            // An embedded diagram (ADR-15) draws in its own type's way.
            expected = withoutEmbedded(plain.renderSync(item.source, { id: 'm' }).svg);
          } catch (e) {
            if (e instanceof MermaidError) continue;
            throw e;
          }
          await drawn.prepare(item.source, { id: 'm' });
          const svg = withoutEmbedded(drawn.renderSync(item.source, { id: 'm' }).svg);
          // Arrowheads and text are written as before.
          for (const re of [...PLAIN, ...own, /<text\b/g, /<tspan\b/g])
            expect(count(svg, re), `${item.id}: ${String(re)}`).toBe(count(expected, re));
          expect(ends(svg), item.id).toEqual(ends(expected));
          // Every other shape went to the drawer.
          let rest = withoutEnds(svg).replace(OUTLINED, '');
          for (const re of [...PLAIN, ...own]) rest = rest.replace(re, '');
          expect(SHAPE.exec(rest)?.[0], item.id).toBeUndefined();
          compared++;
        }
      expect(compared).toBeGreaterThan(50);
      expect([...new Set(calls.map((c) => c.role))].sort()).toEqual([...roles].sort());
      for (const c of calls) expect(String(c.attrs.class ?? '')).not.toMatch(/\bmarker\b/);
    }, 300_000);
  }
});
