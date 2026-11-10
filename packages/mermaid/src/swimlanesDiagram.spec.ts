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
import { CORE_DEFAULTS } from '@mermaid-js/core/config';
import { layered, type LayoutEngine } from '@mermaid-js/core/layout';
import { flowchartConfigDefaults } from '@mermaid-js/diagram-flowchart';
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

  it('preloads its default layout with the type, so renderSync draws it', async () => {
    const text = 'swimlane-beta LR\n  subgraph Sales\n    A --> B\n  end';
    const m = createMermaid();
    await m.preload({ types: ['swimlane'] });
    const r = m.renderSync(text, { id: 's' });
    expect(r.warnings).toEqual([]);
    expect(r.svg).toBe((await createMermaid().render('s', text)).svg);
  });

  it('preloads no ELK for `flowchart`: the default layout is per type, not per plugin', async () => {
    const loads: string[] = [];
    const m = createMermaid();
    m.registerLayoutLoaders([
      { name: 'elk', loader: () => (loads.push('elk'), Promise.resolve(layered)) },
    ]);
    await m.preload({ types: ['flowchart'] });
    await m.preload({ types: ['flowchart-v2'] });
    expect(loads).toEqual([]);
    await m.preload({ types: ['flowchart-elk'] });
    expect(loads).toEqual(['elk']);
  });

  it('may take `layered` or `elk` (D535)', async () => {
    const m = createMermaid();
    const byLayered = await m.render('s', `---\nconfig:\n  layout: layered\n---\n${SWIMLANE}`);
    expect(byLayered.warnings).toEqual([]);
    expect(byLayered.svg).toBe(
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
  });

  // config-snapshot.ts puts no swimlane defaults over flowchart's plugin defaults (R-PERF-1): on
  // the keys both sections resolve together the two defaults must agree, or the order would show.
  it("agrees with flowchart's defaults on every key both sections resolve", () => {
    const own = CORE_DEFAULTS.swimlane as Record<string, unknown>;
    const flow = flowchartConfigDefaults as Record<string, unknown>;
    for (const key of ['theme', 'layout', 'useMaxWidth', 'useWidth'])
      if (key in own && key in flow) expect(own[key], key).toEqual(flow[key]);
    expect(own.theme).toBe(flow.theme);
  });

  describe('section layering: flowchart defaults < swimlane defaults < flowchart.* < swimlane.*', () => {
    const front = (yaml: string) => `---\nconfig:\n${yaml}\n---\n${SWIMLANE}`;

    it('lets an author flowchart.layout or flowchart.theme move it, unless swimlane.* is set', async () => {
      const m = createMermaid();
      const elk = await m.prepare(front('  flowchart:\n    layout: elk'));
      expect(elk.config.layout).toBe('elk');
      expect(elk.config.swimlane?.layout).toBe('elk');
      const both = await m.prepare(
        front('  flowchart:\n    layout: elk\n  swimlane:\n    layout: dagre')
      );
      expect(both.config.layout).toBe('dagre');
      expect(both.config.flowchart?.layout).toBe('dagre');
      const dark = await m.prepare(front('  flowchart:\n    theme: dark'));
      expect(dark.config.theme).toBe('dark');
      const themes = await m.prepare(
        front('  flowchart:\n    theme: dark\n  swimlane:\n    theme: forest')
      );
      expect(themes.config.theme).toBe('forest');
      // A plain flowchart reads no swimlane.* at all.
      const flow = await m.prepare(
        `---\nconfig:\n  swimlane:\n    theme: forest\n---\n${FLOWCHART}`
      );
      expect(flow.config.theme).toBe('redux-color');
    });

    it('resolves a key both sections have (useMaxWidth) the same way, into both', async () => {
      const m = createMermaid();
      const flow = await m.prepare(front('  flowchart:\n    useMaxWidth: false'));
      expect(flow.config.flowchart?.useMaxWidth).toBe(false);
      expect(flow.config.swimlane?.useMaxWidth).toBe(false);
      const both = await m.prepare(
        front('  flowchart:\n    useMaxWidth: false\n  swimlane:\n    useMaxWidth: true')
      );
      expect(both.config.flowchart?.useMaxWidth).toBe(true);
      const own = await m.prepare(front('  swimlane:\n    useMaxWidth: false'));
      expect(own.config.flowchart?.useMaxWidth).toBe(false);
      expect((await m.render('s', front('  swimlane:\n    useMaxWidth: false'))).svg).not.toMatch(
        /max-width/
      );
    });

    it('mirrors any swimlane.* key flowchart’s schema has too, with no default (useWidth)', async () => {
      const m = createMermaid();
      const own = await m.prepare(front('  swimlane:\n    useWidth: 500'));
      expect(own.config.flowchart?.useWidth).toBe(500);
      const both = await m.prepare(
        front('  flowchart:\n    useWidth: 300\n  swimlane:\n    useWidth: 500')
      );
      expect(both.config.flowchart?.useWidth).toBe(500);
      // An unscoped directive key in swimlane's schema goes there, then reaches flowchart.
      const init = await m.prepare(`%%{init: {"config": {"useWidth": 400}}}%%\n${SWIMLANE}`);
      expect(init.warnings).toEqual([]);
      expect(init.config.swimlane?.useWidth).toBe(400);
      expect(init.config.flowchart?.useWidth).toBe(400);
    });

    it('sends an unscoped %%{init: {config}}%% key to swimlane when its schema has it, else to flowchart', async () => {
      const m = createMermaid();
      const init = (config: string) => m.prepare(`%%{init: {"config": ${config}}}%%\n${SWIMLANE}`);
      const spacing = await init('{"nodeSpacing": 99, "layout": "dagre"}');
      expect(spacing.warnings).toEqual([]);
      expect(spacing.config.flowchart?.nodeSpacing).toBe(99);
      expect(spacing.config.swimlane?.layout).toBe('dagre');
      expect(spacing.config.layout).toBe('dagre');
      const tuning = await init('{"automaticLaneOrdering": true, "curve": "linear"}');
      expect(tuning.warnings).toEqual([]);
      expect(tuning.config.swimlane?.automaticLaneOrdering).toBe(true);
      expect(tuning.config.flowchart?.curve).toBe('linear');
      // Through parse() too, which returns the text's own config.
      const parsed = await m.parse(`%%{init: {"config": {"nodeSpacing": 99}}}%%\n${SWIMLANE}`);
      expect(parsed.config).toEqual({ flowchart: { nodeSpacing: 99 } });
    });

    it('sends a swimlane schema key with no default (`look`) to swimlane, not flowchart', async () => {
      const m = createMermaid();
      const text = `%%{init: {"config": {"look": "neo", "nodeSpacing": 70}}}%%\n${SWIMLANE}`;
      const r = await m.prepare(text);
      expect(r.warnings.map((w) => [w.code, (w as { path?: string }).path])).toEqual([
        ['LOOK_REMOVED', 'swimlane.look'],
      ]);
      expect(r.config.flowchart?.nodeSpacing).toBe(70);
    });
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
