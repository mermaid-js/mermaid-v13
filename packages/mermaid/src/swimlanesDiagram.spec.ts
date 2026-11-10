/**
 * v12's `swimlanesDiagram.spec.ts` (upstream c9b12739f), through `createMermaid()` (D534).
 * `swimlane-beta` is flowchart's syntax with the swimlane engine as its default layout: a
 * default below every config layer, so `layout: dagre` (top level, `swimlane.layout` or front
 * matter) moves it off. Its config section is `swimlane` on top of flowchart's.
 *
 * v12's second block (issue #8386: shared nodes and nested lanes, with their `log.warn`s) is
 * lane drawing and warnings, T2 (#598, D536).
 */
import { swimlane } from '@mermaid-js/core/layout/swimlane';
import type { LayoutEngine } from '@mermaid-js/core/layout';
import { describe, expect, it } from 'vitest';
import { createMermaid, detectType, type MermaidConfig } from './index.ts';

const SWIMLANE = 'swimlane-beta TD\n  A --> B';
const FLOWCHART = 'flowchart TD\n  A --> B';

/** A mermaid whose `swimlane` engine counts its calls, and the layout a render resolved. */
async function layoutFor(text: string, init?: MermaidConfig) {
  let calls = 0;
  const counted: LayoutEngine = (graph, ctx) => {
    calls++;
    return swimlane(graph, ctx);
  };
  const m = createMermaid();
  m.registerLayoutLoaders([{ name: 'swimlane', loader: () => Promise.resolve(counted) }]);
  if (init) m.initialize(init);
  const r = await m.render('s', text);
  expect(r.warnings).toEqual([]);
  const { config, diagramType } = await m.prepare(text);
  return { layout: config.layout, bySwimlane: calls > 0, diagramType, r };
}

describe('swimlanesDiagram', () => {
  it('defaults the shared flowchart renderer to the swimlane layout', async () => {
    const { layout, bySwimlane, diagramType, r } = await layoutFor(SWIMLANE);
    expect(layout).toBe('swimlane');
    expect(bySwimlane).toBe(true);
    // v12 reports the detected type.
    expect(diagramType).toBe('swimlane');
    expect(r.diagramType).toBe('swimlane');
  });

  it('leaves plain flowcharts on the global default layout', async () => {
    // v12's global default is `elk` in that spec's setup; v13's is `layered`.
    const { layout, bySwimlane, diagramType } = await layoutFor(FLOWCHART);
    expect(layout).toBe('layered');
    expect(bySwimlane).toBe(false);
    expect(diagramType).toBe('flowchart-v2');
  });

  it('keeps an explicit global layout override', async () => {
    const { layout, bySwimlane } = await layoutFor(SWIMLANE, { layout: 'dagre' });
    expect(layout).toBe('dagre');
    expect(bySwimlane).toBe(false);
  });

  it('keeps a diagram-scoped layout override', async () => {
    const { layout, bySwimlane } = await layoutFor(SWIMLANE, { swimlane: { layout: 'dagre' } });
    expect(layout).toBe('dagre');
    expect(bySwimlane).toBe(false);
  });

  it('keeps a layout set in the diagram frontmatter', async () => {
    const text = `---\nconfig:\n  layout: dagre\n---\n${SWIMLANE}`;
    const { layout, bySwimlane } = await layoutFor(text);
    expect(layout).toBe('dagre');
    expect(bySwimlane).toBe(false);
  });
});

