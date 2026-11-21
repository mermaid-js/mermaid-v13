import { beforeAll, describe, expect, it } from 'vitest';
import type { SafeColor } from '@mermaid-js/core/svg';
import type { Theme } from '@mermaid-js/core/theme';
import { parseSankey } from '../parser/index.ts';
import { sankeyTestContext, sankeyTestTheme } from '../test-context.ts';
import { layoutSankey, type SankeyLayout } from './index.ts';
import { sankeyLayoutViolations } from './invariants.ts';
import { TABLEAU10 } from './metrics.ts';

let theme: Theme;
beforeAll(async () => {
  theme = await sankeyTestTheme();
});

// a → b, a → c, b → c, c → d: three layers, a column of two.
const { model } = parseSankey('sankey\na,b,3\na,c,2\nb,c,3\nc,d,5\nx,d,1');
const ok = (): SankeyLayout => layoutSankey(model, sankeyTestContext(theme));
const broken = (f: (l: SankeyLayout) => SankeyLayout): string[] =>
  sankeyLayoutViolations(model, f(ok()));
const at = <T>(xs: readonly T[], i: number, f: (x: T) => T): T[] =>
  xs.map((x, k) => (k === i ? f(x) : x));

describe('sankeyLayoutViolations', () => {
  it('passes the layout as laid out', () => {
    expect(sankeyLayoutViolations(model, ok())).toEqual([]);
  });

  it('catches a NaN anywhere', () => {
    expect(broken((l) => ({ ...l, nodes: at(l.nodes, 1, (n) => ({ ...n, y1: NaN })) }))).toContain(
      'layout.nodes[1].y1 is NaN'
    );
  });

  it('catches a node outside the extent, and nodes overlapping in a layer', () => {
    // x and a share layer 0: put x on a; push d 500 px down.
    const v = broken((l) => {
      const a = l.nodes[0]!;
      return {
        ...l,
        nodes: l.nodes.map((n) => {
          if (n.id === 'x') return { ...n, y0: a.y0, y1: a.y0 + n.y1 - n.y0 };
          if (n.id === 'd') return { ...n, y0: n.y0 + 500, y1: n.y1 + 500 };
          return n;
        }),
      };
    });
    expect(v).toEqual(
      expect.arrayContaining([
        'node d is outside the extent',
        expect.stringMatching(/^nodes [ax] and [ax] are .* apart in layer 0$/),
      ])
    );
  });

  it('catches a height not proportional to the value', () => {
    const v = broken((l) => ({ ...l, nodes: at(l.nodes, 0, (n) => ({ ...n, y1: n.y1 - 5 })) }));
    expect(v.some((x) => x.startsWith('node a is'))).toBe(true);
  });

  it('catches a link off its source edge or its target edge', () => {
    const v = broken((l) => ({
      ...l,
      links: at(l.links, 0, (k) => ({
        ...k,
        path: { ...k.path, from: { ...k.path.from, x: k.path.from.x + 1 } },
      })),
    }));
    expect(v).toContain("link 0 does not start on a's right edge");
  });

  it('catches link widths that do not sum to the node height', () => {
    // Half of c → d: c's in side still fills it, d's does not.
    const v = broken((l) => ({
      ...l,
      links: at(l.links, 3, (k) => ({ ...k, width: k.width / 2 })),
    }));
    expect(v).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^the links at d are [\d.]+ wide, not 373$/),
        expect.stringMatching(/^link 3 is [\d.]+ wide$/),
      ])
    );
  });

  it('catches a wrong colour slot and contents outside the bounds', () => {
    const v = broken((l) => ({
      ...l,
      nodes: at(l.nodes, 2, (n) => ({ ...n, fill: TABLEAU10[5] as SafeColor })),
      bounds: { ...l.bounds, width: l.bounds.width / 2 },
    }));
    expect(v).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^node c is filled/),
        expect.stringContaining('outside the bounds'),
      ])
    );
  });

  it("catches bounds that leave out the outlined label's halo", () => {
    const section = { labelStyle: 'outlined' };
    const l = layoutSankey(model, sankeyTestContext(theme, section));
    expect(sankeyLayoutViolations(model, l, section)).toEqual([]);
    const tight = { ...l, bounds: { ...l.bounds, width: l.bounds.width - 1 } };
    expect(sankeyLayoutViolations(model, tight, section)).toEqual(
      expect.arrayContaining([expect.stringMatching(/label is outside the bounds$/)])
    );
  });
});
