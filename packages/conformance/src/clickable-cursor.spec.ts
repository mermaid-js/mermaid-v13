import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createMermaid } from 'mermaid';
import { REPO_ROOT } from './index.ts';
import { parseSvg } from './svg-tree.ts';

/**
 * A clickable node shows a pointer (#355, D605). v12 set it with stylesheet rules; v13 writes
 * `cursor="pointer"` on the element, so it holds for every `securityLevel`, as v12's did. It
 * is on every node or task whose classes include `clickable` (flowchart and class nodes, gantt
 * bars and task text) and nowhere else. A clickable subgraph gets none: v12's rule was
 * `.node.clickable`, which a subgraph does not match.
 */

const NOW = new Date(2024, 0, 3, 12).getTime();
const FIXTURES = [
  'flowchart/baseline/interactions/clickable',
  'flowchart/nightly-check/clickable-callback',
  'class-diagram/baseline/classes/clickable',
  'class-diagram/nightly-check/clickable-callback',
  'gantt/baseline/features/links',
];

async function svgOf(name: string, securityLevel: string): Promise<string> {
  const m = createMermaid();
  m.initialize({ securityLevel } as Parameters<typeof m.initialize>[0]);
  const text = readFileSync(join(REPO_ROOT, 'e2e/diagrams', `${name}.mmd`), 'utf8');
  return (await m.render('d', text, { now: NOW })).svg;
}

describe('pointer cursor on clickable elements', () => {
  for (const name of FIXTURES) {
    for (const level of ['strict', 'loose']) {
      it(`${name} at securityLevel ${level}`, async () => {
        const nodes = parseSvg(await svgOf(name, level)).find(() => true);
        const clickable = nodes.filter((n) =>
          (n.attrs.class ?? '').split(' ').includes('clickable')
        );
        expect(clickable.length).toBeGreaterThan(0);
        for (const n of clickable) expect(n.attrs.cursor).toBe('pointer');
        expect(nodes.filter((n) => n.attrs.cursor !== undefined)).toEqual(clickable);
      });
    }
  }
});
