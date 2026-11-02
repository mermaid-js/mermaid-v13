import { describe, expect, expectTypeOf, it } from 'vitest';
import type { DiagramPlugin, LaidOut } from '@mermaid-js/core';
import type { LayoutModel } from '@mermaid-js/core/layout';
import { createMermaid, type ExtensionPlugin, type ExternalDiagram } from 'mermaid';
import { sankeyStub, type SankeyLayout, type SankeyModel } from './fixtures/sankey-stub.ts';

/**
 * Non-graph contract guard (DESIGN §15 item 23, R-PLUG-1/2, R-ARCH-3, D70): a stub
 * Sankey-shaped plugin with its own layout type keeps the plugin API from turning
 * flowchart-only. Type assertions are checked by `pnpm typecheck`.
 */
const SOURCE = 'stub-sankey\n  a,b,3\n  a,c,1\n  b,d,2\n';

/** A hook written for graph diagrams only: it widens graph layouts, leaves the rest alone. */
function graphOnly(seen: LaidOut[]): ExtensionPlugin {
  return {
    id: 'graph-only',
    postLayout(l) {
      seen.push(l);
      if (l.kind !== 'graph') return l;
      return { ...l, layout: { ...l.layout, width: l.layout.width + 100 } };
    },
  };
}

describe('non-graph plugin contract (DESIGN §15 item 23)', () => {
  it('DiagramPlugin<M, L> accepts a layout type that is not LayoutModel', () => {
    expectTypeOf<SankeyLayout>().not.toMatchTypeOf<LayoutModel>();
    expectTypeOf(sankeyStub).toEqualTypeOf<DiagramPlugin<SankeyModel, SankeyLayout>>();
    expectTypeOf(sankeyStub.layout).parameter(0).toEqualTypeOf<SankeyModel>();
    expectTypeOf(sankeyStub.render).parameter(1).toEqualTypeOf<SankeyLayout>();
    const registrable: ExternalDiagram = sankeyStub;
    expect(registrable.id).toBe('sankey-stub');
  });

  it('renders through the public API; postLayout receives kind "custom" with its own layout', async () => {
    const m = createMermaid();
    const seen: LaidOut[] = [];
    await m.registerExternalDiagrams([
      sankeyStub,
      {
        id: 'custom-reader',
        postLayout(l) {
          seen.push(l);
          return l;
        },
      },
    ]);
    expect(m.detectType(SOURCE)).toBe('sankey-stub');
    const r = await m.render('s', SOURCE);
    expect(r).toMatchObject({ diagramType: 'sankey-stub', width: 200, height: 60 });
    expect(seen).toHaveLength(1);
    const [laidOut] = seen;
    expect(laidOut).toMatchObject({ kind: 'custom', diagram: 'sankey-stub' });
    // Columns by depth: a | b c | d; each node's height is its throughput.
    expect((laidOut!.layout as SankeyLayout).columns).toEqual([['a'], ['b', 'c'], ['d']]);
    expect(r.svg).toContain('data-id="a"');
  });

  it('a graph-only postLayout hook passes the custom layout through unchanged', async () => {
    const bare = createMermaid();
    await bare.registerExternalDiagrams([sankeyStub]);
    const without = await bare.render('s', SOURCE);

    const m = createMermaid();
    const seen: LaidOut[] = [];
    const captured: SankeyLayout[] = [];
    await m.registerExternalDiagrams([
      graphOnly(seen),
      {
        id: 'capture',
        postLayout(l) {
          if (l.kind === 'custom') captured.push(l.layout as SankeyLayout);
          return l;
        },
      },
      sankeyStub,
    ]);
    const withHook = await m.render('s', SOURCE);

    expect(seen.map((l) => l.kind)).toEqual(['custom']);
    // The very object the plugin's layout returned reaches the next hook.
    expect(captured).toEqual([seen[0]!.layout]);
    expect(captured[0]).toBe(seen[0]!.layout);
    expect(withHook.svg).toBe(without.svg);
    expect(withHook.width).toBe(without.width);
  });
});