describe('swimlane-beta registration (D534, D535)', () => {
  it('renders through flowchart, no longer UNSUPPORTED_DIAGRAM', async () => {
    expect(detectType(SWIMLANE)).toBe('swimlane');
    const text =
      'swimlane-beta LR\n  subgraph Sales\n    A --> B\n  end\n  subgraph Ops\n    C\n  end\n  B --> C';
    const m = createMermaid();
    const r = await m.render('s', text);
    expect(r.warnings).toEqual([]);
    expect(r.diagramType).toBe('swimlane');
    expect(r.svg).toContain('aria-roledescription="flowchart');
    // Prepared once, it draws synchronously; the engine is loaded.
    expect(m.renderSync(text, { id: 's' }).svg).toBe(r.svg);
    // With flowchart loaded but not the engine, renderSync asks for it, as for any lazy layout.
    const bare = createMermaid();
    await bare.preload({ types: ['flowchart'] });
    expect(() => bare.renderSync(text)).toThrow(/layout "swimlane"/);
  });

  it('may take `layered` or `elk` (D535)', async () => {
    const m = createMermaid();
    const layered = await m.render('s', `---\nconfig:\n  layout: layered\n---\n${SWIMLANE}`);
    expect(layered.warnings).toEqual([]);
    expect(layered.svg).toBe(
      (await m.render('s', `---\nconfig:\n  layout: dagre\n---\n${SWIMLANE}`)).svg
    );
    const elk = await m.render('s', `---\nconfig:\n  swimlane:\n    layout: elk\n---\n${SWIMLANE}`);
    // No ELK plugin here: layered draws it, as for any flowchart asking for ELK.
    expect(elk.warnings.map((w) => w.code)).toEqual(['ELK_NOT_INSTALLED']);
  });

  it('resolves the swimlane section on top of flowchart: swimlane.* defaults, flowchart.* keys', async () => {
    const m = createMermaid();
    const plain = await m.prepare(SWIMLANE);
    expect(plain.config.swimlane?.ignoreCrossLaneEdges).toBe(true);
    // Flowchart's own defaults stay in its section, not in swimlane's.
    expect(plain.config.flowchart?.curve).toBe('rounded');
    expect((plain.config.swimlane as Record<string, unknown> | undefined)?.curve).toBeUndefined();
    const keyed = `---\nconfig:\n  flowchart:\n    nodeSpacing: 120\n  swimlane:\n    automaticLaneOrdering: true\n---\n${SWIMLANE}`;
    const both = await m.prepare(keyed);
    expect(both.config.flowchart?.nodeSpacing).toBe(120);
    expect(both.config.swimlane?.automaticLaneOrdering).toBe(true);
    // `%%{init: {config}}` goes to the swimlane section, as v12's detectInit sent it.
    const init = await m.prepare(`%%{init: {"config": {"layout": "dagre"}}}%%\n${SWIMLANE}`);
    expect(init.config.swimlane?.layout).toBe('dagre');
    expect(init.config.layout).toBe('dagre');
  });

  it('draws rounded curves by default, and an author curve wins (v12 layoutCore.ts:47-51)', async () => {
    const m = createMermaid();
    // Edges that turn, so the curve shows.
    const body =
      'swimlane-beta TD\n  subgraph L1\n    A\n    D\n  end\n  subgraph L2\n    B\n    C\n  end\n  A --> B\n  A --> C\n  B --> D\n  C --> D';
    const curve = (c: string) => `---\nconfig:\n  flowchart:\n    curve: ${c}\n---\n${body}`;
    const byDefault = (await m.render('s', body)).svg;
    expect(byDefault).toBe((await m.render('s', curve('rounded'))).svg);
    expect((await m.render('s', curve('basis'))).svg).not.toBe(byDefault);
    expect((await m.render('s', curve('linear'))).svg).not.toBe(byDefault);
    // A plain flowchart asking for the engine gets the same default (D535).
    const flow = (extra: string) =>
      `---\nconfig:\n  layout: swimlane${extra}\n---\n${body.replace('swimlane-beta', 'flowchart')}`;
    const flowDefault = (await m.render('s', flow(''))).svg;
    expect(flowDefault).toBe((await m.render('s', flow('\n  flowchart:\n    curve: rounded'))).svg);
    expect(flowDefault).not.toBe(
      (await m.render('s', flow('\n  flowchart:\n    curve: basis'))).svg
    );
  });
});
