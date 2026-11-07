import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Attrs, OutlineRole, OutlineTag } from '@mermaid-js/core/svg';
import { outlineFixture } from '@mermaid-js/core/svg/testing';
import { createMermaid, MermaidError, type ExtensionPlugin } from 'mermaid';
import { REPO_ROOT, corpusFromDir } from './index.ts';

/**
 * Flowchart, class, state and ER draw their outlines through `w.outline` with a role (D302,
 * #340), and kanban its columns and cards (D379, #459). With T0's fixture drawer over each
 * type's corpus: every role the type has reaches the drawer, every shape does (only arrowheads,
 * label backgrounds, kanban's priority bar and text stay plain), and no arrowhead or text does.
 */

interface Call {
  readonly role: OutlineRole;
  readonly tag: OutlineTag;
  readonly attrs: Attrs;
}

interface TypeCase {
  dirs: string[];
  roles: OutlineRole[];
  /** Shapes the type keeps plain besides `PLAIN`. */
  plain?: RegExp[];
}

const TYPES: Readonly<Record<string, TypeCase>> = {
  flowchart: { dirs: ['flowchart'], roles: ['node', 'part', 'divider', 'mark', 'group', 'edge'] },
  class: { dirs: ['class-diagram'], roles: ['node', 'divider', 'group', 'edge'] },
  state: {
    dirs: ['state-diagram', 'state-diagram-v2'],
    roles: ['node', 'part', 'divider', 'mark', 'group', 'edge'],
  },
  er: { dirs: ['er-diagram'], roles: ['node', 'part', 'divider', 'group', 'edge'] },
  // The priority bar is a vertical line (x1 = x2): a zero-width box, which an outline
  // cannot fill or hachure (as D185's lines), so it stays a plain line, kept under hand-drawn
  // (D379). Every other kanban shape goes to the drawer.
  kanban: {
    dirs: ['kanban'],
    roles: ['group', 'node'],
    plain: [/<line class="kanban-priority" x1="([^"]+)" y1="[^"]+" x2="\1"[^>]*\/>/g],
  },
};

/** `<g class="outline-…">` around its one path: what the fixture drew. */
const OUTLINED = /<g class="outline-[a-z]+"><path [^>]*\/><\/g>/g;
/** What stays plain: arrowheads (a `marker` class on the leaf), label backgrounds. */
const PLAIN = [
  /<(?:path|circle) class="marker[^"]*"[^>]*\/>/g,
  /<g class="edgeLabel"[^>]*><rect [^>]*\/>/g,
];
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

describe('flowchart, class, state, ER and kanban outline through the hook (D302, #340)', () => {
  for (const [type, { dirs, roles, plain: own = [] }] of Object.entries(TYPES)) {
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
            expected = plain.renderSync(item.source, { id: 'm' }).svg;
          } catch (e) {
            if (e instanceof MermaidError) continue;
            throw e;
          }
          await drawn.prepare(item.source, { id: 'm' });
          const svg = drawn.renderSync(item.source, { id: 'm' }).svg;
          // Arrowheads, label backgrounds and text are written as before.
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
