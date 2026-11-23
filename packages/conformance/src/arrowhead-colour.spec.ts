/**
 * #1161 (spec #1163 B6, D680): an arrowhead is filled in its line's colour in every built-in
 * theme, in flowchart, state, block and agentflow, which all paint heads with `arrowheadColor`.
 * Each fixture is rendered through `render()` with literal colours, and every head is compared
 * with the stroke its line is drawn in: the line's own or the one it inherits from its group.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { THEME_NAMES } from '@mermaid-js/core/theme';
import { createMermaid, type InitializeConfig } from 'mermaid';
import { describe, expect, it } from 'vitest';
import { parseSvg, type SvgElement, type SvgView } from './svg-tree.ts';

const DIAGRAMS = join(import.meta.dirname, '../../../e2e/diagrams');

/** One fixture per type. */
const FIXTURES = {
  flowchart: 'flowchart/visual-check/6369-edge-color-should-affect-arrow-head.mmd',
  state: 'state-diagram-v2/baseline/transitions/lr.mmd',
  block: 'block/baseline/edge-labels/tags.mmd',
  agentflow: 'agentflow/baseline/edge-labels/tags.mmd',
} as const;
type Kind = keyof typeof FIXTURES;
const KINDS = Object.keys(FIXTURES) as Kind[];
/** The `linkStyle` stroke of the fixtures whose type has one. */
const LINK_STYLE: Partial<Record<Kind, string>> = { flowchart: '#D50000', agentflow: '#d6336c' };

interface Head {
  /** The head's fill. */
  readonly fill: string | undefined;
  /** The stroke its line is drawn in. */
  readonly stroke: string | undefined;
}

/** The stroke `n` is drawn in: its own, or the nearest ancestor's. */
function strokeOf(tree: SvgView, n: SvgElement): string | undefined {
  for (let p: SvgElement | undefined = n; p; p = p.parent) {
    const s = tree.getAttr(p, 'stroke');
    if (s !== undefined) return s;
  }
  return undefined;
}

/** Every arrowhead with the line it ends: the nearest earlier sibling that is not a head. */
function heads(tree: SvgView): Head[] {
  return tree.find({ class: 'marker' }).map((m) => {
    const siblings = m.parent!.children.filter((c) => c.tag !== undefined);
    const line = siblings
      .slice(0, siblings.indexOf(m))
      .reverse()
      .find((c) => !(tree.getAttr(c, 'class') ?? '').split(' ').includes('marker'));
    expect(line, 'a head follows its line').toBeDefined();
    return { fill: tree.getAttr(m, 'fill'), stroke: strokeOf(tree, line!) };
  });
}

async function draw(kind: Kind, config: InitializeConfig): Promise<Head[]> {
  const m = createMermaid();
  m.initialize({ deterministic: true, output: { cssVariables: false }, ...config });
  const text = readFileSync(join(DIAGRAMS, FIXTURES[kind]), 'utf8');
  return heads(parseSvg((await m.render('mermaid-0', text)).svg));
}

describe('arrowheads take their line colour (#1161, D680)', () => {
  describe.each(KINDS)('%s', (kind) => {
    it.each(THEME_NAMES)('fills every head in its line stroke under %s', async (theme) => {
      const found = await draw(kind, { theme });
      expect(found.length).toBeGreaterThan(0);
      for (const h of found) expect(h.fill).toBe(h.stroke);
      // The fixture covers a `linkStyle` stroke where the type has one.
      const styled = LINK_STYLE[kind];
      if (styled) expect(found.filter((h) => h.stroke === styled).length).toBeGreaterThan(0);
    });

    it.each(['default', 'forest', 'neutral'] as const)(
      "keeps an author's arrowheadColor on unstyled heads under %s",
      async (theme) => {
        const found = await draw(kind, { theme, themeVariables: { arrowheadColor: '#123456' } });
        expect(found.length).toBeGreaterThan(0);
        const styled = LINK_STYLE[kind];
        for (const h of found) expect(h.fill).toBe(h.stroke === styled ? styled : '#123456');
      }
    );
  });
});
