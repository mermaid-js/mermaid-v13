import { describe, expect, it } from 'vitest';
import { createMermaid } from 'mermaid';
import { parseSvg, type SvgElement, type SvgView } from './svg-tree.ts';

/**
 * ER relationship ends against the lines and boxes around them (#124 final review, findings 1
 * and 2), through the public `render()`: a self-loop is long enough for both of its ends and
 * its label, and the ends that meet one side of an entity never overlap.
 */

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

async function render(source: string, theme: 'default' | 'redux' = 'default'): Promise<SvgView> {
  const m = createMermaid();
  m.initialize({ deterministic: true });
  const { svg } = await m.render('mermaid-0', source, { config: { theme } });
  return parseSvg(svg);
}

/** The bounding box of absolute path data (M, L, Q only) or of a circle. */
function boxOf(tree: SvgView, n: SvgElement): Box {
  const num = (name: string) => Number(tree.getAttr(n, name));
  if (tree.tag(n) === 'circle') {
    const r = num('r');
    return { x0: num('cx') - r, y0: num('cy') - r, x1: num('cx') + r, y1: num('cy') + r };
  }
  const v = (tree.getAttr(n, 'd') ?? '').match(/-?\d+(?:\.\d+)?/g)!.map(Number);
  const xs = v.filter((_, i) => i % 2 === 0);
  const ys = v.filter((_, i) => i % 2 === 1);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

const union = (a: Box, b: Box): Box => ({
  x0: Math.min(a.x0, b.x0),
  y0: Math.min(a.y0, b.y0),
  x1: Math.max(a.x1, b.x1),
  y1: Math.max(a.y1, b.y1),
});

const overlap = (a: Box, b: Box): boolean =>
  a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/** Every relationship as its line and its drawn ends (start end first), each end's box. */
function relationships(tree: SvgView): { line: Box; ends: Box[] }[] {
  return tree.find({ class: 'relationshipLine' }).map((g) => {
    const [path, ...marks] = tree.children(g);
    return {
      line: boxOf(tree, path!),
      ends: marks.map((mark) =>
        tree
          .children(mark)
          .map((c) => boxOf(tree, c))
          .reduce(union)
      ),
    };
  });
}

/** The entity's outline in diagram coordinates. */
function entityBox(tree: SvgView, id: string): Box {
  const g = tree.find({ 'data-id': id })[0]!;
  const [, tx, ty] = /translate\(([-\d.]+),([-\d.]+)\)/.exec(tree.getAttr(g, 'transform')!)!;
  const rect = tree.children(g).find((c) => tree.getAttr(c, 'class') === 'outer-path')!;
  const x = Number(tx) + Number(tree.getAttr(rect, 'x'));
  const y = Number(ty) + Number(tree.getAttr(rect, 'y'));
  const w = Number(tree.getAttr(rect, 'width'));
  const h = Number(tree.getAttr(rect, 'height'));
  return { x0: x, y0: y, x1: x + w, y1: y + h };
}

function rectBox(tree: SvgView, n: SvgElement): Box {
  const num = (name: string) => Number(tree.getAttr(n, name));
  return { x0: num('x'), y0: num('y'), x1: num('x') + num('width'), y1: num('y') + num('height') };
}

describe('ER self-relationships', () => {
  const LOOPS = [
    ['zero or more both ends, TB', 'erDiagram\nA }o--o{ A : self'],
    ['zero or more both ends, LR', 'erDiagram\ndirection LR\nA }o--o{ A : self'],
    ['zero or one and one or more', 'erDiagram\nA |o--|{ A : self'],
    ['with attributes', 'erDiagram\nA }o--o{ A : self\nA {\n  int id PK\n  string name\n}'],
  ] as const;

  for (const theme of ['default', 'redux'] as const) {
    for (const [name, source] of LOOPS) {
      it(`keeps both ends on the loop's straight legs, clear of the label (${name}, ${theme})`, async () => {
        const tree = await render(source, theme);
        const { line, ends } = relationships(tree)[0]!;
        const box = entityBox(tree, 'A');
        expect(ends).toHaveLength(2);
        // The loop leaves the right side (TB) or the bottom (LR); its legs turn at the far
        // edge of its bounding box, rounded by up to 5.
        const right = line.x1 > box.x1 + 1;
        for (const end of ends) {
          if (right) expect(end.x1).toBeLessThanOrEqual(line.x1 - 5);
          else expect(end.y1).toBeLessThanOrEqual(line.y1 - 5);
        }
        expect(overlap(ends[0]!, ends[1]!)).toBe(false);
        const labels = tree
          .find({ class: 'edgeLabel' })
          .map((g) => rectBox(tree, tree.children(g).find((c) => tree.tag(c) === 'rect')!));
        expect(labels).toHaveLength(1);
        for (const end of ends) expect(overlap(end, labels[0]!)).toBe(false);
      });
    }
  }
});

describe('ER ends along one side of an entity', () => {
  const seven = Array.from({ length: 7 }, (_, i) => `A ||--o{ X${i} : r${i}`).join('\n');
  const FANS = [
    ['three zero or more ends, TB', 'erDiagram\nA }o--o{ B : x\nA }o--o{ C : y\nA }o--o{ D : z'],
    [
      'three zero or more ends, LR',
      'erDiagram\ndirection LR\nA }o--o{ B : x\nA }o--o{ C : y\nA }o--o{ D : z',
    ],
    ['seven only one ends, TB', `erDiagram\n${seven}`],
    ['seven only one ends, LR', `erDiagram\ndirection LR\n${seven}`],
  ] as const;

  for (const [name, source] of FANS) {
    it(`never overlap (${name})`, async () => {
      const tree = await render(source);
      const atA = relationships(tree).map((r) => r.ends[0]!);
      for (let i = 0; i < atA.length; i++) {
        for (let j = i + 1; j < atA.length; j++) {
          expect(overlap(atA[i]!, atA[j]!), `ends ${i} and ${j}`).toBe(false);
        }
      }
    });
  }

  it('draws ends full size when the side has room (16 + 2 bars, v12)', async () => {
    const tree = await render('erDiagram\nA ||--o{ B : x\nA ||--o{ C : y');
    for (const { ends } of relationships(tree)) {
      const e = ends[0]!;
      expect(Math.max(e.x1 - e.x0, e.y1 - e.y0)).toBeCloseTo(18, 5);
    }
  });
});
